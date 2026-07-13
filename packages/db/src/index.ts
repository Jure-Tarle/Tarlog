/**
 * @tarlog/db — public barrel. Dual-dialect Drizzle schema (doc 05 §2.1, doc 06).
 *
 * Ein logisches Datenmodell, zwei Dialekte:
 *  - SQLite (Client-DB, better-sqlite3) → `sqliteSchema` / Namespace `sqlite`.
 *  - PostgreSQL (Server-DB, node-postgres) → `pgSchema` / Namespace `postgres`.
 *
 * Beide Dateien exportieren dieselben Tabellennamen (`mainAccounts`, …), daher
 * werden sie als getrennte Namespaces re-exportiert (kein flacher `export *`,
 * der kollidieren würde). Die aggregierten Schema-Objekte `sqliteSchema`/
 * `pgSchema` sind für `drizzle(client, { schema })` gedacht.
 */

// Dialekt-Namespaces (Tabellen einzeln zugreifbar: sqlite.timeEntries etc.)
export * as sqlite from "./schema/sqlite.js";
export * as postgres from "./schema/postgres.js";

// Aggregierte Schema-Objekte (für drizzle(client, { schema }))
export { sqliteSchema } from "./schema/sqlite.js";
export { pgSchema } from "./schema/postgres.js";

// Migrations-Helper (better-sqlite3 + node-postgres)
export {
  migrateSqliteDatabase,
  migratePostgresDatabase,
} from "./migrate.js";

// ---------------------------------------------------------------------------
// drizzle-kit Config-Beispiele (doc 05 §2.1)
//
// Diese Objekte dokumentieren die Struktur, die drizzle-kit erwartet. Die
// tatsächlich genutzten Configs liegen im Package-Root als
// `drizzle.config.sqlite.ts` und `drizzle.config.postgres.ts` (default-Export
// via `defineConfig`). Hier als Beispiel-Konstanten, damit Konsumenten die
// Konvention referenzieren können, ohne drizzle-kit zu importieren.
// ---------------------------------------------------------------------------

/** Beispiel-Config für den SQLite-Client (drizzle-kit generate/migrate). */
export const drizzleSqliteConfigExample = {
  dialect: "sqlite",
  schema: "./src/schema/sqlite.ts",
  out: "./drizzle/sqlite",
  dbCredentials: { url: "file:./local.db" },
} as const;

/** Beispiel-Config für die PostgreSQL-Server-DB (drizzle-kit generate/migrate). */
export const drizzlePostgresConfigExample = {
  dialect: "postgresql",
  schema: "./src/schema/postgres.ts",
  out: "./drizzle/postgres",
  dbCredentials: {
    url: "postgres://user:password@localhost:5432/ptl",
  },
} as const;
