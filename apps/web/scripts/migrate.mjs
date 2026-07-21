// @ts-nocheck
/**
 * scripts/migrate.mjs, wendet die PostgreSQL-Migrationen an (doc 05 §9.5).
 *
 * Bewusst abhängigkeitsarm: das Skript nutzt AUSSCHLIESSLICH `pg`. Es ist nicht
 * Teil des Next-Trace, deshalb steht im `output: 'standalone'`-Bundle weder
 * `drizzle-orm` (Next bündelt es in die Server-Chunks) noch @tarlog/db mit intakten
 * transitiven Abhängigkeiten zur Verfügung. `pg` dagegen bleibt als natives
 * Paket extern und ist im Image auflösbar.
 *
 * Es liest das von drizzle-kit erzeugte Journal (`meta/_journal.json`), führt
 * jede noch nicht angewandte `<tag>.sql` in einer Transaktion aus und merkt sich
 * den Tag in `_ptl_migrations`. Idempotent: ein zweiter Lauf ist ein No-op.
 *
 * Die SQL-Dateien erzeugt drizzle-kit außerhalb des Images:
 *   pnpm --filter @tarlog/db exec drizzle-kit generate --config=drizzle.config.postgres.gen.ts
 *
 *   DATABASE_URL=postgres://… node scripts/migrate.mjs
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import pg from "pg";

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL nicht gesetzt.");
  process.exit(1);
}

// Auch im Image gültig: /app/apps/web/scripts → /app/packages/db/drizzle/postgres
const migrationsFolder = resolve(__dirname, "../../../packages/db/drizzle/postgres");
const journalPath = join(migrationsFolder, "meta", "_journal.json");

if (!existsSync(journalPath)) {
  console.error(
    `[migrate] Migrations-Journal fehlt: ${journalPath}\n` +
      "Zuerst generieren: pnpm --filter @tarlog/db exec drizzle-kit generate --config=drizzle.config.postgres.gen.ts",
  );
  process.exit(1);
}

/** drizzle-kit trennt Statements mit dieser Marke. */
const BREAKPOINT = "--> statement-breakpoint";

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const entries = (journal.entries ?? []).sort((a, b) => a.idx - b.idx);

const pool = new Pool({ connectionString: DATABASE_URL });

try {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _ptl_migrations (
       tag        TEXT PRIMARY KEY,
       applied_at BIGINT NOT NULL
     )`,
  );
  const done = new Set(
    (await pool.query("SELECT tag FROM _ptl_migrations")).rows.map((r) => r.tag),
  );

  let applied = 0;
  for (const entry of entries) {
    if (done.has(entry.tag)) continue;

    const sqlPath = join(migrationsFolder, `${entry.tag}.sql`);
    if (!existsSync(sqlPath)) {
      throw new Error(`Migration ${entry.tag} fehlt unter ${sqlPath}`);
    }
    const statements = readFileSync(sqlPath, "utf8")
      .split(BREAKPOINT)
      .map((s) => s.trim())
      .filter(Boolean);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const stmt of statements) await client.query(stmt);
      await client.query("INSERT INTO _ptl_migrations(tag, applied_at) VALUES ($1, $2)", [
        entry.tag,
        Date.now(),
      ]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${entry.tag} fehlgeschlagen: ${err.message}`);
    } finally {
      client.release();
    }
    console.log(`[migrate] angewendet: ${entry.tag}`);
    applied += 1;
  }

  console.log(
    applied === 0
      ? "[migrate] Schema aktuell, nichts anzuwenden."
      : `[migrate] ${applied} Migration(en) angewendet: ${migrationsFolder}`,
  );
} catch (err) {
  console.error("[migrate] fehlgeschlagen:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
