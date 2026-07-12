//! Laufzeitnachweis des lokalen Desktop-Modus (doc 02 §4.1, AC1/AC24).
//!
//! Führt die echten `#[tauri::command]`-Funktionen headless gegen eine
//! Wegwerf-SQLite-Datei aus (`PTL_DB_PATH`). Beweist ohne GUI, dass Migration,
//! Timer-Zustandsmaschine, Single-Timer-Invariante, Nachtrag, Stammdaten und
//! Backup real funktionieren.
//!
//! Ein einziger Test-Body, weil `PTL_DB_PATH` prozessglobal ist und die
//! Kommandos den DB-Singleton teilen.

use ptl_desktop_lib::{commands, db};
use serde_json::json;

fn i(v: &serde_json::Value, k: &str) -> i64 {
    v.get(k).and_then(|x| x.as_i64()).unwrap_or(-1)
}
fn s(v: &serde_json::Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

#[test]
fn local_mode_end_to_end() {
    // --- Wegwerf-Datenbank -------------------------------------------------
    let path = std::env::temp_dir().join(format!("ptl-test-{}.db", std::process::id()));
    let _ = std::fs::remove_file(&path);
    std::env::set_var("PTL_DB_PATH", &path);

    // --- 1. Migration ------------------------------------------------------
    let init = commands::db_init().expect("db_init");
    assert_eq!(init.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(i(&init, "version"), db::SCHEMA_VERSION);

    // Zweiter Lauf ist idempotent (keine weitere Migration).
    let again = commands::db_migrate().expect("db_migrate");
    assert_eq!(i(&again, "applied"), 0, "Migration muss idempotent sein");

    // --- 2. Stammdaten -----------------------------------------------------
    let cust = commands::create_customer(json!({
        "name": "ACME GmbH",
        "default_currency": "EUR",
        "default_hourly_rate_cents": 9000,
        "status": "active"
    }))
    .expect("create_customer");
    let customer_id = s(&cust, "id");
    assert!(!customer_id.is_empty());
    assert_eq!(
        commands::list_customers(None).expect("list_customers").as_array().map(|a| a.len()),
        Some(1)
    );

    let proj = commands::create_project(json!({
        "name": "Website",
        "customer_id": customer_id,
        "billing_type": "hourly",
        "hourly_rate_cents": 9000,
        "status": "active"
    }))
    .expect("create_project");
    let project_id = s(&proj, "id");
    assert!(!project_id.is_empty());
    assert_eq!(
        commands::list_projects(None, None).expect("list_projects").as_array().map(|a| a.len()),
        Some(1)
    );

    // --- 3. Timer-Zustandsmaschine ----------------------------------------
    let idle = commands::timer_get_state().expect("timer_get_state");
    assert_eq!(s(&idle, "status"), "idle");

    // Start 70 Minuten in der Vergangenheit (4_200_000 ms).
    let now = db::now_ms();
    let started_at = now - 4_200_000;
    let running = commands::timer_start(Some(project_id.clone()), None, None, Some(started_at))
        .expect("timer_start");
    assert_eq!(s(&running, "status"), "running");
    assert_eq!(i(&running, "started_at"), started_at);

    // Single-Timer-Invariante: zweiter Start muss scheitern (doc 04 §3).
    let second = commands::timer_start(Some(project_id.clone()), None, None, None);
    assert!(second.is_err(), "zweiter Start darf nicht erlaubt sein");
    assert!(
        second.unwrap_err().contains("409"),
        "Konflikt muss als 409 gemeldet werden"
    );

    // Pause 60 s, dann fortsetzen → 60 s akkumulierte Pause.
    let pause_at = now - 600_000;
    let paused = commands::timer_pause(Some(pause_at)).expect("timer_pause");
    assert_eq!(s(&paused, "status"), "paused");
    let resumed = commands::timer_resume(Some(pause_at + 60_000)).expect("timer_resume");
    assert_eq!(s(&resumed, "status"), "running");
    assert_eq!(i(&resumed, "accumulated_pause_seconds"), 60);

    // Stopp genau bei `now` → brutto 4200 s, Pause 60 s, netto 4140 s.
    let stopped = commands::timer_stop(Some("Konzeptarbeit".into()), Some(now)).expect("timer_stop");
    let timer = stopped.get("timer").expect("timer");
    let entry = stopped.get("entry").expect("entry");
    assert_eq!(s(timer, "status"), "idle", "Timer nach Stopp zurückgesetzt");

    assert_eq!(i(entry, "actual_duration_seconds"), 4200, "Ist-Zeit brutto");
    assert_eq!(i(entry, "break_duration_seconds"), 60);
    assert_eq!(i(entry, "net_work_duration_seconds"), 4140, "netto = brutto - Pause");
    // Rundung passiert in der TS-Schicht (@ptl/core); Rust persistiert netto.
    assert_eq!(i(entry, "billing_duration_seconds"), 4140);
    assert_eq!(s(entry, "source"), "live_timer");
    assert_eq!(s(entry, "description"), "Konzeptarbeit");

    // Rundung darf die Ist-Zeit nie überschreiben (doc 07 Leitprinzip).
    assert_ne!(
        i(entry, "actual_duration_seconds"),
        i(entry, "net_work_duration_seconds"),
        "Brutto und Netto sind getrennte Felder"
    );

    // --- 4. Nachtrag -------------------------------------------------------
    let bd_start = now - 86_400_000;
    let bd_end = bd_start + 3_600_000; // 1 h
    let backdated = commands::entry_backdate(json!({
        "project_id": project_id,
        "actual_started_at": bd_start,
        "actual_ended_at": bd_end,
        "timezone": "Europe/Berlin",
        "description": "Vergessener Timer",
        "backdate_reason": "forgot_to_start",
        "is_billable": true
    }))
    .expect("entry_backdate");
    assert_eq!(s(&backdated, "source"), "manual_backdated");
    assert_eq!(
        backdated.get("is_backdated").and_then(|v| v.as_bool()),
        Some(true)
    );
    assert_eq!(i(&backdated, "actual_duration_seconds"), 3600);

    // --- 5. Abfrage --------------------------------------------------------
    let list = commands::list_time_entries(None, None, None, None, None, None)
        .expect("list_time_entries");
    assert_eq!(list.as_array().map(|a| a.len()), Some(2), "Timer-Eintrag + Nachtrag");

    // --- 6. Backup + Integritätsprüfung -----------------------------------
    let backup = commands::run_backup(Some(true), Some(false)).expect("run_backup");
    assert_eq!(backup.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert!(i(&backup, "sizeBytes") > 0, "Backup darf nicht leer sein");
    let backup_path = s(&backup, "path");
    assert!(
        std::path::Path::new(&backup_path).exists(),
        "Backup-Datei muss existieren"
    );

    // --- 7. Audit-Log ------------------------------------------------------
    let conn = db::open().expect("open");
    let audits: i64 = conn
        .query_row("SELECT count(*) FROM audit_logs", [], |r| r.get(0))
        .expect("audit count");
    assert!(audits > 0, "kritische Änderungen müssen auditiert sein");

    // Single-Timer-Index existiert wirklich in der Datenbank.
    let idx: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='index' AND name='ux_timer_states_single_active'",
            [],
            |r| r.get(0),
        )
        .expect("index lookup");
    assert_eq!(idx, 1, "partieller UNIQUE-Index auf timer_states fehlt");

    // --- Aufräumen ---------------------------------------------------------
    drop(conn);
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(&backup_path);
}
