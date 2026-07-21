/**
 * Time module, gross/break/net durations, timezones, DST, day boundaries,
 * midnight split (doc 07 §2 functions 1,3, 5,9). Pure functions: no Date.now(),
 * no I/O. Durations are ALWAYS derived from UTC epoch differences; the IANA
 * timezone is used only for calendar questions (local day, midnight), so DST
 * transitions are handled correctly by construction (doc 07 §6).
 */
import { DateTime } from "luxon";
import type { BreakInput, EpochMs, IanaTimezone, LocalDate, Seconds, TimeEntryCalcInput } from "../types.js";

/**
 * Local wall-clock components of a UTC instant in an entry's timezone.
 * Result of `toLocal` (doc 07 §2 fn 7). Not part of the shared contract in
 * types.ts, so it is defined and exported locally here.
 */
export interface LocalDateTime {
  /** Local calendar day "YYYY-MM-DD". */
  date: LocalDate;
  /** Local calendar year. */
  year: number;
  /** Local calendar month, 1,12. */
  month: number;
  /** Local calendar day-of-month, 1,31. */
  day: number;
  /** Local hour, 0,23. */
  hour: number;
  /** Local minute, 0,59. */
  minute: number;
  /** Local second, 0,59. */
  second: number;
  /** Local weekday, 1 = Monday … 7 = Sunday (luxon convention). */
  weekday: number;
  /** UTC offset in minutes at this instant (reflects DST). */
  offsetMinutes: number;
  /** The IANA timezone this local time was resolved in. */
  timezone: IanaTimezone;
  /** The original UTC instant, epoch-ms. */
  epochMs: EpochMs;
}

/**
 * Builds a luxon DateTime for an instant in the given zone. Throws on an
 * invalid/unknown IANA timezone so a bad zone never silently produces wrong
 * calendar results.
 */
function localDateTime(at: EpochMs, timezone: IanaTimezone): DateTime {
  const dt = DateTime.fromMillis(at, { zone: timezone });
  if (!dt.isValid) {
    // Fehler: unbekannte oder ungültige IANA-Zeitzone.
    throw new Error(`Ungültige Zeitzone "${timezone}": ${dt.invalidReason ?? "unbekannt"}`);
  }
  return dt;
}

/**
 * Fn 1: gross seconds = (ended − started), floored to whole seconds, never
 * negative. Pure UTC epoch difference → DST-correct real elapsed seconds
 * (doc 07 §6.1/§6.2).
 */
