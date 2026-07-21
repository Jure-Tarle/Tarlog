/**
 * db.ts, local SQLite (expo-sqlite) open + migration runner (doc 05 §2.1,
 * doc 11 §7 iOS local-first).
 *
 * The mobile client persists local-first into `ptl.db`. The schema here is
 * STRUKTURGLEICH to the `@tarlog/db` `sqlite` Drizzle namespace: identical table
 * and column names (snake_case), the same type conventions (epoch-ms UTC as
 * INTEGER, durations `*_seconds` INTEGER, money `*_cents` INTEGER, ids UUIDv7
 * as TEXT, JSON as TEXT, booleans as INTEGER 0/1). Only the CORE subset of
 * tables the iOS app needs is created here (doc 02 §4.5, doc 11 §7):
 *
 *   main_accounts, customers, projects, tasks, time_entries,
 *   time_entry_breaks, timer_states, rounding_rules, settings, sync_events
 *
 * Any divergence in a field name from `@tarlog/db` sqlite is a data-model bug.
 *
 * Business logic (net/rounding/billing/compliance) is NEVER done in SQL here ,
 * it comes from `@tarlog/core`. This module only owns storage + schema versioning.
 */
import * as SQLite from "expo-sqlite";

/** The single local database file (doc 05 §2.1). */
export const DB_NAME = "ptl.db" as const;

let connection: SQLite.SQLiteDatabase | null = null;

/**
 * Open (and cache) the local database. `openDatabaseSync` is idempotent per
 * name inside expo-sqlite; we memoize so all callers share one handle. Foreign
 * keys are enabled per connection.
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (!connection) {
    connection = SQLite.openDatabaseSync(DB_NAME);
    connection.execSync("PRAGMA foreign_keys = ON;");
  }
  return connection;
}

/** Drop the cached handle (tests, or after a destructive local wipe). */
export function resetDb(): void {
  connection = null;
}

/**
 * Ordered DDL migrations. Index 0 is applied when `user_version` is 0, index 1
 * when it is 1, and so on. Append new migrations, never edit a shipped one.
 * Column names/types mirror `@tarlog/db` sqlite exactly (see module doc).
 */
const MIGRATIONS: readonly string[] = [
  // 0 → 1: core tables for the iOS local-first subset.
  `
  CREATE TABLE IF NOT EXISTS main_accounts (
    id TEXT PRIMARY KEY NOT NULL,
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

  CREATE TABLE IF NOT EXISTS rounding_rules (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
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

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
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
    default_rounding_rule_id TEXT REFERENCES rounding_rules(id),
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
  CREATE INDEX IF NOT EXISTS ix_customers_main_account ON customers(main_account_id);
  CREATE INDEX IF NOT EXISTS ix_customers_status ON customers(status);

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
    name TEXT NOT NULL,
    customer_id TEXT REFERENCES customers(id),
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
    rounding_rule_id TEXT REFERENCES rounding_rules(id),
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
  CREATE INDEX IF NOT EXISTS ix_projects_main_account ON projects(main_account_id);
  CREATE INDEX IF NOT EXISTS ix_projects_customer ON projects(customer_id);
  CREATE INDEX IF NOT EXISTS ix_projects_status ON projects(status);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
    project_id TEXT REFERENCES projects(id),
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
  CREATE INDEX IF NOT EXISTS ix_tasks_main_account ON tasks(main_account_id);

  CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
    project_id TEXT REFERENCES projects(id),
    task_id TEXT REFERENCES tasks(id),
    customer_id TEXT REFERENCES customers(id),
    status TEXT NOT NULL,
    timezone TEXT NOT NULL,
    actual_started_at INTEGER NOT NULL,
    actual_ended_at INTEGER,
    actual_duration_seconds INTEGER NOT NULL,
    break_duration_seconds INTEGER DEFAULT 0,
    net_work_duration_seconds INTEGER NOT NULL,
    billing_duration_seconds INTEGER NOT NULL,
    rounding_rule_id TEXT REFERENCES rounding_rules(id),
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
  CREATE INDEX IF NOT EXISTS ix_time_entries_status ON time_entries(status);
  CREATE INDEX IF NOT EXISTS ix_time_entries_billable_invoice ON time_entries(is_billable, invoice_id);
  CREATE INDEX IF NOT EXISTS ix_time_entries_backdated ON time_entries(is_backdated);

  CREATE TABLE IF NOT EXISTS time_entry_breaks (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
    time_entry_id TEXT NOT NULL REFERENCES time_entries(id),
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

  CREATE TABLE IF NOT EXISTS timer_states (
    timer_id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
    current_time_entry_id TEXT REFERENCES time_entries(id),
    status TEXT NOT NULL DEFAULT 'idle',
    project_id TEXT REFERENCES projects(id),
    task_id TEXT REFERENCES tasks(id),
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

  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
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
  CREATE UNIQUE INDEX IF NOT EXISTS ux_settings_key
    ON settings(main_account_id, scope, device_id, key);

  CREATE TABLE IF NOT EXISTS sync_events (
    id TEXT PRIMARY KEY NOT NULL,
    main_account_id TEXT NOT NULL REFERENCES main_accounts(id),
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
  CREATE INDEX IF NOT EXISTS ix_sync_events_main_account ON sync_events(main_account_id);
  CREATE INDEX IF NOT EXISTS ix_sync_events_entity ON sync_events(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS ix_sync_events_hlc ON sync_events(hlc);
  CREATE INDEX IF NOT EXISTS ix_sync_events_server_revision ON sync_events(server_revision);
  CREATE INDEX IF NOT EXISTS ix_sync_events_created_at ON sync_events(created_at);
  `,
];

/** The schema version this build ships (= number of migrations). */
export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Apply all pending migrations. Reads `PRAGMA user_version`, runs every
 * migration whose index is >= the current version inside a transaction, then
 * bumps `user_version`. Safe to call on every app start; a fully migrated DB is
 * a no-op. Returns the resulting schema version.
 */
export function migrate(db: SQLite.SQLiteDatabase = getDb()): number {
  const row = db.getFirstSync<{ user_version: number }>("PRAGMA user_version;");
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    const ddl = MIGRATIONS[version];
    if (ddl === undefined) continue;
    db.withTransactionSync(() => {
      db.execSync(ddl);
      // PRAGMA cannot be parameterized; version is a trusted loop integer.
      db.execSync(`PRAGMA user_version = ${version + 1};`);
    });
  }
  return MIGRATIONS.length;
}

/** Open the DB and run migrations. Call once during app bootstrap. */
export function initDb(): SQLite.SQLiteDatabase {
  const db = getDb();
  migrate(db);
  return db;
}
