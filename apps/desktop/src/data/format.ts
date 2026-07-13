/**
 * format.ts — display formatters for the ledger UI.
 *
 * All time math stays in the entry's IANA timezone (never the device zone) via
 * luxon, mirroring @tarlog/core conventions (doc 07 §6). Durations render from
 * integer seconds, money from integer cents — the UI never invents precision.
 */
import { DateTime } from "luxon";
import type { EpochMs, IanaTimezone, Seconds, Cents } from "@tarlog/core";

/** The device's IANA timezone — the sensible default for new entries. */
export function deviceTimezone(): IanaTimezone {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Berlin";
}

/** Pad a number to two digits. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Whole-second duration as `HH:MM:SS` (tabular). Negative clamps to 0. */
export function fmtHMS(seconds: Seconds): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

/** Duration as `HH:MM` — the display rounding used across lists (doc 03 fn 35). */
export function fmtHM(seconds: Seconds): string {
  const s = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(s / 60);
  const m = s % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Compact human duration, e.g. "6h 30m" / "45m". */
export function fmtDurationShort(seconds: Seconds): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Decimal hours, e.g. 4500s → "1,25 h" (German decimal comma). */
export function fmtHoursDecimal(seconds: Seconds): string {
  const hours = seconds / 3600;
  return `${hours.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} h`;
}

/** Integer cents → localized currency string, e.g. 12345 → "123,45 €". */
export function fmtMoney(cents: Cents | null | undefined, currency = "EUR"): string {
  const value = (cents ?? 0) / 100;
  return value.toLocaleString("de-DE", { style: "currency", currency });
}

/** Local wall-clock `HH:mm` of an instant in a timezone. */
export function fmtClock(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("HH:mm");
}

/** Local `dd.MM.yyyy` of an instant in a timezone. */
export function fmtDate(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("dd.MM.yyyy");
}

/** Local `dd.MM.yyyy HH:mm`. */
export function fmtDateTime(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("dd.MM.yyyy HH:mm");
}

/** Long local weekday + date, e.g. "Montag, 8. Juli 2026". */
export function fmtDayLong(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).setLocale("de").toFormat("cccc, d. LLLL yyyy");
}

/** ISO local date "YYYY-MM-DD". */
export function fmtIsoDate(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("yyyy-MM-dd");
}

/** `value` for an `<input type="date">` in the given zone. */
export function toDateInputValue(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("yyyy-MM-dd");
}

/** `value` for an `<input type="time">` in the given zone. */
export function toTimeInputValue(at: EpochMs, tz: IanaTimezone): string {
  return DateTime.fromMillis(at, { zone: tz }).toFormat("HH:mm");
}

/**
 * Combine a `YYYY-MM-DD` date and `HH:mm` time (interpreted in `tz`) into a UTC
 * epoch-ms instant. Returns null if either part is invalid.
 */
export function fromDateTimeInputs(date: string, time: string, tz: IanaTimezone): EpochMs | null {
  if (!date || !time) return null;
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  return dt.isValid ? dt.toMillis() : null;
}

/** Relative "vor 3 Min." / "in 2 Std." style label from now. */
export function fmtRelative(at: EpochMs): string {
  const rel = DateTime.fromMillis(at).setLocale("de").toRelative();
  return rel ?? "";
}

/** Current local calendar day range [start, nextDayStart) as UTC epoch-ms. */
export function dayRange(tz: IanaTimezone, ref: EpochMs = Date.now()): { from: EpochMs; to: EpochMs } {
  const start = DateTime.fromMillis(ref, { zone: tz }).startOf("day");
  return { from: start.toMillis(), to: start.plus({ days: 1 }).toMillis() };
}

/** ISO week range [Mon 00:00, next Mon 00:00) as UTC epoch-ms. */
export function weekRange(tz: IanaTimezone, ref: EpochMs = Date.now()): { from: EpochMs; to: EpochMs } {
  const start = DateTime.fromMillis(ref, { zone: tz }).startOf("week");
  return { from: start.toMillis(), to: start.plus({ weeks: 1 }).toMillis() };
}

/** Calendar month range [1st 00:00, next 1st 00:00) as UTC epoch-ms. */
export function monthRange(tz: IanaTimezone, ref: EpochMs = Date.now()): { from: EpochMs; to: EpochMs } {
  const start = DateTime.fromMillis(ref, { zone: tz }).startOf("month");
  return { from: start.toMillis(), to: start.plus({ months: 1 }).toMillis() };
}

/** ISO week number label, e.g. "KW 28 · 2026". */
export function weekLabel(tz: IanaTimezone, ref: EpochMs = Date.now()): string {
  const dt = DateTime.fromMillis(ref, { zone: tz });
  return `KW ${dt.weekNumber} · ${dt.weekYear}`;
}
