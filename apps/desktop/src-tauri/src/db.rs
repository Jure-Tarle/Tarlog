//! db.rs — local SQLite lifecycle + shared helpers (doc 05 §2.1, doc 06).
//!
//! The frontend reads the same database through `tauri-plugin-sql`
//! (`Database.load("sqlite:ptl.db")`). That plugin resolves the file relative to
//! Tauri's `app_config_dir()` (see tauri-plugin-sql `path_mapper`). We MUST open
//! the exact same file so writes here are visible to the plugin's reads, so
//! `db_path()` replicates that resolution from the bundle identifier without
//! needing an `AppHandle` (keeps the frozen command signatures untouched).
//!
//! Conventions (doc 05 §8): instants = UTC epoch-ms (`i64`), durations = seconds,
//! money = cents, ids = UUIDv7 TEXT. Field/table names match doc 06 exactly
//! (mirrored from `packages/db/src/schema/sqlite.ts`).

use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, Row};
use serde_json::{json, Value};

/// Bundle identifier — must match `tauri.conf.json` `identifier`.
const APP_IDENTIFIER: &str = "com.tarlog.desktop";
/// Local DB filename — must match `db.ts` `DB_URL = "sqlite:ptl.db"`.
const DB_FILE: &str = "ptl.db";
/// Current local schema version (stored in `PRAGMA user_version`).
pub const SCHEMA_VERSION: i64 = 2;

// Fixed singletons for the local single-user profile (doc 02 §3.1 local-first).
// Valid UUIDv7-shaped constants; FK enforcement is off so no external rows are
// required, but we bootstrap the referenced rows for completeness.
pub const MAIN_ACCOUNT_ID: &str = "01890000-0000-7000-8000-000000000001";
pub const DEVICE_ID: &str = "01890000-0000-7000-8000-0000000000d1";
pub const LOCAL_PROFILE_ID: &str = "01890000-0000-7000-8000-0000000000f1";
pub const TIMER_ID: &str = "01890000-0000-7000-8000-000000000771";

/// UTC now as epoch milliseconds.
pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A fresh time-ordered UUIDv7 string.
pub fn new_uuid() -> String {
    uuid::Uuid::now_v7().to_string()
}

/// The base config dir, replicating Tauri v2 `app_config_dir()`
/// (`config_dir()/{identifier}`). macOS is the priority platform.
fn app_config_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
        Ok(PathBuf::from(home)
            .join("Library/Application Support")
            .join(APP_IDENTIFIER))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not set".to_string())?;
        Ok(PathBuf::from(appdata).join(APP_IDENTIFIER))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let base = std::env::var("XDG_CONFIG_HOME").ok().unwrap_or_else(|| {
            let home = std::env::var("HOME").unwrap_or_default();
            format!("{home}/.config")
        });
        Ok(PathBuf::from(base).join(APP_IDENTIFIER))
    }
}

/// Absolute path of the local SQLite file (created dir if missing).
///
/// `PTL_DB_PATH` overrides the location. Used by the integration tests to run
/// against a throwaway file instead of the real user profile; never set in
/// production builds.
pub fn db_path() -> Result<PathBuf, String> {
    if let Ok(custom) = std::env::var("PTL_DB_PATH") {
        let p = PathBuf::from(custom);
        if let Some(parent) = p.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("create db dir: {e}"))?;
        }
        return Ok(p);
    }
    let dir = app_config_dir()?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create app dir: {e}"))?;
    Ok(dir.join(DB_FILE))
}

