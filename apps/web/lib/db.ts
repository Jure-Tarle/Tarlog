/**
 * lib/db.ts, Server-DB-Zugang (doc 05 §2.1, §9.2).
 *
 * Server-Modus = PostgreSQL via drizzle-orm/node-postgres. Ein einziger
 * `pg.Pool` pro Prozess (aus `DATABASE_URL`), plus die getippte Drizzle-Instanz
 * über das aggregierte `pgSchema` aus @tarlog/db. Business-Logik gehört NICHT
 * hierher, nur Verbindung + Schema. Alle Tabellen werden als `schema.<table>`
 * (exakte @tarlog/db-Namen) re-exportiert, damit Modul-Autoren konsistent
 * darauf zugreifen.
 *
 * VERTRAG für Modul-Autoren:
 *   import { db, pool, schema } from "@/lib/db";
 *   const rows = await db.select().from(schema.timerStates)…
 */
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import { postgres, pgSchema } from "@tarlog/db";

/** Alle Postgres-Tabellen unter ihren exakten @tarlog/db-Namen. */
export const schema = postgres;
export { pgSchema };
export type DbSchema = typeof pgSchema;

/** Gemergte DB-Instanz-Typ für Helper-Signaturen. */
export type Db = NodePgDatabase<DbSchema>;

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL ist nicht gesetzt, Server-Modus benötigt eine PostgreSQL-Verbindung (doc 05 §9.2).",
    );
  }
  return url;
}

/**
 * Prozess-weiter Pool. Über globalThis gecacht, damit Next.js-HMR im Dev-Modus
 * nicht bei jedem Reload einen neuen Pool erzeugt.
 */
const globalForDb = globalThis as unknown as {
  __ptlPool?: Pool;
  __ptlDb?: Db;
};

export function createPool(config?: PoolConfig): Pool {
  return new Pool({
    connectionString: readDatabaseUrl(),
    max: 10,
    idleTimeoutMillis: 30_000,
    ...config,
  });
}

/**
 * LAZY: Pool + Drizzle werden erst beim ERSTEN Zugriff erzeugt, nicht beim
 * Import. `next build` importiert alle Route-Module zur Metadaten-Sammlung ,
 * eine eager Verbindung würde dort ohne `DATABASE_URL` werfen. Die Verbindung
 * (und damit die `DATABASE_URL`-Pflicht) entsteht erst zur Laufzeit beim ersten
 * Query. Contract bleibt exakt: `import { db, pool, schema } from "@/lib/db"`.
 */
function getPool(): Pool {
  if (!globalForDb.__ptlPool) globalForDb.__ptlPool = createPool();
  return globalForDb.__ptlPool;
}

function getDb(): Db {
  if (!globalForDb.__ptlDb) globalForDb.__ptlDb = drizzle(getPool(), { schema: pgSchema });
  return globalForDb.__ptlDb;
}

function lazyProxy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const real = resolve();
      const val = Reflect.get(real as object, prop, real);
      return typeof val === "function" ? (val as (...a: unknown[]) => unknown).bind(real) : val;
    },
    has(_t, prop) {
      return prop in (resolve() as object);
    },
  });
}

/** Singleton `pg.Pool` (kanonische Verbindung, doc 05 §9), lazy initialisiert. */
export const pool: Pool = lazyProxy(getPool);

/** Singleton Drizzle-Instanz über das aggregierte pgSchema, lazy initialisiert. */
export const db: Db = lazyProxy(getDb);

/** Leichter Liveness-Ping (`SELECT 1`), für /healthz (doc 05 §9.4). */
export async function pingDatabase(): Promise<boolean> {
  const res = await pool.query<{ ok: number }>("SELECT 1 AS ok");
  return res.rows[0]?.ok === 1;
}
