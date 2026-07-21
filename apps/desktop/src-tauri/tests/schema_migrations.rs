//! Regression coverage for desktop-runtime tables read directly by the UI.

use tarlog_desktop_lib::db;
use rusqlite::Connection;

fn column_names(conn: &Connection, table: &str) -> Vec<String> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .expect("prepare table_info");
    statement
        .query_map([], |row| row.get(1))
        .expect("query table_info")
        .collect::<rusqlite::Result<Vec<String>>>()
        .expect("collect table_info")
}

fn index_exists(conn: &Connection, index: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?1)",
        [index],
        |row| row.get(0),
    )
    .expect("query index")
}

#[test]
fn fresh_database_contains_invoice_and_compliance_repository_schema() {
    let conn = Connection::open_in_memory().expect("open in-memory database");

    assert_eq!(db::run_migrations(&conn).expect("run migrations"), 8);
    assert_eq!(db::user_version(&conn).expect("read schema version"), 8);
    assert!(column_names(&conn, "rounding_rules").contains(&"priority".to_string()));
    for column in [
        "first_name",
        "last_name",
        "street",
        "house_number",
        "postal_code",
        "city",
        "country",
    ] {
        assert!(
            column_names(&conn, "customers").contains(&column.to_string()),
            "missing customer column {column}"
        );
    }

    assert_eq!(
        column_names(&conn, "invoices"),
        [
            "id",
            "main_account_id",
            "customer_id",
            "invoice_number",
            "number_range_id",
            "type",
            "status",
            "dunning_status",
            "issue_date",
            "service_period_start",
            "service_period_end",
            "service_date",
            "payment_due_date",
            "currency",
            "net_amount_cents",
            "tax_amount_cents",
            "gross_amount_cents",
            "tax_rate",
            "small_business_note",
            "reverse_charge_note",
            "customer_snapshot",
            "project_snapshot",
            "rate_snapshot",
            "rounding_snapshot",
            "finalized_at",
            "cancels_invoice_id",
            "notes",
            "created_at",
            "updated_at",
            "sync_version",
            "server_revision",
            "local_revision",
            "hlc",
            "last_modified_by_device",
        ]
    );
    assert_eq!(
        column_names(&conn, "compliance_results"),
        [
            "id",
            "main_account_id",
            "compliance_profile_id",
            "scope",
            "scope_date",
            "time_entry_id",
            "rule_code",
            "severity",
            "message",
            "override_reason",
            "overridden_by_device",
            "calculation_version",
            "created_at",
            "updated_at",
        ]
    );

    for index in [
        "ix_invoices_main_account",
        "ix_invoices_status",
        "ux_invoices_number",
        "ix_compliance_results_scope_date",
        "ix_compliance_results_severity",
        "ix_attachments_entity",
    ] {
        assert!(index_exists(&conn, index), "missing index {index}");
    }

    // Execute the exact SQL shapes used by `src/data/repositories.ts`.
    {
        let mut statement = conn
            .prepare("SELECT * FROM invoices ORDER BY issue_date DESC LIMIT ?1")
            .expect("prepare invoice repository query");
        let mut rows = statement
            .query([100_i64])
            .expect("run invoice repository query");
        assert!(rows.next().expect("read invoice result").is_none());
    }
    {
        let mut statement = conn
            .prepare(
                "SELECT * FROM compliance_results \
                 WHERE scope = 'day' AND scope_date >= ?1 AND scope_date < ?2 \
                 ORDER BY scope_date DESC",
            )
            .expect("prepare compliance repository query");
        let mut rows = statement
            .query(["2026-01-01", "2026-02-01"])
            .expect("run compliance repository query");
        assert!(rows.next().expect("read compliance result").is_none());
    }
}

