//! commands.rs, THE RUST SIDE OF THE FRONTEND↔RUST CONTRACT.
//!
//! One `#[tauri::command]` per function in `src/lib/bridge.ts`. Signatures
//! (name + args + return-JSON) are FROZEN, the Rust author fills the bodies but
//! must not rename functions, params, or change return shapes, or the typed
//! bridge breaks.
//!
//! Conventions (doc 05 §8):
//!   - Instants: UTC epoch-ms (`i64`). Durations: integer seconds. Money: cents.
//!   - IDs: UUIDv7 strings. Field names match doc 06 EXACTLY.
//!   - Tauri maps JS camelCase invoke args → these snake_case params.
//!
//! All persistence goes through the shared `db` module (rusqlite) so writes are
//! visible to the JS-side `tauri-plugin-sql` reads on the same file.
#![allow(unused_variables)]

use rusqlite::{params, Connection};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

use crate::db;

// ---- Small input (serde_json::Value) accessors -------------------------------

fn v_str(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| x.as_str()).map(|s| s.to_string())
}
fn v_i64(v: &Value, key: &str) -> Option<i64> {
    v.get(key).and_then(|x| x.as_i64())
}
fn v_f64(v: &Value, key: &str) -> Option<f64> {
    v.get(key).and_then(|x| x.as_f64())
}
fn v_bool(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(|x| x.as_bool())
}
/// Optional bool → optional INTEGER (0/1).
fn b2i(b: Option<bool>) -> Option<i64> {
    b.map(|x| if x { 1 } else { 0 })
}

/// Account default timezone (falls back to `Europe/Berlin`).
fn account_timezone(conn: &Connection) -> String {
    conn.query_row(
        "SELECT default_timezone FROM main_accounts WHERE id=?1",
        params![db::MAIN_ACCOUNT_ID],
        |r| r.get::<_, String>(0),
    )
    .unwrap_or_else(|_| "Europe/Berlin".to_string())
}

// ---- Database lifecycle (doc 05 §2.1) ----------------------------------

/// `db_init`, open/create the local SQLite DB at the app-data path.
/// Returns `{ ok, path, version }`.
#[tauri::command]
pub fn db_init() -> Result<Value, String> {
    let conn = db::open()?;
    db::run_migrations(&conn)?;
    let version = db::user_version(&conn)?;
    let path = db::db_path()?;
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "version": version,
    }))
}

/// `db_migrate`, apply pending migrations. Returns `{ ok, applied, version }`.
#[tauri::command]
pub fn db_migrate() -> Result<Value, String> {
    let conn = db::open()?;
    let applied = db::run_migrations(&conn)?;
    let version = db::user_version(&conn)?;
    Ok(json!({ "ok": true, "applied": applied, "version": version }))
}

/// Save a generated export into the user's Downloads folder without exposing
/// arbitrary filesystem paths to the webview.
#[tauri::command]
pub fn save_export_file(filename: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("export is empty".to_string());
    }
    let safe: String = filename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = if safe.to_ascii_lowercase().ends_with(".pdf") {
        safe
    } else {
        format!("{safe}.pdf")
    };
    let dir = dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Downloads-Ordner nicht gefunden".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create export directory: {e}"))?;
    let mut path = dir.join(&safe);
    if path.exists() {
        let stem = safe.trim_end_matches(".pdf");
        path = dir.join(format!("{stem}-{}.pdf", db::now_ms()));
    }
    std::fs::write(&path, bytes).map_err(|e| format!("write export: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

const MAX_PROJECT_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;

fn document_root() -> Result<PathBuf, String> {
    let db_path = db::db_path()?;
    let root = db_path
        .parent()
        .ok_or_else(|| "App-Datenverzeichnis nicht gefunden".to_string())?
        .join("attachments");
    std::fs::create_dir_all(&root).map_err(|e| format!("Dokumentenordner anlegen: {e}"))?;
    Ok(root)
}

fn safe_document_filename(filename: &str) -> Result<String, String> {
    let leaf = Path::new(filename)
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Ungültiger Dateiname".to_string())?;
    let safe: String = leaf
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' ') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = safe.trim().trim_matches('.').to_string();
    if safe.is_empty() || safe.len() > 180 {
        return Err("Der Dateiname ist leer oder zu lang".to_string());
    }
    Ok(safe)
}

fn allowed_document_extension(filename: &str) -> Result<&'static str, String> {
    let extension = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "Dateien ohne unterstützte Endung sind nicht erlaubt".to_string())?;
    match extension.as_str() {
        "pdf" => Ok("pdf"),
        "doc" => Ok("doc"),
        "docx" => Ok("docx"),
        "txt" => Ok("txt"),
        "md" => Ok("md"),
        "rtf" => Ok("rtf"),
        "pages" => Ok("pages"),
        "xlsx" => Ok("xlsx"),
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        _ => Err("Dieser Dateityp ist nicht erlaubt. Unterstützt werden PDF, Office-Dokumente, Text und Bilder.".to_string()),
    }
}

fn validate_document_scope(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), String> {
    if entity_id.len() != 36 || !entity_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("Ungültige Projektkennung".to_string());
    }
    let table = match entity_type {
        "project" => "projects",
        "task" => "tasks",
        _ => return Err("Dokumente sind nur für Projekte und Teilprojekte erlaubt".to_string()),
    };
    let exists: i64 = conn
        .query_row(
            &format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id=?1 AND main_account_id=?2 AND deleted_at IS NULL)"),
            params![entity_id, db::MAIN_ACCOUNT_ID],
            |row| row.get(0),
        )
        .map_err(|e| format!("Ziel prüfen: {e}"))?;
    if exists == 0 {
        return Err("Projekt oder Teilprojekt wurde nicht gefunden".to_string());
    }
    Ok(())
}

