/**
 * Migrations-Helper (doc 05 §2.1). Wendet die generierten Drizzle-Migrationen
 * an — SQLite (Client, better-sqlite3) und PostgreSQL (Server, node-postgres).
 *
 * Nur dünne Wrapper um die Drizzle-Migratoren; keine Business-Logik. Die
 * SQL-Migrationsdateien erzeugt `drizzle-kit generate` aus den Schemata
 * (siehe drizzle.config.sqlite.ts / drizzle.config.postgres.ts).
 */
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { migrate as migrateSqlite } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";

import { sqliteSchema } from "./schema/sqlite.js";
import { pgSchema } from "./schema/postgres.js";

/**
 * Wendet SQLite-Migrationen auf die lokale Client-DB an.
 *
 * @param database  better-sqlite3 `Database`-Instanz (offen).
 * @param migrationsFolder  Ordner mit den generierten `.sql`-Migrationen.
 * @returns die verbundene Drizzle-Instanz (Schema getippt).
 */
export function migrateSqliteDatabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
  migrationsFolder: string,
) {
  const db = drizzleSqlite(database, { schema: sqliteSchema });
  migrateSqlite(db, { migrationsFolder });
  return db;
}

/**
 * Wendet PostgreSQL-Migrationen auf die Server-DB an.
 *
 * @param pool  node-postgres `Pool` (oder `Client`).
 * @param migrationsFolder  Ordner mit den generierten `.sql`-Migrationen.
 * @returns die verbundene Drizzle-Instanz (Schema getippt).
 */
export async function migratePostgresDatabase(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool: any,
  migrationsFolder: string,
) {
  const db = drizzlePg(pool, { schema: pgSchema });
  await migratePg(db, { migrationsFolder });
  return db;
}