/// Open a connection to the local DB with WAL + a busy timeout so the plugin's
/// pool and these rusqlite connections can share the file safely.
pub fn open() -> Result<Connection, String> {
    let path = db_path()?;
    let conn = Connection::open(&path).map_err(|e| format!("open db: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;\
         PRAGMA busy_timeout=5000;\
         PRAGMA foreign_keys=OFF;",
    )
    .map_err(|e| format!("pragma: {e}"))?;
    Ok(conn)
}

/// Apply pending migrations. Returns the number applied this run. Idempotent:
/// re-running is a no-op once `user_version` reaches `SCHEMA_VERSION`.
pub fn run_migrations(conn: &Connection) -> Result<i64, String> {
    let current: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("read user_version: {e}"))?;
    if current > SCHEMA_VERSION {
        return Err(format!(
            "database schema version {current} is newer than this app supports ({SCHEMA_VERSION})"
        ));
    }
    let mut applied = 0;
    if current < 1 {
        conn.execute_batch(DDL_V1)
            .map_err(|e| format!("ddl v1: {e}"))?;
        bootstrap(conn)?;
        applied += 1;
    }
    if current < 2 {
        conn.execute_batch(DDL_V2)
            .map_err(|e| format!("ddl v2: {e}"))?;
        applied += 1;
    }
    conn.execute_batch(&format!("PRAGMA user_version={SCHEMA_VERSION};"))
        .map_err(|e| format!("set user_version: {e}"))?;
    Ok(applied)
}

/// Read the current schema version.
pub fn user_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| format!("read user_version: {e}"))
}

/// Seed the local single-user singletons (account, device, profile, idle timer).
fn bootstrap(conn: &Connection) -> Result<(), String> {
    let now = now_ms();
    conn.execute(
        "INSERT OR IGNORE INTO main_accounts(id, display_name, mode, default_currency, default_locale, default_timezone, created_at, updated_at)\
         VALUES(?1, 'Lokales Konto', 'local', 'EUR', 'de-DE', 'Europe/Berlin', ?2, ?2)",
        rusqlite::params![MAIN_ACCOUNT_ID, now],
    )
    .map_err(|e| format!("seed account: {e}"))?;
    conn.execute(
        "INSERT OR IGNORE INTO devices(id, main_account_id, device_name, platform, app_version, local_db_version, connected_at, created_at, updated_at)\
         VALUES(?1, ?2, 'Dieses Gerät', ?3, ?4, ?5, ?6, ?6, ?6)",
        rusqlite::params![
            DEVICE_ID,
            MAIN_ACCOUNT_ID,
            host_platform(),
            env!("CARGO_PKG_VERSION"),
            SCHEMA_VERSION,
            now
        ],
    )
    .map_err(|e| format!("seed device: {e}"))?;
    conn.execute(
        "UPDATE devices SET app_version=?2, updated_at=?3 WHERE id=?1",
        rusqlite::params![DEVICE_ID, env!("CARGO_PKG_VERSION"), now],
    )
    .map_err(|e| format!("refresh device version: {e}"))?;
    conn.execute(
        "INSERT OR IGNORE INTO local_profiles(id, main_account_id, device_id, created_at, updated_at)\
         VALUES(?1, ?2, ?3, ?4, ?4)",
        rusqlite::params![LOCAL_PROFILE_ID, MAIN_ACCOUNT_ID, DEVICE_ID, now],
    )
    .map_err(|e| format!("seed profile: {e}"))?;
    conn.execute(
        "INSERT OR IGNORE INTO timer_states(timer_id, main_account_id, status, accumulated_pause_seconds, device_started_on, last_modified_by_device, sync_version, local_revision)\
         VALUES(?1, ?2, 'idle', 0, ?3, ?3, 0, 0)",
        rusqlite::params![TIMER_ID, MAIN_ACCOUNT_ID, DEVICE_ID],
    )
    .map_err(|e| format!("seed timer: {e}"))?;
    // Standard-Rundungsregel: je angefangenes 15-Minuten-Intervall aufrunden
    // (doc 07/14, AC18). Ohne globale Default-Regel bliebe die Abrechnung
    // Pass-Through (billing = net); identisch zum Server-Setup.
    conn.execute(
        "INSERT INTO rounding_rules(id, main_account_id, name, mode, interval_minutes, scope, valid_from, calculation_version, created_at, updated_at)\
         SELECT ?1, ?2, 'Standard — 15 Minuten aufrunden', 'ceil_started_interval', 15, 'global', '1970-01-01', 1, ?3, ?3\
         WHERE NOT EXISTS (SELECT 1 FROM rounding_rules WHERE main_account_id = ?2 AND scope = 'global')",
        rusqlite::params![new_uuid(), MAIN_ACCOUNT_ID, now],
    )
    .map_err(|e| format!("seed rounding rule: {e}"))?;
    Ok(())
}

fn host_platform() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        "web"
    }
}