#[test]
fn version_one_database_upgrades_once_and_then_is_a_no_op() {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    conn.execute_batch(
        "CREATE TABLE v1_marker (id INTEGER PRIMARY KEY); \
         CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL); \
         INSERT INTO customers(id, name) VALUES ('c1', 'Ada Lovelace'); \
         INSERT INTO v1_marker(id) VALUES (1); \
         PRAGMA user_version=1;",
    )
    .expect("create v1 fixture");

    assert_eq!(db::run_migrations(&conn).expect("upgrade v1"), 7);
    assert_eq!(db::user_version(&conn).expect("read schema version"), 8);
    assert!(!column_names(&conn, "invoices").is_empty());
    assert!(!column_names(&conn, "compliance_results").is_empty());
    assert_eq!(
        conn.query_row(
            "SELECT first_name || ' ' || last_name FROM customers WHERE id='c1'",
            [],
            |row| row.get::<_, String>(0)
        )
        .expect("read normalized name"),
        "Ada Lovelace"
    );
    assert_eq!(
        conn.query_row("SELECT id FROM v1_marker", [], |row| row.get::<_, i64>(0))
            .expect("read v1 marker"),
        1,
        "the upgrade must preserve existing v1 data",
    );

    assert_eq!(db::run_migrations(&conn).expect("rerun migrations"), 0);
}

#[test]
fn version_three_database_adds_document_storage_once() {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    conn.execute_batch("PRAGMA user_version=3;")
        .expect("create v3 fixture");

    assert_eq!(db::run_migrations(&conn).expect("upgrade v3"), 5);
    assert_eq!(db::user_version(&conn).expect("read schema version"), 8);
    for column in [
        "entity_type",
        "entity_id",
        "storage_path",
        "checksum_sha256",
        "deleted_at",
    ] {
        assert!(
            column_names(&conn, "attachments").contains(&column.to_string()),
            "missing attachment column {column}"
        );
    }
    assert_eq!(db::run_migrations(&conn).expect("rerun v4"), 0);
}

#[test]
fn version_six_database_restores_soft_deleted_archived_projects() {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    conn.execute_batch(
        "CREATE TABLE projects (id TEXT PRIMARY KEY, status TEXT NOT NULL, \
          deleted_at INTEGER, archived_at INTEGER, updated_at INTEGER); \
         INSERT INTO projects(id, status, deleted_at, archived_at, updated_at) \
          VALUES ('p1', 'archived', 100, 100, 100), ('p2', 'active', NULL, NULL, 100); \
         PRAGMA user_version=6;",
    )
    .expect("create v6 fixture");

    assert_eq!(db::run_migrations(&conn).expect("upgrade v6"), 2);
    assert_eq!(db::user_version(&conn).expect("read schema version"), 8);
    let deleted: Option<i64> = conn
        .query_row("SELECT deleted_at FROM projects WHERE id='p1'", [], |row| {
            row.get(0)
        })
        .expect("read previously archived project");
    assert_eq!(
        deleted, None,
        "archived projects soft-deleted by the old archive path must become visible again",
    );
}

#[test]
fn version_seven_database_restores_soft_deleted_archived_customers() {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    conn.execute_batch(
        "CREATE TABLE customers (id TEXT PRIMARY KEY, status TEXT NOT NULL, \
          deleted_at INTEGER, updated_at INTEGER); \
         INSERT INTO customers(id, status, deleted_at, updated_at) \
          VALUES ('c1', 'archived', 100, 100), ('c2', 'active', NULL, 100); \
         PRAGMA user_version=7;",
    )
    .expect("create v7 fixture");

    assert_eq!(db::run_migrations(&conn).expect("upgrade v7"), 1);
    assert_eq!(db::user_version(&conn).expect("read schema version"), 8);
    let deleted: Option<i64> = conn
        .query_row("SELECT deleted_at FROM customers WHERE id='c1'", [], |row| {
            row.get(0)
        })
        .expect("read previously archived customer");
    assert_eq!(
        deleted, None,
        "archived customers soft-deleted by the old archive path must become visible again",
    );
}

#[test]
fn future_database_version_fails_closed_without_downgrade() {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    conn.execute_batch(
        "CREATE TABLE future_marker (id INTEGER PRIMARY KEY); \
         INSERT INTO future_marker(id) VALUES (1); \
         PRAGMA user_version=9;",
    )
    .expect("create future fixture");

    let error = db::run_migrations(&conn).expect_err("future schema must be rejected");
    assert!(error.contains("newer than this app supports"));
    assert_eq!(db::user_version(&conn).expect("read schema version"), 9);
    assert_eq!(
        conn.query_row("SELECT id FROM future_marker", [], |row| row
            .get::<_, i64>(0))
            .expect("read future marker"),
        1,
        "the incompatible database must remain untouched",
    );
}
