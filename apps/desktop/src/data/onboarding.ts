/**
 * Device-scoped persistence for the desktop Setup Assistant.
 *
 * Onboarding is about first use of this installation, not first use of the
 * account on every surface. Keeping it in `settings` with `scope = 'device'`
 * lets it survive restarts and backups without turning an existing synced
 * account into a mandatory first-run flow on another client.
 */
import {
  resolveOnboardingLaunch,
  type OnboardingLaunch,
  type OnboardingProgress,
} from "@tarlog/core";
import { uuidv7 } from "uuidv7";
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";

export const DESKTOP_ONBOARDING_KEY = "onboarding.desktop.v1" as const;

interface DeviceSettingRow {
  id: string;
  value_json: unknown;
}

function decode(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Load persisted progress for this physical installation. */
export async function getDesktopOnboardingProgress(): Promise<unknown> {
  const ctx = await getContext();
  const rows = await select<DeviceSettingRow>(
    `SELECT id, value_json FROM settings
      WHERE main_account_id = $1 AND scope = 'device' AND device_id = $2 AND key = $3
      LIMIT 1`,
    [ctx.mainAccountId, ctx.deviceId, DESKTOP_ONBOARDING_KEY],
  );
  // `undefined` exclusively means no row exists. A stored JSON null or a
  // decode failure remains `null` and is handled fail-closed by core.
  return rows[0] ? decode(rows[0].value_json) : undefined;
}

/** Persist one resumable checkpoint for this installation. */
export async function setDesktopOnboardingProgress(progress: OnboardingProgress): Promise<void> {
  const ctx = await getContext();
  const json = JSON.stringify(progress);
  const timestamp = now();
  const rows = await select<{ id: string }>(
    `SELECT id FROM settings
      WHERE main_account_id = $1 AND scope = 'device' AND device_id = $2 AND key = $3
      LIMIT 1`,
    [ctx.mainAccountId, ctx.deviceId, DESKTOP_ONBOARDING_KEY],
  );
  const existing = rows[0];
  if (existing) {
    await execute(
      `UPDATE settings SET value_json = $1, updated_at = $2 WHERE id = $3`,
      [json, timestamp, existing.id],
    );
    return;
  }

  await execute(
    `INSERT INTO settings
       (id, main_account_id, scope, device_id, key, value_json, created_at, updated_at)
     VALUES ($1,$2,'device',$3,$4,$5,$6,$6)`,
    [uuidv7(), ctx.mainAccountId, ctx.deviceId, DESKTOP_ONBOARDING_KEY, json, timestamp],
  );
}

/** A project is the minimum useful workspace for guided time tracking. */
export async function hasDesktopWorkspace(): Promise<boolean> {
  const ctx = await getContext();
  const rows = await select<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM projects
      WHERE main_account_id = $1 AND deleted_at IS NULL`,
    [ctx.mainAccountId],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Resolve required first run, resumable progress, or a quiet legacy launch. */
export async function loadDesktopOnboardingLaunch(): Promise<OnboardingLaunch> {
  const [persisted, hasWorkspace] = await Promise.all([
    getDesktopOnboardingProgress(),
    hasDesktopWorkspace(),
  ]);
  return resolveOnboardingLaunch(persisted, hasWorkspace);
}