// ---------------------------------------------------------------------------
// Audit trail (doc 06 audit_logs) — best-effort; never fails the operation.
// ---------------------------------------------------------------------------

/// Append an audit-log row. Errors are swallowed so audit never blocks a write.
pub fn audit(
    conn: &Connection,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    reason: Option<&str>,
) {
    let _ = conn.execute(
        "INSERT INTO audit_logs(id, actor_id, main_account_id, device_id, entity_type, entity_id, action, reason, timestamp, source, local_revision)\
         VALUES(?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ui', 0)",
        rusqlite::params![new_uuid(), MAIN_ACCOUNT_ID, DEVICE_ID, entity_type, entity_id, action, reason, now_ms()],
    );
}

// ---------------------------------------------------------------------------
// Settings (doc 06 settings) — account-scoped key/JSON store used by lock + sync.
// ---------------------------------------------------------------------------

/// Read an account-scoped setting's string value (JSON-decoded), if present.
pub fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM settings WHERE main_account_id=?1 AND scope='account' AND key=?2 LIMIT 1",
            rusqlite::params![MAIN_ACCOUNT_ID, key],
            |r| r.get(0),
        )
        .ok();
    match raw {
        None => Ok(None),
        Some(s) => Ok(serde_json::from_str::<Value>(&s)
            .ok()
            .and_then(|v| v.as_str().map(|x| x.to_string()))),
    }
}