/// Copy an explicitly selected webview file into Tarlog's private app-data
/// directory and persist integrity metadata. Arbitrary destination paths are
/// deliberately not accepted.
#[tauri::command]
pub fn project_document_import(
    entity_type: String,
    entity_id: String,
    category: String,
    filename: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<Value, String> {
    if bytes.is_empty() {
        return Err("Die ausgewählte Datei ist leer".to_string());
    }
    if bytes.len() > MAX_PROJECT_DOCUMENT_BYTES {
        return Err("Die Datei ist größer als 20 MB".to_string());
    }
    let category = match category.as_str() {
        "lastenheft" | "pflichtenheft" | "angebot" | "entwurf" | "sonstiges" => category,
        _ => return Err("Unbekannte Dokumentkategorie".to_string()),
    };
    let filename = safe_document_filename(&filename)?;
    allowed_document_extension(&filename)?;
    let conn = db::open()?;
    validate_document_scope(&conn, &entity_type, &entity_id)?;
    let id = db::new_uuid();
    let root = document_root()?;
    let root = root
        .canonicalize()
        .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
    let scope_dir = root.join(&entity_type).join(&entity_id);
    std::fs::create_dir_all(&scope_dir).map_err(|e| format!("Dokumentenordner anlegen: {e}"))?;
    let scope_dir = scope_dir
        .canonicalize()
        .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
    if !scope_dir.starts_with(&root) {
        return Err("Unsicherer Dokumentpfad wurde abgelehnt".to_string());
    }
    let relative_path = PathBuf::from(&entity_type)
        .join(&entity_id)
        .join(format!("{id}--{filename}"));
    let path = root.join(&relative_path);
    std::fs::write(&path, &bytes).map_err(|e| format!("Dokument speichern: {e}"))?;
    let checksum = format!("{:x}", Sha256::digest(&bytes));
    let now = db::now_ms();
    let stored_type = format!("{entity_type}_document:{category}");
    let result = conn.execute(
        "INSERT INTO attachments (id, main_account_id, entity_type, entity_id, filename, mime_type, storage_path, size_bytes, checksum_sha256, created_at, updated_at, sync_version, local_revision, last_modified_by_device) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,0,0,?11)",
        params![id, db::MAIN_ACCOUNT_ID, stored_type, entity_id, filename, if mime_type.trim().is_empty() { "application/octet-stream" } else { &mime_type }, relative_path.to_string_lossy(), bytes.len() as i64, checksum, now, db::DEVICE_ID],
    );
    if let Err(error) = result {
        let _ = std::fs::remove_file(&path);
        return Err(format!("Dokument registrieren: {error}"));
    }
    Ok(
        json!({ "id": id, "filename": filename, "sizeBytes": bytes.len(), "checksumSha256": checksum }),
    )
}

fn stored_document_path(conn: &Connection, id: &str) -> Result<String, String> {
    conn.query_row(
        "SELECT storage_path FROM attachments WHERE id=?1 AND main_account_id=?2 AND deleted_at IS NULL",
        params![id, db::MAIN_ACCOUNT_ID], |row| row.get(0),
    ).map_err(|_| "Dokument wurde nicht gefunden".to_string())
}

/// Validate the persisted path lexically and, while its parent still exists,
/// canonically. Unlike the open path this deliberately does not require the
/// document file itself to exist, so stale metadata can still be removed.
fn validated_stored_document_path(stored: &str) -> Result<PathBuf, String> {
    let root = document_root()?
        .canonicalize()
        .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
    let stored_path = PathBuf::from(stored);
    if stored_path.components().any(|component| {
        matches!(
            component,
            std::path::Component::ParentDir | std::path::Component::CurDir
        )
    }) {
        return Err("Unsicherer Dokumentpfad wurde abgelehnt".to_string());
    }
    let path = if stored_path.is_absolute() {
        stored_path
    } else {
        root.join(stored_path)
    };
    if !path.starts_with(&root) {
        return Err("Unsicherer Dokumentpfad wurde abgelehnt".to_string());
    }
    if let Some(parent) = path.parent().filter(|parent| parent.exists()) {
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
        if !canonical_parent.starts_with(&root) {
            return Err("Unsicherer Dokumentpfad wurde abgelehnt".to_string());
        }
    }
    Ok(path)
}

fn verified_document_path(id: &str) -> Result<PathBuf, String> {
    let conn = db::open()?;
    let stored = stored_document_path(&conn, id)?;
    let root = document_root()?
        .canonicalize()
        .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
    let path = validated_stored_document_path(&stored)?
        .canonicalize()
        .map_err(|_| "Die Dokumentdatei fehlt".to_string())?;
    if !path.starts_with(&root) {
        return Err("Unsicherer Dokumentpfad wurde abgelehnt".to_string());
    }
    Ok(path)
}

fn soft_delete_document_metadata(conn: &Connection, id: &str, now: i64) -> Result<String, String> {
    conn.query_row(
        "UPDATE attachments SET deleted_at=?1, updated_at=?1, last_modified_by_device=?2
          WHERE id=?3 AND main_account_id=?4 AND deleted_at IS NULL
          RETURNING storage_path",
        params![now, db::DEVICE_ID, id, db::MAIN_ACCOUNT_ID],
        |row| row.get(0),
    )
    .map_err(|_| "Dokument wurde nicht gefunden".to_string())
}

fn remove_document_file_best_effort(path: &Path) -> Result<(), String> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Datei konnte nicht gelöscht werden: {error}")),
    }
}

