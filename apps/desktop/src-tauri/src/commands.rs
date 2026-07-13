//! commands.rs — THE RUST SIDE OF THE FRONTEND↔RUST CONTRACT.
//!
//! One `#[tauri::command]` per function in `src/lib/bridge.ts`. Signatures
//! (name + args + return-JSON) are FROZEN — the Rust author fills the bodies but
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

/// `db_init` — open/create the local SQLite DB at the app-data path.
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

/// `db_migrate` — apply pending migrations. Returns `{ ok, applied, version }`.
#[tauri::command]
pub fn db_migrate() -> Result<Value, String> {
    let conn = db::open()?;
    let applied = db::run_migrations(&conn)?;
    let version = db::user_version(&conn)?;
    Ok(json!({ "ok": true, "applied": applied, "version": version }))
}

// ---- Timer state machine (doc 03, doc 06 `timer_states`) ----------------

/// `timer_start` — start the singleton timer. Returns the `TimerState`.
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

/// `timer_pause` — pause the running timer. Returns the `TimerState`.
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

/// `timer_resume` — resume a paused timer. Returns the `TimerState`.
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

/// `timer_stop` — stop + finalize the entry. Returns `{ timer, entry }`.
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
    conn.execute(
        "INSERT INTO time_entries(\
         id, main_account_id, project_id, task_id, status, timezone, \
         actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds, \
         net_work_duration_seconds, billing_duration_seconds, calculation_version, \
         description, is_billable, source, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, 'stopped', ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, 1, \
         'live_timer', ?13, ?13)",
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

/// `timer_get_state` — read the current timer singleton. Returns `TimerState`.
#[tauri::command]
pub fn timer_get_state() -> Result<Value, String> {
    let conn = db::open()?;
    db::read_timer_state(&conn)
}

// ---- Entries (doc 03 §7 backdate, doc 06 A.3) ---------------------------

/// `entry_backdate` — create a manually backdated entry from `input`
/// (`BackdateEntryInput`). Returns the persisted `TimeEntryRow`.
#[tauri::command]
pub fn entry_backdate(input: Value) -> Result<Value, String> {
    let conn = db::open()?;
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
    // Break seconds: explicit field, else summed from the `breaks[]` spans.
    let break_secs = v_i64(&input, "break_duration_seconds").unwrap_or_else(|| {
        input
            .get("breaks")
            .and_then(|b| b.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|br| {
                        let s = br.get("started_at").and_then(|x| x.as_i64()).unwrap_or(0);
                        let e = br.get("ended_at").and_then(|x| x.as_i64()).unwrap_or(0);
                        ((e - s) / 1000).max(0)
                    })
                    .sum()
            })
            .unwrap_or(0)
    });
    let actual = ((ended - started) / 1000).max(0);
    let net = (actual - break_secs).max(0);
    let billing = net;
    let id = db::new_uuid();
    let now = db::now_ms();
    conn.execute(
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
    db::audit(
        &conn,
        "entry_backdated",
        "time_entries",
        &id,
        reason.as_deref(),
    );
    db::time_entry_by_id(&conn, &id)?
        .ok_or_else(|| "entry_backdate: row vanished after insert".to_string())
}

/// `list_time_entries` — query entries by range/project/customer.
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
        "company": db::col_str(row, 3)?,
        "contact_person": db::col_str(row, 4)?,
        "email": db::col_str(row, 5)?,
        "phone": db::col_str(row, 6)?,
        "vat_id": db::col_str(row, 7)?,
        "customer_number": db::col_str(row, 8)?,
        "payment_term_days": db::col_int(row, 9)?,
        "default_currency": db::col_str(row, 10)?,
        "default_hourly_rate_cents": db::col_int(row, 11)?,
        "default_day_rate_cents": db::col_int(row, 12)?,
        "default_rounding_rule_id": db::col_str(row, 13)?,
        "default_tax_rate": db::col_real(row, 14)?,
        "reverse_charge_hint": db::col_bool(row, 15)?,
        "small_business_hint": db::col_bool(row, 16)?,
        "preferred_export_detail": db::col_str(row, 17)?,
        "status": db::col_str(row, 18)?,
    }))
}

const CUSTOMER_COLS: &str = "id, main_account_id, name, company, contact_person, email, phone, \
vat_id, customer_number, payment_term_days, default_currency, default_hourly_rate_cents, \
default_day_rate_cents, default_rounding_rule_id, default_tax_rate, reverse_charge_hint, \
small_business_hint, preferred_export_detail, status";

/// `create_customer` — insert a customer from `input` (`CustomerInput`).
/// Returns the persisted `CustomerRow`.
#[tauri::command]
pub fn create_customer(input: Value) -> Result<Value, String> {
    let conn = db::open()?;
    let name = v_str(&input, "name").ok_or_else(|| "create_customer: name required".to_string())?;
    let id = v_str(&input, "id").unwrap_or_else(db::new_uuid);
    let now = db::now_ms();
    conn.execute(
        "INSERT INTO customers(\
         id, main_account_id, name, company, contact_person, email, phone, vat_id, \
         customer_number, payment_term_days, default_currency, default_hourly_rate_cents, \
         default_day_rate_cents, default_rounding_rule_id, default_tax_rate, reverse_charge_hint, \
         small_business_hint, preferred_export_detail, status, created_at, updated_at) \
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
         ?18, ?19, ?20, ?20)",
        params![
            id,
            db::MAIN_ACCOUNT_ID,
            name,
            v_str(&input, "company"),
            v_str(&input, "contact_person"),
            v_str(&input, "email"),
            v_str(&input, "phone"),
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

/// `list_customers` — list customers, optional `status` filter.
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

/// `create_project` — insert a project from `input` (`ProjectInput`).
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

/// `list_projects` — list projects, optional `customer_id`/`status` filters.
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

/// `run_backup` — create a local SQLite backup. Returns
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
    std::fs::copy(&src, &dest).map_err(|e| format!("copy db: {e}"))?;
    let size = std::fs::metadata(&dest)
        .map(|m| m.len() as i64)
        .map_err(|e| format!("stat backup: {e}"))?;
    // Integrity check on the copy.
    let integrity = {
        let check = Connection::open(&dest).map_err(|e| format!("open backup: {e}"))?;
        check
            .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
            .unwrap_or_else(|_| "unknown".to_string())
    };
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
    }))
}

/// `app_lock_check` — verify the app lock (password or macOS Touch ID via
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
        // No lock configured — nothing to unlock.
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

/// `set_server_connection` — switch local vs. server mode. Returns
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

/// `sync_push` — push local outbox events. Returns
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

/// `sync_pull` — pull the server delta since `since_revision`. Returns
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
