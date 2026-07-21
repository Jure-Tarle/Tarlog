/**
 * cursor.ts, non-secret sync bookkeeping in AsyncStorage (doc 04 §1.2).
 *
 * Two per-device counters live here (neither is a credential, so they stay out
 * of secure-store):
 *  - the pull high-water mark (`last_pulled_server_revision`): the greatest
 *    `server_revision` already merged locally, so the next pull only fetches the
 *    delta;
 *  - the local revision counter (`local_revision`): a monotonic per-device
 *    change count that orders the outbox and rebases incoming events.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CURSOR_KEY = "ptl.sync.highWater" as const;
const LOCAL_REV_KEY = "ptl.sync.localRevision" as const;

/** Read the pull high-water mark (0 if never synced). */
export async function getHighWater(): Promise<number> {
  const raw = await AsyncStorage.getItem(CURSOR_KEY);
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Advance the high-water mark (monotonic, never moves backwards). */
export async function setHighWater(serverRevision: number): Promise<void> {
  const current = await getHighWater();
  if (serverRevision > current) {
    await AsyncStorage.setItem(CURSOR_KEY, String(serverRevision));
  }
}

/** Reserve and return the next monotonic local_revision for this device. */
export async function nextLocalRevision(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOCAL_REV_KEY);
  const current = raw == null ? 0 : Number.parseInt(raw, 10);
  const next = (Number.isFinite(current) && current >= 0 ? current : 0) + 1;
  await AsyncStorage.setItem(LOCAL_REV_KEY, String(next));
  return next;
}

/** Reset both counters (unpair / local wipe). */
export async function resetCursor(): Promise<void> {
  await AsyncStorage.multiRemove([CURSOR_KEY, LOCAL_REV_KEY]);
}