#[tauri::command]
pub fn project_document_open(id: String) -> Result<(), String> {
    let path = verified_document_path(&id)?;
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(&path).status();
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(&path)
        .status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = std::process::Command::new("xdg-open").arg(&path).status();
    let status = status.map_err(|e| format!("Dokument öffnen: {e}"))?;
    if !status.success() {
        return Err("Das Dokument konnte nicht geöffnet werden".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn project_document_delete(id: String) -> Result<Value, String> {
    let conn = db::open()?;
    let now = db::now_ms();
    // Metadata is the source of truth for the UI and is removed first. File
    // cleanup is intentionally best-effort so a manually moved/deleted file
    // can never leave an undeletable document row behind.
    let stored = soft_delete_document_metadata(&conn, &id, now)?;
    let path = match validated_stored_document_path(&stored) {
        Ok(path) => path,
        Err(error) => {
            return Ok(json!({
                "deleted": true,
                "warning": format!("Datei nicht gelöscht: {error}")
            }))
        }
    };
    match remove_document_file_best_effort(&path) {
        Ok(()) => Ok(json!({ "deleted": true, "warning": null })),
        Err(error) => Ok(json!({ "deleted": true, "warning": error })),
    }
}

#[cfg(test)]
mod document_tests {
    use super::{
        allowed_document_extension, remove_document_file_best_effort, safe_document_filename,
        soft_delete_document_metadata,
    };
    use crate::db;
    use rusqlite::{params, Connection};

    #[test]
    fn document_filename_drops_paths_and_shell_characters() {
        assert_eq!(
            safe_document_filename("../../Briefing & Angebot.pdf").unwrap(),
            "Briefing _ Angebot.pdf"
        );
        assert_eq!(safe_document_filename(".env").unwrap(), "env");
    }

    #[test]
    fn document_filename_rejects_empty_names() {
        assert!(safe_document_filename("...").is_err());
    }

    #[test]
    fn document_extension_allowlist_rejects_executables_and_unknown_files() {
        assert_eq!(allowed_document_extension("Konzept.PDF").unwrap(), "pdf");
        assert_eq!(allowed_document_extension("Foto.jpeg").unwrap(), "jpg");
        assert!(allowed_document_extension("installer.exe").is_err());
        assert!(allowed_document_extension("archive.zip").is_err());
        assert!(allowed_document_extension("README").is_err());
    }

    #[test]
    fn soft_delete_cleans_metadata_even_when_the_file_is_already_missing() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE attachments (
               id TEXT PRIMARY KEY, main_account_id TEXT NOT NULL, storage_path TEXT NOT NULL,
               deleted_at INTEGER, updated_at INTEGER NOT NULL, last_modified_by_device TEXT
             );",
        )
        .unwrap();
        let missing = std::env::temp_dir().join("tarlog-document-that-does-not-exist.pdf");
        conn.execute(
            "INSERT INTO attachments(id, main_account_id, storage_path, updated_at)
             VALUES (?1, ?2, ?3, 0)",
            params!["doc", db::MAIN_ACCOUNT_ID, missing.to_string_lossy()],
        )
        .unwrap();

        let stored = soft_delete_document_metadata(&conn, "doc", 123).unwrap();
        assert_eq!(stored, missing.to_string_lossy());
        assert_eq!(
            conn.query_row(
                "SELECT deleted_at FROM attachments WHERE id='doc'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            123
        );
        assert!(!missing.exists());
        assert!(remove_document_file_best_effort(&missing).is_ok());
    }

    #[test]
    fn filesystem_error_does_not_roll_back_soft_deleted_metadata() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE attachments (
               id TEXT PRIMARY KEY, main_account_id TEXT NOT NULL, storage_path TEXT NOT NULL,
               deleted_at INTEGER, updated_at INTEGER NOT NULL, last_modified_by_device TEXT
             );",
        )
        .unwrap();
        let directory = std::env::temp_dir().join(format!("tarlog-delete-test-{}", db::new_uuid()));
        std::fs::create_dir_all(&directory).unwrap();
        conn.execute(
            "INSERT INTO attachments(id, main_account_id, storage_path, updated_at)
             VALUES (?1, ?2, ?3, 0)",
            params!["doc", db::MAIN_ACCOUNT_ID, directory.to_string_lossy()],
        )
        .unwrap();

        soft_delete_document_metadata(&conn, "doc", 456).unwrap();
        assert!(remove_document_file_best_effort(&directory).is_err());
        assert_eq!(
            conn.query_row(
                "SELECT deleted_at FROM attachments WHERE id='doc'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            456
        );
        std::fs::remove_dir(&directory).unwrap();
    }
}

// ---- Timer state machine (doc 03, doc 06 `timer_states`) ----------------

/// `timer_start`, start the singleton timer. Returns the `TimerState`.
#[tauri::command]
pub fn timer_start(
    project_id: Option<String>,
    task_id: Option<String>,
    description: Option<String>,
    started_at: Option<i64>,
) -> Result<Value, String> {
    let conn = db::open()?;
    let status: String = conn
        .query_row(
            "SELECT status FROM timer_states WHERE timer_id=?1",
            params![db::TIMER_ID],
            |r| r.get(0),
        )
        .map_err(|e| format!("read timer: {e}"))?;
    if status == "running" || status == "paused" {
        // 409-style: refuse to clobber an active timer.
        return Err(format!("409 timer already {status}"));
    }
    let started = started_at.unwrap_or_else(db::now_ms);
    conn.execute(
        "UPDATE timer_states SET status='running', started_at=?2, project_id=?3, task_id=?4, \
         current_time_entry_id=NULL, accumulated_pause_seconds=0, paused_at=NULL, \
         active_pause_started_at=NULL, last_modified_by_device=?5 WHERE timer_id=?1",
        params![db::TIMER_ID, started, project_id, task_id, db::DEVICE_ID],
    )
    .map_err(|e| format!("start timer: {e}"))?;
    db::read_timer_state(&conn)
}

/// `timer_pause`, pause the running timer. Returns the `TimerState`.
#[tauri::command]
pub fn timer_pause(at: Option<i64>) -> Result<Value, String> {
    let conn = db::open()?;
    let status: String = conn
        .query_row(
            "SELECT status FROM timer_states WHERE timer_id=?1",
            params![db::TIMER_ID],
            |r| r.get(0),
        )
        .map_err(|e| format!("read timer: {e}"))?;
    if status != "running" {
        return Err(format!("409 cannot pause from {status}"));
    }
    let at = at.unwrap_or_else(db::now_ms);
    conn.execute(
        "UPDATE timer_states SET status='paused', paused_at=?2, active_pause_started_at=?2, \
         last_modified_by_device=?3 WHERE timer_id=?1",
        params![db::TIMER_ID, at, db::DEVICE_ID],
    )
    .map_err(|e| format!("pause timer: {e}"))?;
    db::read_timer_state(&conn)
}

/// `timer_resume`, resume a paused timer. Returns the `TimerState`.
#[tauri::command]
pub fn timer_resume(at: Option<i64>) -> Result<Value, String> {
    let conn = db::open()?;
    let (status, acc, aps): (String, i64, Option<i64>) = conn
        .query_row(
            "SELECT status, accumulated_pause_seconds, active_pause_started_at \
             FROM timer_states WHERE timer_id=?1",
            params![db::TIMER_ID],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| format!("read timer: {e}"))?;
    if status != "paused" {
        return Err(format!("409 cannot resume from {status}"));
    }
    let at = at.unwrap_or_else(db::now_ms);
    let paused_since = aps.unwrap_or(at);
    let acc2 = acc + ((at - paused_since) / 1000).max(0);
    conn.execute(
        "UPDATE timer_states SET status='running', accumulated_pause_seconds=?2, \
         active_pause_started_at=NULL, paused_at=NULL, last_modified_by_device=?3 \
         WHERE timer_id=?1",
        params![db::TIMER_ID, acc2, db::DEVICE_ID],
    )
    .map_err(|e| format!("resume timer: {e}"))?;
    db::read_timer_state(&conn)
}

/// `timer_stop`, stop + finalize the entry. Returns `{ timer, entry }`.
#[tauri::command]
pub fn timer_stop(description: Option<String>, at: Option<i64>) -> Result<Value, String> {
    let conn = db::open()?;
    let (status, started_at, acc, aps, project_id, task_id): (
        String,
        Option<i64>,
        i64,
        Option<i64>,
        Option<String>,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT status, started_at, accumulated_pause_seconds, active_pause_started_at, \
             project_id, task_id FROM timer_states WHERE timer_id=?1",
            params![db::TIMER_ID],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                ))
            },
        )
        .map_err(|e| format!("read timer: {e}"))?;
    if status != "running" && status != "paused" {
        return Err(format!("409 cannot stop from {status}"));
    }
    let ended = at.unwrap_or_else(db::now_ms);
    let started = started_at.unwrap_or(ended);
    // If stopped while paused, count the still-open pause into the accumulator.
    let mut break_secs = acc;
    if status == "paused" {
        if let Some(s) = aps {
            break_secs += ((ended - s) / 1000).max(0);
        }
    }
    let actual = ((ended - started) / 1000).max(0);
    let net = (actual - break_secs).max(0);
    let billing = net; // TS side re-derives rounding via @tarlog/core.
    let tz = account_timezone(&conn);
    let id = db::new_uuid();
    let now = db::now_ms();
    // A project-specific task doubles as a billable work package/part-project.
    // Its default wins over the project, while non-billable projects remain
    // non-billable when no task override exists.
    let task_billable = task_id.as_ref().and_then(|id| {
        conn.query_row(
            "SELECT default_billable FROM tasks WHERE id=?1 AND deleted_at IS NULL LIMIT 1",
            params![id],
            |row| row.get::<_, i64>(0),
        )
        .ok()
    });
    let project_billable = project_id.as_ref().and_then(|id| {
        conn.query_row(
            "SELECT CASE WHEN billing_type='non_billable' THEN 0 ELSE 1 END FROM projects WHERE id=?1 AND deleted_at IS NULL LIMIT 1",
            params![id],
            |row| row.get::<_, i64>(0),
        ).ok()
    });
    let is_billable = task_billable.or(project_billable).unwrap_or(1);
    conn.execute(
        "INSERT INTO time_entries(\
         id, main_account_id, project_id, task_id, status, timezone, \
         actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds, \
         net_work_duration_seconds, billing_duration_seconds, calculation_version, \
         description, is_billable, source, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, 'stopped', ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?13, \
         'live_timer', ?14, ?14)",
        params![
            id,
            db::MAIN_ACCOUNT_ID,
            project_id,
            task_id,
            tz,
            started,
            ended,
            actual,
            break_secs,
            net,
            billing,
            description,
            is_billable,
            now,
        ],
    )
    .map_err(|e| format!("insert entry: {e}"))?;
    conn.execute(
        "UPDATE timer_states SET status='idle', current_time_entry_id=NULL, project_id=NULL, \
         task_id=NULL, started_at=NULL, paused_at=NULL, active_pause_started_at=NULL, \
         accumulated_pause_seconds=0, last_modified_by_device=?2 WHERE timer_id=?1",
        params![db::TIMER_ID, db::DEVICE_ID],
    )
    .map_err(|e| format!("reset timer: {e}"))?;
    db::audit(&conn, "timer_stopped", "time_entries", &id, None);
    let timer = db::read_timer_state(&conn)?;
    let entry = db::time_entry_by_id(&conn, &id)?.unwrap_or(Value::Null);
    Ok(json!({ "timer": timer, "entry": entry }))
}

