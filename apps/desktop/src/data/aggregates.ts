/**
 * aggregates.ts — derive day/week summaries and compliance from raw entries.
 *
 * All calculation reuses @ptl/core pure functions (evaluateDay, evaluateRest-
 * Period, GERMAN_PROFILE) so the desktop never re-implements the engine
 * (doc 07 §1). Grouping happens in the entry's stored timezone (doc 07 §6.3).
 */
import { DateTime } from "luxon";
import {
  evaluateDay,
  evaluateRestPeriod,
  GERMAN_PROFILE,
  type ComplianceRuleResult,
  type ComplianceStatus,
  type DayEntrySummary,
  type IanaTimezone,
  type Seconds,
} from "@ptl/core";
import type { TimeEntry, Break } from "./repositories";

/** Public holidays configured on the DE profile (doc 08 §5.2 rules_json). */
const HOLIDAYS: readonly string[] = (() => {
  const flags = GERMAN_PROFILE.rules_json.flags as { public_holidays?: string[] } | undefined;
  return flags?.public_holidays ?? [];
})();

/** Sum of net work seconds over entries. */
export function sumNet(list: TimeEntry[]): Seconds {
  return list.reduce((a, e) => a + (e.net_work_duration_seconds ?? 0), 0);
}

/** Sum of break seconds over entries. */
export function sumBreak(list: TimeEntry[]): Seconds {
  return list.reduce((a, e) => a + (e.break_duration_seconds ?? 0), 0);
}

/** Sum of billing seconds over billable entries. */
export function sumBillableSeconds(list: TimeEntry[]): Seconds {
  return list.filter((e) => e.is_billable).reduce((a, e) => a + (e.billing_duration_seconds ?? 0), 0);
}

/** Sum of non-billable net seconds. */
export function sumNonBillableSeconds(list: TimeEntry[]): Seconds {
  return list.filter((e) => !e.is_billable).reduce((a, e) => a + (e.net_work_duration_seconds ?? 0), 0);
}

/** Sum of frozen billing amounts (cents) over entries. */
export function sumAmountCents(list: TimeEntry[]): number {
  return list.reduce((a, e) => a + (e.billing_amount_snapshot ?? 0), 0);
}

/** True if any part of [start,end) falls in the local night window 23:00–06:00. */
function touchesNight(startAt: number, endAt: number | null, tz: IanaTimezone): boolean {
  if (endAt == null) return false;
  // Sample each hour boundary; cheap and correct enough for a UI marker.
  let cursor = startAt;
  while (cursor < endAt) {
    const h = DateTime.fromMillis(cursor, { zone: tz }).hour;
    if (h >= 23 || h < 6) return true;
    cursor += 3600_000;
  }
  const endHour = DateTime.fromMillis(endAt - 1, { zone: tz }).hour;
  return endHour >= 23 || endHour < 6;
}

/** Group entries + their breaks into per-day summaries for the compliance engine. */
export function buildDaySummaries(
  list: TimeEntry[],
  breaksByEntry: Map<string, Break[]>,
  tz: IanaTimezone,
): DayEntrySummary[] {
  const byDay = new Map<string, DayEntrySummary>();
  for (const e of list) {
    if (e.actual_ended_at == null) continue;
    const day = DateTime.fromMillis(e.actual_started_at, { zone: e.timezone || tz }).toFormat("yyyy-MM-dd");
    const local = DateTime.fromMillis(e.actual_started_at, { zone: e.timezone || tz });
    const blocks = (breaksByEntry.get(e.id) ?? [])
      .filter((b) => b.ended_at != null)
      .map((b) => b.duration_seconds);
    const existing = byDay.get(day);
    if (existing) {
      existing.net_seconds += e.net_work_duration_seconds ?? 0;
      existing.break_seconds += e.break_duration_seconds ?? 0;
      existing.break_blocks.push(...blocks);
      existing.first_start_at = Math.min(existing.first_start_at, e.actual_started_at);
      existing.last_end_at = Math.max(existing.last_end_at, e.actual_ended_at);
      existing.has_night_work = existing.has_night_work || touchesNight(e.actual_started_at, e.actual_ended_at, e.timezone || tz);
    } else {
      byDay.set(day, {
        date: day,
        net_seconds: e.net_work_duration_seconds ?? 0,
        break_seconds: e.break_duration_seconds ?? 0,
        break_blocks: [...blocks],
        first_start_at: e.actual_started_at,
        last_end_at: e.actual_ended_at,
        is_sunday: local.weekday === 7,
        is_holiday: HOLIDAYS.includes(day),
        has_night_work: touchesNight(e.actual_started_at, e.actual_ended_at, e.timezone || tz),
      });
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** A day with its rolled-up compliance verdict + rule results. */
export interface DayCompliance {
  summary: DayEntrySummary;
  status: ComplianceStatus;
  results: ComplianceRuleResult[];
}

/** Worst status wins: red > yellow > green. */
export function rollup(results: ComplianceRuleResult[]): ComplianceStatus {
  if (results.some((r) => r.status === "red")) return "red";
  if (results.some((r) => r.status === "yellow")) return "yellow";
  return "green";
}

/**
 * Evaluate a set of days against the DE profile, adding the cross-day rest-period
 * rule (R7) between consecutive days.
 */
export function evaluateDays(summaries: DayEntrySummary[]): DayCompliance[] {
  const out: DayCompliance[] = [];
  for (let i = 0; i < summaries.length; i++) {
    const day = summaries[i]!;
    const results = evaluateDay(day, GERMAN_PROFILE);
    const prev = summaries[i - 1];
    if (prev) {
      const rest = evaluateRestPeriod(prev.last_end_at, day.first_start_at);
      if (rest) results.push({ ...rest, subject_date: day.date });
    }
    out.push({ summary: day, status: rollup(results), results });
  }
  return out;
}

/** Aggregate traffic-light over a list of day verdicts. */
export function overallStatus(days: DayCompliance[]): ComplianceStatus {
  if (days.some((d) => d.status === "red")) return "red";
  if (days.some((d) => d.status === "yellow")) return "yellow";
  return "green";
}