export function computeGrossSeconds(started_at: EpochMs, ended_at: EpochMs): Seconds {
  const diffMs = ended_at - started_at;
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

/**
 * Fn 2: sum of all break durations → break_duration_seconds. Each break is an
 * epoch-ms difference (floor, never negative); still-running breaks
 * (ended_at == null) contribute 0.
 */
export function computeBreakSeconds(breaks: BreakInput[]): Seconds {
  let total = 0;
  for (const b of breaks) {
    if (b.ended_at == null) continue;
    total += computeGrossSeconds(b.started_at, b.ended_at);
  }
  return total;
}

/**
 * Sum of breaks clamped to the given [intervalStart, intervalEnd) window.
 * Overlapping breaks are clamped to the interval so a break reaching outside
 * the entry (or a midnight segment) is only counted for the part inside it.
 */
function clampedBreakSeconds(breaks: BreakInput[], intervalStart: EpochMs, intervalEnd: EpochMs): Seconds {
  let total = 0;
  for (const b of breaks) {
    if (b.ended_at == null) continue;
    const start = Math.max(b.started_at, intervalStart);
    const end = Math.min(b.ended_at, intervalEnd);
    if (end <= start) continue;
    total += computeGrossSeconds(start, end);
  }
  return total;
}

/**
 * Fn 3: net = gross − breakSec, clamped ≥ 0 → net_work_duration_seconds
 * (doc 07 §2 fn 3).
 */
export function computeNetSeconds(gross: Seconds, breakSec: Seconds): Seconds {
  const net = gross - breakSec;
  return net > 0 ? net : 0;
}

/**
 * Fn 5: local calendar day "YYYY-MM-DD" of an instant in the given timezone
 * (doc 07 §6.3). Decided solely by the entry's stored timezone, never the
 * device zone.
 */
export function resolveDayBoundary(at: EpochMs, timezone: IanaTimezone): LocalDate {
  return localDateTime(at, timezone).toFormat("yyyy-MM-dd");
}

/**
 * Fn 7: convert a UTC instant to local wall-clock in the entry's timezone
 * (doc 07 §2 fn 7). The offset reflects DST at that instant.
 */
export function toLocal(at: EpochMs, timezone: IanaTimezone): LocalDateTime {
  const dt = localDateTime(at, timezone);
  return {
    date: dt.toFormat("yyyy-MM-dd"),
    year: dt.year,
    month: dt.month,
    day: dt.day,
    hour: dt.hour,
    minute: dt.minute,
    second: dt.second,
    weekday: dt.weekday,
    offsetMinutes: dt.offset,
    timezone,
    epochMs: at,
  };
}

/**
 * True if start and end fall on different local calendar days in the entry's
 * timezone (doc 07 §6.4). A still-running entry (actual_ended_at == null)
 * cannot span midnight yet.
 */
export function spansMidnight(input: TimeEntryCalcInput): boolean {
  if (input.actual_ended_at == null) return false;
  const startDay = resolveDayBoundary(input.actual_started_at, input.timezone);
  const endDay = resolveDayBoundary(input.actual_ended_at, input.timezone);
  return startDay !== endDay;
}

/**
 * Local midnight (start of the next local calendar day) strictly after `at`,
 * as a UTC epoch-ms instant, in the given timezone. Uses luxon's zone logic so
 * DST-shifted days (23h/25h) get the correct boundary instant.
 */
function nextLocalMidnight(at: EpochMs, timezone: IanaTimezone): EpochMs {
  const boundary = localDateTime(at, timezone).plus({ days: 1 }).startOf("day");
  return boundary.toMillis();
}

/**
 * Fn 6: split an entry crossing local midnight into per-day parts (doc 07
 * §6.4). Lossless: the segments cover [start, end) contiguously with no gaps or
 * overlaps, so the sum of the parts' gross seconds equals the original. Breaks
 * are assigned to the segment they fall in and clamped/split at each midnight
 * boundary. An entry that does not cross midnight (or is still running) is
 * returned unchanged as a single-element array.
 */
export function splitAtMidnight(input: TimeEntryCalcInput): TimeEntryCalcInput[] {
  if (!spansMidnight(input) || input.actual_ended_at == null) {
    return [input];
  }
  const end = input.actual_ended_at;
  const segments: TimeEntryCalcInput[] = [];
  let segStart = input.actual_started_at;

  while (segStart < end) {
    const boundary = nextLocalMidnight(segStart, input.timezone);
    const segEnd = boundary < end ? boundary : end;
    segments.push({
      actual_started_at: segStart,
      actual_ended_at: segEnd,
      timezone: input.timezone,
      breaks: sliceBreaks(input.breaks, segStart, segEnd),
    });
    segStart = segEnd;
  }
  return segments;
}

/**
 * Returns the breaks overlapping [segStart, segEnd), each clamped to that
 * window so a break spanning a midnight boundary is split across segments
 * without double-counting.
 */
function sliceBreaks(breaks: BreakInput[], segStart: EpochMs, segEnd: EpochMs): BreakInput[] {
  const out: BreakInput[] = [];
  for (const b of breaks) {
    if (b.ended_at == null) continue;
    const start = Math.max(b.started_at, segStart);
    const end = Math.min(b.ended_at, segEnd);
    if (end <= start) continue;
    out.push({ started_at: start, ended_at: end });
  }
  return out;
}

/**
 * Net seconds for a whole calc input: gross (from actual start/end) minus the
 * breaks clamped to the entry interval, clamped ≥ 0. Convenience over the
 * fn 1→2→3 pipeline that also guards breaks reaching outside the entry.
 * Returns 0 while the entry is still running (actual_ended_at == null).
 */
export function computeNetSecondsForInput(input: TimeEntryCalcInput): Seconds {
  if (input.actual_ended_at == null) return 0;
  const gross = computeGrossSeconds(input.actual_started_at, input.actual_ended_at);
  const breakSec = clampedBreakSeconds(input.breaks, input.actual_started_at, input.actual_ended_at);
  return computeNetSeconds(gross, breakSec);
}