/// `timer_get_state`, read the current timer singleton. Returns `TimerState`.
#[tauri::command]
pub fn timer_get_state() -> Result<Value, String> {
    let conn = db::open()?;
    db::read_timer_state(&conn)
}

// ---- Entries (doc 03 §7 backdate, doc 06 A.3) ---------------------------

/// `entry_backdate`, create a manually backdated entry from `input`
/// (`BackdateEntryInput`). Returns the persisted `TimeEntryRow`.
#[tauri::command]
pub fn entry_backdate(input: Value) -> Result<Value, String> {
    let mut conn = db::open()?;
    let started = v_i64(&input, "started_at")
        .or_else(|| v_i64(&input, "actual_started_at"))
        .ok_or_else(|| "entry_backdate: started_at required".to_string())?;
    let ended = v_i64(&input, "ended_at")
        .or_else(|| v_i64(&input, "actual_ended_at"))
        .ok_or_else(|| "entry_backdate: ended_at required".to_string())?;
    let project_id = v_str(&input, "project_id");
    let task_id = v_str(&input, "task_id");
    let customer_id = v_str(&input, "customer_id");
    let description = v_str(&input, "description");
    let reason = v_str(&input, "reason").or_else(|| v_str(&input, "backdate_reason"));
    let tz = v_str(&input, "timezone").unwrap_or_else(|| account_timezone(&conn));
    let is_billable = b2i(v_bool(&input, "is_billable")).unwrap_or(1);
    if ended <= started {
        return Err("Endzeit muss nach der Startzeit liegen.".to_string());
    }
    let parsed_breaks = parsed_backdate_breaks(&input, started, ended)?;
    // Keep the explicit duration fallback for legacy bridge callers. New UI
    // calls always send exact break spans.
    let break_secs = if input.get("breaks").and_then(Value::as_array).is_some() {
        parsed_breaks
            .iter()
            .map(|(s, e)| ((e - s) / 1000).max(0))
            .sum()
    } else {
        v_i64(&input, "break_duration_seconds").unwrap_or(0)
    };
    let actual = ((ended - started) / 1000).max(0);
    let net = (actual - break_secs).max(0);
    let billing = net;
    let id = db::new_uuid();
    let now = db::now_ms();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "INSERT INTO time_entries(\
         id, main_account_id, project_id, task_id, customer_id, status, timezone, \
         actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds, \
         net_work_duration_seconds, billing_duration_seconds, calculation_version, \
         description, is_billable, source, backdate_reason, is_backdated, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, ?5, 'stopped', ?6, ?7, ?8, ?9, ?10, ?11, ?12, 1, ?13, ?14, \
         'manual_backdated', ?15, 1, ?16, ?16)",
        params![
            id,
            db::MAIN_ACCOUNT_ID,
            project_id,
            task_id,
            customer_id,
            tz,
            started,
            ended,
            actual,
            break_secs,
            net,
            billing,
            description,
            is_billable,
            reason,
            now,
        ],
    )
    .map_err(|e| format!("insert backdated entry: {e}"))?;
    replace_backdate_breaks(&tx, &id, started, ended, &input)?;
    db::audit(
        &tx,
        "entry_backdated",
        "time_entries",
        &id,
        reason.as_deref(),
    );
    tx.commit().map_err(|error| error.to_string())?;
    db::time_entry_by_id(&conn, &id)?
        .ok_or_else(|| "entry_backdate: row vanished after insert".to_string())
}

