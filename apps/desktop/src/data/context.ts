/**
 * context.ts — resolve the local Single-User identity (doc 06: `main_account_id`
 * Single-User-Isolation, `organization_id` NULL). The desktop app owns exactly
 * one `main_accounts` row and one `devices` row (this machine); every repository
 * write stamps those ids. The values are seeded by `db_init`/`db_migrate`
 * (bridge) before any repository call runs.
 *
 * Resolution is memoized per process — the singleton never changes at runtime.
 */
import { select } from "../lib/db";
import type { Uuid } from "@tarlog/core";

/** The resolved local identity + account defaults used to stamp writes. */
export interface LocalContext {
  mainAccountId: Uuid;
  deviceId: Uuid;
  /** ISO-4217 default currency from `main_accounts.default_currency`. */
  defaultCurrency: string;
  /** IANA default timezone from `main_accounts.default_timezone`. */
  defaultTimezone: string;
}

let cached: Promise<LocalContext> | null = null;

/**
 * Load (and memoize) the local identity. Throws a clear error if the DB has not
 * been initialized/seeded yet — callers must run `bridge.dbInit()` +
 * `bridge.dbMigrate()` first.
 */
export function getContext(): Promise<LocalContext> {
  if (!cached) cached = load();
  return cached;
}

/** Drop the cached context (tests, or after a destructive reset). */
export function resetContext(): void {
  cached = null;
}

async function load(): Promise<LocalContext> {
  const accounts = await select<{
    id: Uuid;
    default_currency: string | null;
    default_timezone: string | null;
  }>(
    `SELECT id, default_currency, default_timezone FROM main_accounts ORDER BY id ASC LIMIT 1`,
  );
  const account = accounts[0];
  if (!account) {
    throw new Error(
      "LocalContext: kein main_accounts-Datensatz — db_init/db_migrate zuerst ausführen",
    );
  }

  const devices = await select<{ id: Uuid }>(
    `SELECT id FROM devices ORDER BY id ASC LIMIT 1`,
  );
  const device = devices[0];
  if (!device) {
    throw new Error(
      "LocalContext: kein devices-Datensatz — db_init/db_migrate zuerst ausführen",
    );
  }

  return {
    mainAccountId: account.id,
    deviceId: device.id,
    defaultCurrency: account.default_currency ?? "EUR",
    defaultTimezone: account.default_timezone ?? "Europe/Berlin",
  };
}

/** Monotonic-ish current instant (UTC epoch-ms). Central hook for tests. */
export function now(): number {
  return Date.now();
}
