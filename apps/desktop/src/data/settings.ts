/**
 * settings.ts — account-scoped key/value settings (doc 06 `settings`). Values are
 * JSON (`value_json`). Direct SQL (local bookkeeping) via {@link ../lib/db}; the
 * unique index `ux_settings_key(main_account_id, scope, device_id, key)` makes
 * writes an upsert on `key` within `scope = "account"` (device_id NULL).
 */
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";
import { uuidv7 } from "uuidv7";

interface SettingRow {
  id: string;
  key: string;
  value_json: string;
}

/** Read a single account-scoped setting, JSON-decoded, or null if unset. */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const ctx = await getContext();
  const rows = await select<SettingRow>(
    `SELECT id, key, value_json FROM settings
      WHERE main_account_id = $1 AND scope = 'account' AND device_id IS NULL AND key = $2
      LIMIT 1`,
    [ctx.mainAccountId, key],
  );
  const row = rows[0];
  if (!row) return null;
  return decode<T>(row.value_json);
}

/** List all account-scoped settings as a plain object. */
export async function listSettings(): Promise<Record<string, unknown>> {
  const ctx = await getContext();
  const rows = await select<SettingRow>(
    `SELECT id, key, value_json FROM settings
      WHERE main_account_id = $1 AND scope = 'account' AND device_id IS NULL`,
    [ctx.mainAccountId],
  );
  const out: Record<string, unknown> = {};
  for (const row of rows) out[row.key] = decode(row.value_json);
  return out;
}

/** Upsert an account-scoped setting (insert or update `value_json`). */
export async function setSetting(key: string, value: unknown): Promise<void> {
  const ctx = await getContext();
  const json = JSON.stringify(value ?? null);
  const ts = now();
  const existing = await select<{ id: string }>(
    `SELECT id FROM settings
      WHERE main_account_id = $1 AND scope = 'account' AND device_id IS NULL AND key = $2
      LIMIT 1`,
    [ctx.mainAccountId, key],
  );
  const found = existing[0];
  if (found) {
    await execute(
      `UPDATE settings SET value_json = $1, updated_at = $2 WHERE id = $3`,
      [json, ts, found.id],
    );
    return;
  }
  await execute(
    `INSERT INTO settings
       (id, main_account_id, scope, device_id, key, value_json, created_at, updated_at)
     VALUES ($1,$2,'account',NULL,$3,$4,$5,$6)`,
    [uuidv7(), ctx.mainAccountId, key, json, ts, ts],
  );
}

/**
 * tauri-plugin-sql returns `value_json` as a string for TEXT columns; decode
 * defensively (an already-parsed value is passed through).
 */
function decode<T>(raw: unknown): T {
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}