fn parsed_backdate_breaks(
    input: &Value,
    started: i64,
    ended: i64,
) -> Result<Vec<(i64, i64)>, String> {
    let Some(items) = input.get("breaks").and_then(Value::as_array) else {
        return Ok(Vec::new());
    };
    items
        .iter()
        .map(|item| {
            let break_start = item
                .get("started_at")
                .and_then(Value::as_i64)
                .ok_or_else(|| "Pausenstart fehlt".to_string())?;
            let break_end = item
                .get("ended_at")
                .and_then(Value::as_i64)
                .ok_or_else(|| "Pausenende fehlt".to_string())?;
            if break_start < started || break_end > ended || break_end <= break_start {
                return Err(
                    "Die Pause muss vollständig innerhalb des Arbeitszeitraums liegen.".to_string(),
                );
            }
            Ok((break_start, break_end))
        })
        .collect()
}

fn replace_backdate_breaks(
    conn: &Connection,
    entry_id: &str,
    started: i64,
    ended: i64,
    input: &Value,
) -> Result<(), String> {
    let breaks = parsed_backdate_breaks(input, started, ended)?;
    conn.execute(
        "DELETE FROM time_entry_breaks WHERE time_entry_id=?1 AND main_account_id=?2",
        params![entry_id, db::MAIN_ACCOUNT_ID],
    )
    .map_err(|error| format!("Pausen konnten nicht ersetzt werden: {error}"))?;
    let now = db::now_ms();
    for (break_start, break_end) in breaks {
        conn.execute(
            "INSERT INTO time_entry_breaks(\
             id, main_account_id, time_entry_id, started_at, ended_at, duration_seconds, kind, \
             counts_as_rest, created_at, updated_at, last_modified_by_device) \
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, 'manual', 1, ?7, ?7, ?8)",
            params![
                db::new_uuid(),
                db::MAIN_ACCOUNT_ID,
                entry_id,
                break_start,
                break_end,
                ((break_end - break_start) / 1000).max(0),
                now,
                db::DEVICE_ID,
            ],
        )
        .map_err(|error| format!("Pause konnte nicht gespeichert werden: {error}"))?;
    }
    Ok(())
}

/// Update a previously backdated entry. Live timer entries and invoiced rows
/// are deliberately excluded from this editor.
#[tauri::command]
pub fn entry_backdate_update(input: Value) -> Result<Value, String> {
    let id = v_str(&input, "id").ok_or_else(|| "Nachtrags-ID fehlt".to_string())?;
    let started = v_i64(&input, "started_at")
        .or_else(|| v_i64(&input, "actual_started_at"))
        .ok_or_else(|| "Startzeit fehlt".to_string())?;
    let ended = v_i64(&input, "ended_at")
        .or_else(|| v_i64(&input, "actual_ended_at"))
        .ok_or_else(|| "Endzeit fehlt".to_string())?;
    if ended <= started {
        return Err("Endzeit muss nach der Startzeit liegen.".to_string());
    }

    let mut conn = db::open()?;
    let editable: bool = conn
        .query_row(
            "SELECT is_backdated = 1 AND invoice_id IS NULL FROM time_entries \
             WHERE id=?1 AND main_account_id=?2 AND deleted_at IS NULL LIMIT 1",
            params![id, db::MAIN_ACCOUNT_ID],
            |row| row.get(0),
        )
        .map_err(|_| {
            "Nachtrag wurde nicht gefunden oder ist nicht mehr bearbeitbar.".to_string()
        })?;
    if !editable {
        return Err("Dieser Eintrag ist nicht als Nachtrag bearbeitbar.".to_string());
    }

    let breaks = parsed_backdate_breaks(&input, started, ended)?;
    let break_seconds: i64 = breaks
        .iter()
        .map(|(break_start, break_end)| ((break_end - break_start) / 1000).max(0))
        .sum();
    let actual_seconds = ((ended - started) / 1000).max(0);
    let net_seconds = (actual_seconds - break_seconds).max(0);
    let now = db::now_ms();
    let tx = conn.transaction().map_err(|error| error.to_string())?;
    tx.execute(
        "UPDATE time_entries SET project_id=?1, task_id=?2, customer_id=?3, timezone=?4, \
         actual_started_at=?5, actual_ended_at=?6, actual_duration_seconds=?7, \
         break_duration_seconds=?8, net_work_duration_seconds=?9, \
         billing_duration_seconds=?9, description=?10, is_billable=?11, \
         backdate_reason=?12, clock_trust='corrected', updated_at=?13, \
         last_modified_by_device=?14 WHERE id=?15 AND main_account_id=?16",
        params![
            v_str(&input, "project_id"),
            v_str(&input, "task_id"),
            v_str(&input, "customer_id"),
            v_str(&input, "timezone").unwrap_or_else(|| account_timezone(&tx)),
            started,
            ended,
            actual_seconds,
            break_seconds,
            net_seconds,
            v_str(&input, "description"),
            b2i(v_bool(&input, "is_billable")).unwrap_or(1),
            v_str(&input, "reason").or_else(|| v_str(&input, "backdate_reason")),
            now,
            db::DEVICE_ID,
            id,
            db::MAIN_ACCOUNT_ID,
        ],
    )
    .map_err(|error| format!("Nachtrag konnte nicht aktualisiert werden: {error}"))?;
    replace_backdate_breaks(&tx, &id, started, ended, &input)?;
    db::audit(
        &tx,
        "entry_updated",
        "time_entries",
        &id,
        Some("manual_backdate_correction"),
    );
    tx.commit().map_err(|error| error.to_string())?;
    db::time_entry_by_id(&conn, &id)?
        .ok_or_else(|| "Aktualisierter Nachtrag konnte nicht geladen werden.".to_string())
}

/// `list_time_entries`, query entries by range/project/customer.
/// Returns `TimeEntryRow[]`.
#[tauri::command]
pub fn list_time_entries(
    from: Option<i64>,
    to: Option<i64>,
    project_id: Option<String>,
    customer_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Value, String> {
    let conn = db::open()?;
    let mut sql = format!(
        "SELECT {} FROM time_entries WHERE deleted_at IS NULL",
        db::TE_COLS
    );
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(f) = from {
        sql.push_str(" AND actual_started_at >= ?");
        args.push(rusqlite::types::Value::Integer(f));
    }
    if let Some(t) = to {
        sql.push_str(" AND actual_started_at < ?");
        args.push(rusqlite::types::Value::Integer(t));
    }
    if let Some(p) = project_id {
        sql.push_str(" AND project_id = ?");
        args.push(rusqlite::types::Value::Text(p));
    }
    if let Some(c) = customer_id {
        sql.push_str(" AND customer_id = ?");
        args.push(rusqlite::types::Value::Text(c));
    }
    sql.push_str(" ORDER BY actual_started_at DESC LIMIT ? OFFSET ?");
    args.push(rusqlite::types::Value::Integer(limit.unwrap_or(200)));
    args.push(rusqlite::types::Value::Integer(offset.unwrap_or(0)));

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(args), db::map_time_entry)
        .map_err(|e| format!("query: {e}"))?;
    let out: Vec<Value> = rows
        .collect::<rusqlite::Result<Vec<Value>>>()
        .map_err(|e| format!("map rows: {e}"))?;
    Ok(Value::Array(out))
}

