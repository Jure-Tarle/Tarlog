// Temporäre Generierungs-Config: zeigt auf das gebaute ESM-Schema (dist), um
// den drizzle-kit-0.30-ESM/CJS-Loader-Konflikt bei `"type":"module"` zu umgehen.
// Die kanonische Config (drizzle.config.postgres.ts) bleibt auf die .ts-Quelle.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./dist/schema/postgres.cjs",
  out: "./drizzle/postgres",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://ptl:ptl@localhost:5432/ptl",
  },
  strict: true,
  verbose: true,
});
