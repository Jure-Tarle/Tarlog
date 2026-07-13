/**
 * session.ts — the active local account + device context the UI writes against.
 *
 * Every insert (customer, project, entry) needs `main_account_id`; the account
 * is the local singleton created on first run (doc 06 A.1 `main_accounts`). We
 * resolve it once from SQLite and cache it. If the DB is not migrated yet the
 * resolver falls back to a stable nil id so forms still render — the backend
 * commands own the authoritative account (doc 05 §3.1).
 */
import { uuidv7 } from "uuidv7";
import { select } from "../lib/db";
import { deviceTimezone } from "./format";
import type { IanaTimezone } from "@tarlog/core";

/** Stable placeholder used before the local account row exists. */
const NIL_ACCOUNT = "00000000-0000-0000-0000-000000000000";

interface AccountRow {
  id: string;
  default_timezone: string | null;
  default_currency: string | null;
}

let cache: Promise<{ mainAccountId: string; timezone: IanaTimezone; currency: string }> | null = null;

async function resolve(): Promise<{ mainAccountId: string; timezone: IanaTimezone; currency: string }> {
  try {
    const rows = await select<AccountRow>(
      "SELECT id, default_timezone, default_currency FROM main_accounts LIMIT 1",
    );
    const row = rows[0];
    if (row) {
      return {
        mainAccountId: row.id,
        timezone: row.default_timezone ?? deviceTimezone(),
        currency: row.default_currency ?? "EUR",
      };
    }
  } catch {
    // DB not ready (unmigrated / not opened) — fall through to defaults.
  }
  return { mainAccountId: NIL_ACCOUNT, timezone: deviceTimezone(), currency: "EUR" };
}

/** The active local session (cached). */
export function session() {
  if (!cache) cache = resolve();
  return cache;
}

/** Drop the cache (after account creation or a destructive reset). */
export function resetSession(): void {
  cache = null;
}

/** A fresh UUIDv7 primary key (time-ordered, matches @tarlog/db). */
export function newId(): string {
  return uuidv7();
}

/** The device's IANA timezone. */
export { deviceTimezone };