// ---- Customers + projects (doc 06 A.2) ----------------------------------

/// Map a `customers` core row to the wire `CustomerRow`.
fn map_customer(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": db::col_str(row, 0)?,
        "main_account_id": db::col_str(row, 1)?,
        "name": db::col_str(row, 2)?,
        "first_name": db::col_str(row, 3)?,
        "last_name": db::col_str(row, 4)?,
        "company": db::col_str(row, 5)?,
        "contact_person": db::col_str(row, 6)?,
        "email": db::col_str(row, 7)?,
        "phone": db::col_str(row, 8)?,
        "street": db::col_str(row, 9)?,
        "house_number": db::col_str(row, 10)?,
        "postal_code": db::col_str(row, 11)?,
        "city": db::col_str(row, 12)?,
        "country": db::col_str(row, 13)?,
        "vat_id": db::col_str(row, 14)?,
        "customer_number": db::col_str(row, 15)?,
        "payment_term_days": db::col_int(row, 16)?,
        "default_currency": db::col_str(row, 17)?,
        "default_hourly_rate_cents": db::col_int(row, 18)?,
        "default_day_rate_cents": db::col_int(row, 19)?,
        "default_rounding_rule_id": db::col_str(row, 20)?,
        "default_tax_rate": db::col_real(row, 21)?,
        "reverse_charge_hint": db::col_bool(row, 22)?,
        "small_business_hint": db::col_bool(row, 23)?,
        "preferred_export_detail": db::col_str(row, 24)?,
        "status": db::col_str(row, 25)?,
    }))
}

const CUSTOMER_COLS: &str = "id, main_account_id, name, first_name, last_name, company, contact_person, email, phone, \
street, house_number, postal_code, city, country, vat_id, customer_number, payment_term_days, default_currency, default_hourly_rate_cents, \
default_day_rate_cents, default_rounding_rule_id, default_tax_rate, reverse_charge_hint, \
small_business_hint, preferred_export_detail, status";

/// `create_customer`, insert a customer from `input` (`CustomerInput`).
/// Returns the persisted `CustomerRow`.
#[tauri::command]
pub fn create_customer(input: Value) -> Result<Value, String> {
    let conn = db::open()?;
    let name = v_str(&input, "name").ok_or_else(|| "create_customer: name required".to_string())?;
    let id = v_str(&input, "id").unwrap_or_else(db::new_uuid);
    let now = db::now_ms();
    conn.execute(
        "INSERT INTO customers(\
         id, main_account_id, name, first_name, last_name, company, contact_person, email, phone, \
         street, house_number, postal_code, city, country, vat_id, customer_number, payment_term_days, default_currency, default_hourly_rate_cents, \
         default_day_rate_cents, default_rounding_rule_id, default_tax_rate, reverse_charge_hint, \
         small_business_hint, preferred_export_detail, status, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
         ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?27)",
        params![
            id,
            db::MAIN_ACCOUNT_ID,
            name,
            v_str(&input, "first_name"),
            v_str(&input, "last_name"),
            v_str(&input, "company"),
            v_str(&input, "contact_person"),
            v_str(&input, "email"),
            v_str(&input, "phone"),
            v_str(&input, "street"),
            v_str(&input, "house_number"),
            v_str(&input, "postal_code"),
            v_str(&input, "city"),
            v_str(&input, "country"),
            v_str(&input, "vat_id"),
            v_str(&input, "customer_number"),
            v_i64(&input, "payment_term_days").unwrap_or(14),
            v_str(&input, "default_currency").unwrap_or_else(|| "EUR".to_string()),
            v_i64(&input, "default_hourly_rate_cents"),
            v_i64(&input, "default_day_rate_cents"),
            v_str(&input, "default_rounding_rule_id"),
            v_f64(&input, "default_tax_rate").unwrap_or(19.0),
            b2i(v_bool(&input, "reverse_charge_hint")).unwrap_or(0),
            b2i(v_bool(&input, "small_business_hint")).unwrap_or(0),
            v_str(&input, "preferred_export_detail").unwrap_or_else(|| "detailed".to_string()),
            v_str(&input, "status").unwrap_or_else(|| "active".to_string()),
            now,
        ],
    )
    .map_err(|e| format!("insert customer: {e}"))?;
    db::audit(&conn, "customer_created", "customers", &id, None);
    let sql = format!("SELECT {CUSTOMER_COLS} FROM customers WHERE id=?1 LIMIT 1");
    conn.query_row(&sql, params![id], map_customer)
        .map_err(|e| format!("read customer: {e}"))
}

/// `list_customers`, list customers, optional `status` filter.
/// Returns `CustomerRow[]`.
#[tauri::command]
pub fn list_customers(status: Option<String>) -> Result<Value, String> {
    let conn = db::open()?;
    let mut sql = format!("SELECT {CUSTOMER_COLS} FROM customers WHERE deleted_at IS NULL");
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(s) = status {
        sql.push_str(" AND status = ?");
        args.push(rusqlite::types::Value::Text(s));
    }
    sql.push_str(" ORDER BY name ASC");
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(args), map_customer)
        .map_err(|e| format!("query: {e}"))?;
    let out: Vec<Value> = rows
        .collect::<rusqlite::Result<Vec<Value>>>()
        .map_err(|e| format!("map rows: {e}"))?;
    Ok(Value::Array(out))
}

/// Map a `projects` core row to the wire `ProjectRow`.
fn map_project(row: &rusqlite::Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": db::col_str(row, 0)?,
        "main_account_id": db::col_str(row, 1)?,
        "name": db::col_str(row, 2)?,
        "customer_id": db::col_str(row, 3)?,
        "description": db::col_str(row, 4)?,
        "status": db::col_str(row, 5)?,
        "project_code": db::col_str(row, 6)?,
        "color": db::col_str(row, 7)?,
        "start_date": db::col_str(row, 8)?,
        "end_date": db::col_str(row, 9)?,
        "billing_type": db::col_str(row, 10)?,
        "hourly_rate_cents": db::col_int(row, 11)?,
        "day_rate_cents": db::col_int(row, 12)?,
        "fixed_fee_cents": db::col_int(row, 13)?,
        "rounding_rule_id": db::col_str(row, 14)?,
        "description_required": db::col_bool(row, 15)?,
        "backdating_allowed": db::col_bool(row, 16)?,
        "backdating_reason_required": db::col_bool(row, 17)?,
        "max_retroactive_edit_days": db::col_int(row, 18)?,
    }))
}