/// Upsert an account-scoped setting (value stored as a JSON string).
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    let now = now_ms();
    let json_val = Value::String(value.to_string()).to_string();
    let updated = conn
        .execute(
            "UPDATE settings SET value_json=?1, updated_at=?2 WHERE main_account_id=?3 AND scope='account' AND key=?4",
            rusqlite::params![json_val, now, MAIN_ACCOUNT_ID, key],
        )
        .map_err(|e| format!("update setting: {e}"))?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO settings(id, main_account_id, scope, device_id, key, value_json, created_at, updated_at)\
             VALUES(?1, ?2, 'account', NULL, ?3, ?4, ?5, ?5)",
            rusqlite::params![new_uuid(), MAIN_ACCOUNT_ID, key, json_val, now],
        )
        .map_err(|e| format!("insert setting: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Small Row → serde_json helpers (column-index based).
// ---------------------------------------------------------------------------

pub fn col_str(row: &Row, i: usize) -> rusqlite::Result<Value> {
    Ok(row
        .get::<_, Option<String>>(i)?
        .map(Value::from)
        .unwrap_or(Value::Null))
}
pub fn col_int(row: &Row, i: usize) -> rusqlite::Result<Value> {
    Ok(row
        .get::<_, Option<i64>>(i)?
        .map(Value::from)
        .unwrap_or(Value::Null))
}
pub fn col_real(row: &Row, i: usize) -> rusqlite::Result<Value> {
    Ok(row
        .get::<_, Option<f64>>(i)?
        .map(Value::from)
        .unwrap_or(Value::Null))
}
/// INTEGER stored boolean → JSON bool (NULL preserved).
pub fn col_bool(row: &Row, i: usize) -> rusqlite::Result<Value> {
    Ok(row
        .get::<_, Option<i64>>(i)?
        .map(|n| Value::Bool(n != 0))
        .unwrap_or(Value::Null))
}
/// TEXT stored JSON → parsed JSON value (NULL / invalid → Null).
pub fn col_json(row: &Row, i: usize) -> rusqlite::Result<Value> {
    Ok(row
        .get::<_, Option<String>>(i)?
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null))
}

/// Build the wire `TimerState` (doc 06 timer_states) from the singleton row.
pub fn read_timer_state(conn: &Connection) -> Result<Value, String> {
    conn.query_row(
        "SELECT timer_id, main_account_id, current_time_entry_id, status, project_id, task_id, \
                started_at, paused_at, accumulated_pause_seconds, active_pause_started_at, \
                device_started_on, last_modified_by_device, sync_version, server_revision, \
                local_revision, description_required, billing_status, compliance_warnings \
         FROM timer_states WHERE timer_id=?1 LIMIT 1",
        rusqlite::params![TIMER_ID],
        |row| {
            Ok(json!({
                "timer_id": col_str(row, 0)?,
                "main_account_id": col_str(row, 1)?,
                "current_time_entry_id": col_str(row, 2)?,
                "status": col_str(row, 3)?,
                "project_id": col_str(row, 4)?,
                "task_id": col_str(row, 5)?,
                "started_at": col_int(row, 6)?,
                "paused_at": col_int(row, 7)?,
                "accumulated_pause_seconds": col_int(row, 8)?,
                "active_pause_started_at": col_int(row, 9)?,
                "device_started_on": col_str(row, 10)?,
                "last_modified_by_device": col_str(row, 11)?,
                "sync_version": col_int(row, 12)?,
                "server_revision": col_int(row, 13)?,
                "local_revision": col_int(row, 14)?,
                "description_required": col_bool(row, 15)?,
                "billing_status": col_str(row, 16)?,
                "compliance_warnings": col_json(row, 17)?,
            }))
        },
    )
    .map_err(|e| format!("read timer: {e}"))
}

/// Explicit column list for `time_entries` reads (order matches `map_time_entry`).
pub const TE_COLS: &str =
    "id, main_account_id, project_id, task_id, customer_id, status, timezone, \
actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds, \
net_work_duration_seconds, billing_duration_seconds, rounding_rule_id, rounding_delta_seconds, \
rounding_reason, calculation_version, rate_snapshot, billing_amount_snapshot, description, \
is_billable, client_visible, source, backdate_reason, is_backdated, crosses_midnight, clock_trust";

/// Map a `time_entries` row (selected via `TE_COLS`) to the wire `TimeEntryRow`.
pub fn map_time_entry(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": col_str(row, 0)?,
        "main_account_id": col_str(row, 1)?,
        "project_id": col_str(row, 2)?,
        "task_id": col_str(row, 3)?,
        "customer_id": col_str(row, 4)?,
        "status": col_str(row, 5)?,
        "timezone": col_str(row, 6)?,
        "actual_started_at": col_int(row, 7)?,
        "actual_ended_at": col_int(row, 8)?,
        "actual_duration_seconds": col_int(row, 9)?,
        "break_duration_seconds": col_int(row, 10)?,
        "net_work_duration_seconds": col_int(row, 11)?,
        "billing_duration_seconds": col_int(row, 12)?,
        "rounding_rule_id": col_str(row, 13)?,
        "rounding_delta_seconds": col_int(row, 14)?,
        "rounding_reason": col_str(row, 15)?,
        "calculation_version": col_int(row, 16)?,
        "rate_snapshot": col_json(row, 17)?,
        "billing_amount_snapshot": col_int(row, 18)?,
        "description": col_str(row, 19)?,
        "is_billable": col_bool(row, 20)?,
        "client_visible": col_bool(row, 21)?,
        "source": col_str(row, 22)?,
        "backdate_reason": col_str(row, 23)?,
        "is_backdated": col_bool(row, 24)?,
        "crosses_midnight": col_bool(row, 25)?,
        "clock_trust": col_str(row, 26)?,
    }))
}

/// Read one time entry by id (wire shape), or `None`.
pub fn time_entry_by_id(conn: &Connection, id: &str) -> Result<Option<Value>, String> {
    let sql = format!("SELECT {TE_COLS} FROM time_entries WHERE id=?1 LIMIT 1");
    match conn.query_row(&sql, rusqlite::params![id], map_time_entry) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("read entry: {e}")),
    }
}

// ---------------------------------------------------------------------------
// DDL — schema v1. Column/table names mirror packages/db/src/schema/sqlite.ts
// (doc 06). Only the tables the desktop backend needs are created here; the
// full 40-table model is provided by the Drizzle migrations on the server side.
// FK enforcement is OFF (see `open`), so declaration order is not significant.
// ---------------------------------------------------------------------------

