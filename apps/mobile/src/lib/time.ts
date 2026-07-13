/**
 * time.ts — epoch-ms / timezone helpers (doc 05 §8, doc 07).
 *
 * Conventions enforced app-wide:
 *  - Instants are UTC epoch-milliseconds (`EpochMs`, a plain number).
 *  - Each time entry carries its own IANA `timezone`; calendar/DST logic uses
 *    that zone, never the device's current zone implicitly.
 *  - Durations are integer seconds.
 *
 * These are thin luxon wrappers for the UI/data layer. The authoritative
 * calculation pipeline (net, rounding, billing) stays in `@tarlog/core`; nothing
 * here duplicates that logic.
 */
import { DateTime } from "luxon";
import type { EpochMs, IanaTimezone, LocalDate, Seconds } from "@tarlog/core";

/** Current instant as UTC epoch-ms. */
export function nowMs(): EpochMs {
  return Date.now();
}

/** The device's current IANA timezone, e.g. "Europe/Berlin". */
export function deviceTimezone(): IanaTimezone {
  return DateTime.local().zoneName ?? "UTC";
}

/** Local calendar day ("YYYY-MM-DD") of an instant in the given zone. */
export function localDate(at: EpochMs, zone: IanaTimezone): LocalDate {
  return DateTime.fromMillis(at, { zone }).toISODate() ?? "";
}

/** Start-of-day instant (UTC epoch-ms) for a local day in the given zone. */
export function startOfDayMs(date: LocalDate, zone: IanaTimezone): EpochMs {
  return DateTime.fromISO(date, { zone }).startOf("day").toMillis();
}

/** Exclusive end-of-day instant (UTC epoch-ms) for a local day in the zone. */
export function endOfDayMs(date: LocalDate, zone: IanaTimezone): EpochMs {
  return DateTime.fromISO(date, { zone }).endOf("day").toMillis() + 1;
}

/** Whole seconds between two instants (`to - from`), floored, never negative. */
export function durationSeconds(from: EpochMs, to: EpochMs): Seconds {
  return Math.max(0, Math.floor((to - from) / 1000));
}

/** Format a duration as tabular "HH:MM:SS" (doc 11 §1 tabular numerics). */
export function formatHms(totalSeconds: Seconds): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