const PROJECT_COLS: &str = "id, main_account_id, name, customer_id, description, status, \
project_code, color, start_date, end_date, billing_type, hourly_rate_cents, day_rate_cents, \
fixed_fee_cents, rounding_rule_id, description_required, backdating_allowed, \
backdating_reason_required, max_retroactive_edit_days";

/// `create_project`, insert a project from `input` (`ProjectInput`).
/// Returns the persisted `ProjectRow`.
#[tauri::command]
pub fn create_project(input: Value) -> Result<Value, String> {
    let conn = db::open()?;
    let name = v_str(&input, "name").ok_or_else(|| "create_project: name required".to_string())?;
    let id = v_str(&input, "id").unwrap_or_else(db::new_uuid);
    let now = db::now_ms();
    conn.execute(
        "INSERT INTO projects(\
         id, main_account_id, name, customer_id, description, status, project_code, color, \
         start_date, end_date, billing_type, hourly_rate_cents, day_rate_cents, fixed_fee_cents, \
         rounding_rule_id, description_required, backdating_allowed, backdating_reason_required, \
         max_retroactive_edit_days, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
         ?18, ?19, ?20, ?20)",
        params![
            id,
            db::MAIN_ACCOUNT_ID,
            name,
            v_str(&input, "customer_id"),
            v_str(&input, "description"),
            v_str(&input, "status").unwrap_or_else(|| "active".to_string()),
            v_str(&input, "project_code"),
            v_str(&input, "color"),
            v_str(&input, "start_date"),
            v_str(&input, "end_date"),
            v_str(&input, "billing_type").unwrap_or_else(|| "hourly".to_string()),
            v_i64(&input, "hourly_rate_cents"),
            v_i64(&input, "day_rate_cents"),
            v_i64(&input, "fixed_fee_cents"),
            v_str(&input, "rounding_rule_id"),
            b2i(v_bool(&input, "description_required")).unwrap_or(0),
            b2i(v_bool(&input, "backdating_allowed")).unwrap_or(1),
            b2i(v_bool(&input, "backdating_reason_required")).unwrap_or(0),
            v_i64(&input, "max_retroactive_edit_days"),
            now,
        ],
    )
    .map_err(|e| format!("insert project: {e}"))?;
    db::audit(&conn, "project_created", "projects", &id, None);
    let sql = format!("SELECT {PROJECT_COLS} FROM projects WHERE id=?1 LIMIT 1");
    conn.query_row(&sql, params![id], map_project)
        .map_err(|e| format!("read project: {e}"))
}

/// `list_projects`, list projects, optional `customer_id`/`status` filters.
/// Returns `ProjectRow[]`.
#[tauri::command]
pub fn list_projects(customer_id: Option<String>, status: Option<String>) -> Result<Value, String> {
    let conn = db::open()?;
    let mut sql = format!("SELECT {PROJECT_COLS} FROM projects WHERE deleted_at IS NULL");
    let mut args: Vec<rusqlite::types::Value> = Vec::new();
    if let Some(c) = customer_id {
        sql.push_str(" AND customer_id = ?");
        args.push(rusqlite::types::Value::Text(c));
    }
    if let Some(s) = status {
        sql.push_str(" AND status = ?");
        args.push(rusqlite::types::Value::Text(s));
    }
    sql.push_str(" ORDER BY name ASC");
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(args), map_project)
        .map_err(|e| format!("query: {e}"))?;
    let out: Vec<Value> = rows
        .collect::<rusqlite::Result<Vec<Value>>>()
        .map_err(|e| format!("map rows: {e}"))?;
    Ok(Value::Array(out))
}

// ---- Backups + app lock (doc 09, doc 11 §5) -----------------------------

fn copy_document_tree(source: &Path, destination: &Path) -> Result<(i64, i64), String> {
    std::fs::create_dir_all(destination).map_err(|e| format!("Dokumenten-Backup anlegen: {e}"))?;
    if !source.exists() {
        return Ok((0, 0));
    }
    let mut files = 0_i64;
    let mut bytes = 0_i64;
    for entry in std::fs::read_dir(source).map_err(|e| format!("Dokumentenordner lesen: {e}"))? {
        let entry = entry.map_err(|e| format!("Dokument lesen: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("Dokumenttyp lesen: {e}"))?;
        let target = destination.join(entry.file_name());
        if file_type.is_symlink() {
            return Err(
                "Symbolische Links werden im Dokumenten-Backup nicht unterstützt".to_string(),
            );
        } else if file_type.is_dir() {
            let (nested_files, nested_bytes) = copy_document_tree(&entry.path(), &target)?;
            files += nested_files;
            bytes += nested_bytes;
        } else if file_type.is_file() {
            bytes += std::fs::copy(entry.path(), target)
                .map_err(|e| format!("Dokument sichern: {e}"))? as i64;
            files += 1;
        }
    }
    Ok((files, bytes))
}

fn make_backup_attachment_paths_portable(conn: &Connection) -> Result<(), String> {
    let root = document_root()?
        .canonicalize()
        .map_err(|e| format!("Dokumentenordner prüfen: {e}"))?;
    let mut statement = conn
        .prepare(
            "SELECT id, storage_path FROM attachments
              WHERE entity_type LIKE 'project_document:%' OR entity_type LIKE 'task_document:%'",
        )
        .map_err(|e| format!("Dokumentpfade im Backup lesen: {e}"))?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("Dokumentpfade im Backup lesen: {e}"))?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| format!("Dokumentpfade im Backup lesen: {e}"))?;
    drop(statement);
    for (id, stored) in rows {
        let stored_path = PathBuf::from(&stored);
        let relative = if stored_path.is_absolute() {
            stored_path
                .strip_prefix(&root)
                .map_err(|_| {
                    "Ein Dokumentpfad liegt außerhalb des Tarlog-App-Datenordners".to_string()
                })?
                .to_path_buf()
        } else {
            stored_path
        };
        if relative.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::CurDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        }) {
            return Err("Unsicherer Dokumentpfad im Backup wurde abgelehnt".to_string());
        }
        conn.execute(
            "UPDATE attachments SET storage_path=?1 WHERE id=?2",
            params![relative.to_string_lossy(), id],
        )
        .map_err(|e| format!("Dokumentpfad im Backup portabel speichern: {e}"))?;
    }
    Ok(())
}

