/**
 * drizzle-kit Config, SQLite-Client-DB (doc 05 §2.1).
 *
 * Verwendung:
 *   pnpm drizzle-kit generate --config=drizzle.config.sqlite.ts
 *   pnpm drizzle-kit migrate  --config=drizzle.config.sqlite.ts
 *
 * Die generierten Migrationen wendet zur Laufzeit `migrateSqliteDatabase`
 * (src/migrate.ts) an.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/sqlite.ts",
  out: "./drizzle/sqlite",
  dbCredentials: {
    url: process.env.SQLITE_DB_URL ?? "file:./local.db",
  },
  strict: true,
  verbose: true,
});