const DDL_V1: &str = r#"
CREATE TABLE IF NOT EXISTS main_accounts (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'local',
  email TEXT,
  company_name TEXT,
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  default_locale TEXT NOT NULL DEFAULT 'de-DE',
  default_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  default_compliance_profile_id TEXT,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  app_version TEXT NOT NULL,
  last_sync_at INTEGER,
  sync_status TEXT DEFAULT 'offline',
  local_db_version INTEGER NOT NULL,
  server_connected INTEGER DEFAULT 0,
  permission_status TEXT DEFAULT 'active',
  revoked INTEGER DEFAULT 0,
  connected_at INTEGER NOT NULL,
  last_active_timer_id TEXT,
  live_channel_status TEXT DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS local_profiles (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  app_lock_enabled INTEGER DEFAULT 0,
  app_lock_method TEXT DEFAULT 'none',
  biometric_kind TEXT DEFAULT 'none',
  db_encryption_enabled INTEGER DEFAULT 0,
  telemetry_opt_in INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  hlc TEXT NOT NULL,
  local_revision INTEGER NOT NULL,
  server_revision INTEGER,
  correlation_id TEXT,
  applied INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS timer_states (
  timer_id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  current_time_entry_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  project_id TEXT,
  task_id TEXT,
  started_at INTEGER,
  paused_at INTEGER,
  accumulated_pause_seconds INTEGER NOT NULL DEFAULT 0,
  active_pause_started_at INTEGER,
  device_started_on TEXT NOT NULL,
  last_modified_by_device TEXT NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  description_required INTEGER DEFAULT 0,
  billing_status TEXT DEFAULT 'undecided',
  compliance_warnings TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_timer_states_single_active
  ON timer_states(main_account_id) WHERE status IN ('running','paused');

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  vat_id TEXT,
  customer_number TEXT,
  payment_term_days INTEGER DEFAULT 14,
  default_currency TEXT,
  default_hourly_rate_cents INTEGER,
  default_day_rate_cents INTEGER,
  default_rounding_rule_id TEXT,
  default_invoice_note TEXT,
  default_language TEXT DEFAULT 'de-DE',
  pdf_template_id TEXT,
  invoice_template_id TEXT,
  internal_notes TEXT,
  external_notes TEXT,
  status TEXT DEFAULT 'active',
  default_tax_rate REAL DEFAULT 19.0,
  reverse_charge_hint INTEGER DEFAULT 0,
  small_business_hint INTEGER DEFAULT 0,
  preferred_export_detail TEXT DEFAULT 'detailed',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  customer_id TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  project_code TEXT,
  color TEXT,
  start_date TEXT,
  end_date TEXT,
  billing_type TEXT NOT NULL,
  hourly_rate_cents INTEGER,
  day_rate_cents INTEGER,
  fixed_fee_cents INTEGER,
  retainer_id TEXT,
  budget_hours REAL,
  budget_money_cents INTEGER,
  budget_warn_thresholds TEXT,
  planned_hours REAL,
  actual_hours REAL,
  billable_hours REAL,
  non_billable_hours REAL,
  rounding_rule_id TEXT,
  default_task_id TEXT,
  allowed_task_ids TEXT,
  mandatory_tags TEXT,
  description_required INTEGER DEFAULT 0,
  backdating_allowed INTEGER DEFAULT 1,
  backdating_reason_required INTEGER DEFAULT 0,
  max_retroactive_edit_days INTEGER,
  internal_notes TEXT,
  external_description TEXT,
  invoice_template_id TEXT,
  export_template_id TEXT,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  default_billable INTEGER DEFAULT 1,
  default_hourly_rate_cents INTEGER,
  default_day_rate_cents INTEGER,
  default_description_template TEXT,
  cost_center TEXT,
  color TEXT,
  status TEXT DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  project_id TEXT,
  task_id TEXT,
  customer_id TEXT,
  status TEXT NOT NULL,
  timezone TEXT NOT NULL,
  actual_started_at INTEGER NOT NULL,
  actual_ended_at INTEGER,
  actual_duration_seconds INTEGER NOT NULL,
  break_duration_seconds INTEGER DEFAULT 0,
  net_work_duration_seconds INTEGER NOT NULL,
  billing_duration_seconds INTEGER NOT NULL,
  rounding_rule_id TEXT,
  rounding_delta_seconds INTEGER DEFAULT 0,
  rounding_reason TEXT,
  calculation_version INTEGER NOT NULL,
  rate_snapshot TEXT,
  billing_amount_snapshot INTEGER,
  description TEXT,
  summary TEXT,
  deliverable TEXT,
  blocker TEXT,
  next_step TEXT,
  internal_note TEXT,
  is_billable INTEGER DEFAULT 1,
  client_visible INTEGER DEFAULT 1,
  source TEXT NOT NULL,
  backdate_reason TEXT,
  correction_reason TEXT,
  is_backdated INTEGER DEFAULT 0,
  crosses_midnight INTEGER DEFAULT 0,
  device_started_on TEXT,
  server_received_at INTEGER,
  clock_trust TEXT DEFAULT 'trusted',
  invoice_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);
CREATE INDEX IF NOT EXISTS ix_time_entries_account_started ON time_entries(main_account_id, actual_started_at);
CREATE INDEX IF NOT EXISTS ix_time_entries_project_started ON time_entries(project_id, actual_started_at);

CREATE TABLE IF NOT EXISTS time_entry_breaks (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  time_entry_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  duration_seconds INTEGER NOT NULL,
  kind TEXT DEFAULT 'manual',
  counts_as_rest INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);
CREATE INDEX IF NOT EXISTS ix_time_entry_breaks_entry ON time_entry_breaks(time_entry_id);

CREATE TABLE IF NOT EXISTS time_entry_tags (
  time_entry_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  main_account_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (time_entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS rounding_rules (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  interval_minutes INTEGER,
  min_duration_seconds INTEGER,
  scope TEXT DEFAULT 'global',
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  calculation_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS billing_rates (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  customer_id TEXT,
  project_id TEXT,
  task_id TEXT,
  hourly_rate_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  valid_from TEXT NOT NULL,
  valid_until TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  organization_id TEXT,
  main_account_id TEXT NOT NULL,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  timestamp INTEGER NOT NULL,
  source TEXT NOT NULL,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL,
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  encrypted INTEGER DEFAULT 0,
  checksum_sha256 TEXT,
  integrity_status TEXT DEFAULT 'unknown',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  device_id TEXT,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);

CREATE TABLE IF NOT EXISTS conflict_records (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  conflict_case INTEGER NOT NULL,
  local_version_json TEXT NOT NULL,
  server_version_json TEXT NOT NULL,
  suggested_merge_json TEXT,
  resolution TEXT DEFAULT 'unresolved',
  reason TEXT,
  resolved_by_device TEXT,
  server_revision INTEGER,
  correlation_id TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
"#;

// Repository read models added after the initial local-runtime schema. Keep
// these columns aligned with `packages/db/src/schema/sqlite.ts`: the desktop
// repositories deliberately use `SELECT *`, while their list views consume a
// subset of the returned row.
const DDL_V2: &str = r#"
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  invoice_number TEXT,
  number_range_id TEXT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  dunning_status TEXT DEFAULT 'none',
  issue_date TEXT NOT NULL,
  service_period_start TEXT,
  service_period_end TEXT,
  service_date TEXT,
  payment_due_date TEXT,
  currency TEXT NOT NULL,
  net_amount_cents INTEGER NOT NULL,
  tax_amount_cents INTEGER NOT NULL,
  gross_amount_cents INTEGER NOT NULL,
  tax_rate REAL NOT NULL,
  small_business_note TEXT,
  reverse_charge_note TEXT,
  customer_snapshot TEXT NOT NULL,
  project_snapshot TEXT,
  rate_snapshot TEXT NOT NULL,
  rounding_snapshot TEXT NOT NULL,
  finalized_at INTEGER,
  cancels_invoice_id TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0,
  hlc TEXT,
  last_modified_by_device TEXT
);
CREATE INDEX IF NOT EXISTS ix_invoices_main_account ON invoices(main_account_id);
CREATE INDEX IF NOT EXISTS ix_invoices_status ON invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_number
  ON invoices(main_account_id, invoice_number);

CREATE TABLE IF NOT EXISTS compliance_results (
  id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  compliance_profile_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_date TEXT,
  time_entry_id TEXT,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  override_reason TEXT,
  overridden_by_device TEXT,
  calculation_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_compliance_results_scope_date
  ON compliance_results(scope_date);
CREATE INDEX IF NOT EXISTS ix_compliance_results_severity
  ON compliance_results(severity);
"#;
