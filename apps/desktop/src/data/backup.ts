/**
 * backup.ts, auto-backup trigger (doc 09, doc 11 §5 nr. 14). The repository
 * calls {@link notifyChange} after every mutating operation; once N changes have
 * accumulated OR the local calendar day rolled over since the last backup, we
 * fire `run_backup` (bridge → Rust owns the actual SQLite copy).
 *
 * State (counter + last-backup day) lives in `settings` so it survives restarts.
 */
import { runBackup, type BackupResult } from "../lib/bridge";
import { getSetting, setSetting } from "./settings";
import { now } from "./context";

/** Change threshold that triggers an automatic backup. */
export const AUTO_BACKUP_CHANGE_THRESHOLD = 20;

const KEY_PENDING = "backup.pending_changes";
const KEY_LAST_DAY = "backup.last_backup_day";

/** Local "YYYY-MM-DD" (device zone is fine for the day-rollover heuristic). */
function localDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/**
 * Record one change and, if a threshold/day-rollover condition is met, run an
 * automatic backup. Returns the {@link BackupResult} when a backup ran, else
 * null. Failures never throw into the caller's mutation, they are swallowed and
 * the counter is preserved so the next change retries.
 */
export async function notifyChange(count = 1): Promise<BackupResult | null> {
  const pending = ((await getSetting<number>(KEY_PENDING)) ?? 0) + count;
  const lastDay = (await getSetting<string>(KEY_LAST_DAY)) ?? null;
  const today = localDay(now());

  const dayRolled = lastDay !== null && lastDay !== today;
  if (pending < AUTO_BACKUP_CHANGE_THRESHOLD && !dayRolled) {
    await setSetting(KEY_PENDING, pending);
    return null;
  }

  try {
    const result = await runBackup({ manual: false });
    await setSetting(KEY_PENDING, 0);
    await setSetting(KEY_LAST_DAY, today);
    return result;
  } catch {
    // Keep the accumulated count; retry on the next change.
    await setSetting(KEY_PENDING, pending);
    return null;
  }
}

/** Force a manual backup now (doc 11 §5 nr. 14) and reset the auto counter. */
export async function runManualBackup(encrypt = false): Promise<BackupResult> {
  const result = await runBackup({ manual: true, encrypt });
  await setSetting(KEY_PENDING, 0);
  await setSetting(KEY_LAST_DAY, localDay(now()));
  return result;
}