/// `run_backup`, create a local SQLite backup. Returns
/// `{ ok, path, sizeBytes, createdAt, encrypted }`.
#[tauri::command]
pub fn run_backup(manual: Option<bool>, encrypt: Option<bool>) -> Result<Value, String> {
    let src = db::db_path()?;
    // Flush the WAL so the plain file copy is complete.
    {
        let conn = db::open()?;
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    }
    let dir = src
        .parent()
        .ok_or_else(|| "backup: no parent dir".to_string())?
        .join("backups");
    std::fs::create_dir_all(&dir).map_err(|e| format!("create backups dir: {e}"))?;
    let created = db::now_ms();
    let dest = dir.join(format!("ptl-{created}.db"));
    let attachment_dest = dir.join(format!("ptl-{created}.attachments"));
    let manifest = dir.join(format!("ptl-{created}.manifest.json"));
    std::fs::copy(&src, &dest).map_err(|e| format!("copy db: {e}"))?;
    let database_size = std::fs::metadata(&dest)
        .map(|m| m.len() as i64)
        .map_err(|e| format!("stat backup: {e}"))?;
    let attachment_source = document_root()?;
    let (attachment_files, attachment_size) =
        copy_document_tree(&attachment_source, &attachment_dest)?;
    // Integrity check on the copy.
    let integrity = {
        let check = Connection::open(&dest).map_err(|e| format!("open backup: {e}"))?;
        make_backup_attachment_paths_portable(&check)?;
        let status = check
            .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| "unknown".to_string());
        status
    };
    let manifest_json = json!({
        "formatVersion": 1,
        "database": dest.file_name().and_then(|name| name.to_str()).unwrap_or("ptl.db"),
        "attachments": attachment_dest.file_name().and_then(|name| name.to_str()).unwrap_or("attachments"),
        "attachmentFiles": attachment_files,
        "restore": "Datenbank als ptl.db wiederherstellen und den Inhalt des attachments-Ordners in Tarlogs attachments-App-Datenordner kopieren."
    });
    std::fs::write(
        &manifest,
        serde_json::to_vec_pretty(&manifest_json)
            .map_err(|e| format!("Backup-Manifest erstellen: {e}"))?,
    )
    .map_err(|e| format!("Backup-Manifest speichern: {e}"))?;
    let manifest_size = std::fs::metadata(&manifest)
        .map(|m| m.len() as i64)
        .unwrap_or(0);
    let size = database_size + attachment_size + manifest_size;
    let path_str = dest.to_string_lossy().to_string();
    let conn = db::open()?;
    conn.execute(
        "INSERT INTO backups(id, main_account_id, kind, target, storage_path, size_bytes, \
         encrypted, integrity_status, created_at) \
         VALUES(?1, ?2, 'local', 'sqlite', ?3, ?4, 0, ?5, ?6)",
        params![
            db::new_uuid(),
            db::MAIN_ACCOUNT_ID,
            path_str,
            size,
            integrity,
            created,
        ],
    )
    .map_err(|e| format!("insert backup row: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": path_str,
        "sizeBytes": size,
        "createdAt": created,
        "encrypted": false,
        "formatVersion": 1,
        "attachmentPath": attachment_dest.to_string_lossy(),
        "attachmentFiles": attachment_files,
        "manifestPath": manifest.to_string_lossy(),
    }))
}

/// `app_lock_check`, verify the app lock (password or macOS Touch ID via
/// LocalAuthentication, doc 09 §6.1). Returns
/// `{ locked, unlocked, method, biometricAvailable }`.
///
/// NOTE: macOS Touch ID (LocalAuthentication) is not wired in this build, so
/// `biometricAvailable` is always `false`; only password locks are verifiable.
#[tauri::command]
pub fn app_lock_check(method: Option<String>, password: Option<String>) -> Result<Value, String> {
    let conn = db::open()?;
    let (enabled, lock_method): (Option<i64>, Option<String>) = conn
        .query_row(
            "SELECT app_lock_enabled, app_lock_method FROM local_profiles WHERE id=?1",
            params![db::LOCAL_PROFILE_ID],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((Some(0), Some("none".to_string())));
    let enabled = enabled.unwrap_or(0) != 0;
    if !enabled {
        // No lock configured, nothing to unlock.
        return Ok(json!({
            "locked": false,
            "unlocked": true,
            "method": "none",
            "biometricAvailable": false,
        }));
    }
    let lock_method = lock_method.unwrap_or_else(|| "password".to_string());
    let unlocked = match password {
        Some(pw) => {
            let hash: Option<String> = conn
                .query_row(
                    "SELECT password_hash FROM main_accounts WHERE id=?1",
                    params![db::MAIN_ACCOUNT_ID],
                    |r| r.get(0),
                )
                .ok()
                .flatten();
            match hash {
                Some(h) => verify_password(&pw, &h),
                None => false,
            }
        }
        None => false,
    };
    Ok(json!({
        "locked": true,
        "unlocked": unlocked,
        "method": lock_method,
        "biometricAvailable": false,
    }))
}

/// Verify a plaintext password against a stored argon2id PHC hash.
fn verify_password(password: &str, phc: &str) -> bool {
    use argon2::{Argon2, PasswordHash, PasswordVerifier};
    match PasswordHash::new(phc) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(_) => false,
    }
}

// ---- Server connection + sync (doc 02 §3.1, doc 04) ---------------------

/// `set_server_connection`, switch local vs. server mode. Returns
/// `{ ok, mode, baseUrl, connected }`.
#[tauri::command]
pub fn set_server_connection(
    mode: String,
    base_url: Option<String>,
    token: Option<String>,
) -> Result<Value, String> {
    let conn = db::open()?;
    db::set_setting(&conn, "server_mode", &mode)?;
    if let Some(b) = &base_url {
        db::set_setting(&conn, "server_base_url", b)?;
    }
    if let Some(t) = &token {
        db::set_setting(&conn, "server_token", t)?;
    }
    Ok(json!({
        "ok": true,
        "mode": mode,
        "baseUrl": base_url,
        "connected": mode == "server",
    }))
}

/// `sync_push`, push local outbox events. Returns
/// `{ ok, count, serverRevision, conflicts }`.
///
/// Local mode: no-op. The real network sync lives in the TS engine
/// (`src/sync/engine.ts`); this backend never talks to the server directly.
#[tauri::command]
pub fn sync_push(since_revision: Option<i64>) -> Result<Value, String> {
    Ok(json!({
        "ok": true,
        "count": 0,
        "serverRevision": since_revision.unwrap_or(0),
        "conflicts": [],
    }))
}

/// `sync_pull`, pull the server delta since `since_revision`. Returns
/// `{ ok, count, serverRevision, conflicts }`. Local mode: no-op (see `sync_push`).
#[tauri::command]
pub fn sync_pull(since_revision: Option<i64>) -> Result<Value, String> {
    Ok(json!({
        "ok": true,
        "count": 0,
        "serverRevision": since_revision.unwrap_or(0),
        "conflicts": [],
    }))
}
