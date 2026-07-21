/**
 * hlc.ts, Hybrid Logical Clock for sync ordering (doc 04 §1.1).
 *
 * An HLC combines wall-clock ms with a logical counter and the device id:
 * `physical_ms:logical:device_id`. It is monotonic even when the wall clock
 * jumps backwards, giving a total, cross-device order for field-level LWW. This
 * is transport metadata for the sync layer, NOT business logic; the server
 * remains the canonical clock and may normalize a device HLC on large skew.
 *
 * State is in-memory per app run (last physical + logical). Persistence across
 * restarts is unnecessary: on restart wall-clock time has advanced past the
 * last emitted physical component in every realistic case, and the server
 * re-anchors order via `server_revision`.
 */

let lastPhysical = 0;
let lastLogical = 0;

/** Encode an HLC as the wire string `physical_ms:logical:device_id`. */
export function encodeHlc(physicalMs: number, logical: number, deviceId: string): string {
  return `${physicalMs}:${logical}:${deviceId}`;
}

/**
 * Emit the next monotonic HLC for `deviceId`. If the wall clock did not advance
 * past the last physical component, the logical counter increments instead.
 */
export function nextHlc(deviceId: string, nowMs: number = Date.now()): string {
  if (nowMs > lastPhysical) {
    lastPhysical = nowMs;
    lastLogical = 0;
  } else {
    lastLogical += 1;
  }
  return encodeHlc(lastPhysical, lastLogical, deviceId);
}

/** Reset the in-memory clock (tests only). */
export function resetHlc(): void {
  lastPhysical = 0;
  lastLogical = 0;
}
