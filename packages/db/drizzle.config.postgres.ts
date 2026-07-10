/**
 * drizzle-kit Config — PostgreSQL-Server-DB (doc 05 §2.1).
 *
 * Verwendung:
 *   pnpm drizzle-kit generate --config=drizzle.config.postgres.ts
 *   pnpm drizzle-kit migrate  --config=drizzle.config.postgres.ts
 *
 * Die generierten Migrationen wendet zur Laufzeit `migratePostgresDatabase`
 * (src/migrate.ts) an.
 */
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/postgres.ts",
  out: "./drizzle/postgres",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://user:password@localhost:5432/ptl",
  },
  strict: true,
  verbose: true,
});
