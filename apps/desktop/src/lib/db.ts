/**
 * db.ts — direct SQLite access via `tauri-plugin-sql`.
 *
 * This is the READ path and the local repository base. For mutations that carry
 * business logic (timer state machine, rounding, snapshots, sync events) go
 * through {@link ./bridge} Rust commands instead — those own invariants that
 * must not be bypassed by raw SQL.
 *
 * Use this module for:
 *   - fast read queries that back list/table views, and
 *   - building typed repositories on top of {@link Repository}.
 *
 * The local DB is `sqlite:ptl.db`, resolved by the plugin relative to the app's
 * data directory (doc 02 §3.1 local-first, doc 05 §2.1 SQLite client).
 */
import Database from "@tauri-apps/plugin-sql";
import type { CustomerInput, ProjectInput, TimeEntryInput } from "@tarlog/core";

/** The single local database URL (doc 05 §2.1). */
export const DB_URL = "sqlite:ptl.db" as const;

let connection: Promise<Database> | null = null;

/**
 * Lazily open (and cache) the local database connection. `Database.load` is
 * idempotent per URL inside the plugin; we memoize the promise so concurrent
 * callers share one connection.
 */
export function getDb(): Promise<Database> {
  if (!connection) connection = Database.load(DB_URL);
  return connection;
}

/** Reset the cached connection (tests, or after a destructive "Alles löschen"). */
export function resetDb(): void {
  connection = null;
}

/**
 * Run a parameterized SELECT and return typed rows. Values are bound via `$1..$n`
 * placeholders (tauri-plugin-sql sqlite dialect) — never string-concatenate SQL.
 */
export async function select<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/**
 * Execute a write (INSERT/UPDATE/DELETE). Prefer {@link ./bridge} commands for
 * anything with business rules; use this only for local-only bookkeeping.
 */
export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId: number }> {
  const db = await getDb();
  const res = await db.execute(sql, params);
  return { rowsAffected: res.rowsAffected, lastInsertId: res.lastInsertId ?? 0 };
}

/**
 * Minimal read-repository base. A concrete repository names its table + row type
 * and inherits generic list/get/count helpers. Extend it per entity in
 * `src/lib/repositories/*` (that folder is owned by the data-layer author).
 *
 * Example:
 * ```ts
 * class CustomerRepo extends Repository<CustomerRow> {
 *   constructor() { super("customers"); }
 * }
 * ```
 */
export abstract class Repository<Row> {
  protected constructor(
    /** SQL table name (doc 06). */
    protected readonly table: string,
    /** Primary-key column; almost always "id". */
    protected readonly pk: string = "id",
  ) {}

  /** All rows, newest first by primary key (UUIDv7 is time-ordered). */
  list(limit = 200, offset = 0): Promise<Row[]> {
    return select<Row>(
      `SELECT * FROM ${this.table} ORDER BY ${this.pk} DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
  }

  /** One row by primary key, or null. */
  async get(id: string): Promise<Row | null> {
    const rows = await select<Row>(
      `SELECT * FROM ${this.table} WHERE ${this.pk} = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Row count. */
  async count(): Promise<number> {
    const rows = await select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ${this.table}`,
    );
    return rows[0]?.n ?? 0;
  }
}

// Row aliases for the data-layer author to build repositories against. They
// mirror @tarlog/core input types so the local rows share the one data model.
export type CustomerRow = CustomerInput;
export type ProjectRow = ProjectInput;
export type TimeEntryRow = TimeEntryInput;
