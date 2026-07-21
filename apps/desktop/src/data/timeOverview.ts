import { DateTime } from "luxon";
import type { TimeEntry } from "./repositories";

type OverviewEntry = Pick<
  TimeEntry,
  | "id"
  | "actual_started_at"
  | "actual_ended_at"
  | "net_work_duration_seconds"
  | "break_duration_seconds"
  | "billing_duration_seconds"
  | "is_billable"
  | "project_id"
>;

export type TimelineItem<T extends OverviewEntry = TimeEntry> =
  | { kind: "entry"; entry: T }
  | { kind: "gap"; from: number; to: number; seconds: number };

/**
 * Create a chronological timeline from finished entries. Overlapping entries
 * advance the cursor to the greatest previous end so they can never create a
 * false gap. Tiny scheduling seams below one minute stay visually silent.
 */
export function buildTimeline<T extends OverviewEntry>(entries: T[], minimumGapMs = 60_000): TimelineItem<T>[] {
  const finished = entries
    .filter((entry): entry is T & { actual_ended_at: number } => entry.actual_ended_at != null)
    .slice()
    .sort((left, right) => left.actual_started_at - right.actual_started_at || left.actual_ended_at - right.actual_ended_at);
  const result: TimelineItem<T>[] = [];
  let maximumPriorEnd: number | null = null;
  for (const entry of finished) {
    if (maximumPriorEnd != null && entry.actual_started_at - maximumPriorEnd >= minimumGapMs) {
      result.push({ kind: "gap", from: maximumPriorEnd, to: entry.actual_started_at, seconds: Math.floor((entry.actual_started_at - maximumPriorEnd) / 1000) });
    }
    result.push({ kind: "entry", entry });
    maximumPriorEnd = Math.max(maximumPriorEnd ?? entry.actual_ended_at, entry.actual_ended_at);
  }
  return result;
}

export interface WeekDayOverview<T extends OverviewEntry = TimeEntry> {
  key: string;
  at: number;
  weekday: string;
  dateLabel: string;
  weekend: boolean;
  entries: T[];
  netSeconds: number;
  breakSeconds: number;
  billableSeconds: number;
}

export function buildWeekOverview<T extends OverviewEntry>(
  entries: T[],
  weekStart: number,
  timezone: string,
): WeekDayOverview<T>[] {
  const start = DateTime.fromMillis(weekStart, { zone: timezone }).startOf("day");
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const key = DateTime.fromMillis(entry.actual_started_at, { zone: timezone }).toFormat("yyyy-MM-dd");
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  return Array.from({ length: 7 }, (_, index) => {
    const day = start.plus({ days: index }).setLocale("de");
    const key = day.toFormat("yyyy-MM-dd");
    const rows = (buckets.get(key) ?? []).slice().sort((left, right) => left.actual_started_at - right.actual_started_at);
    return {
      key,
      at: day.toMillis(),
      weekday: day.toFormat("cccc"),
      dateLabel: day.toFormat("dd.MM."),
      weekend: day.weekday >= 6,
      entries: rows,
      netSeconds: rows.reduce((sum, entry) => sum + (entry.net_work_duration_seconds ?? 0), 0),
      breakSeconds: rows.reduce((sum, entry) => sum + (entry.break_duration_seconds ?? 0), 0),
      billableSeconds: rows.reduce((sum, entry) => sum + (entry.is_billable ? entry.billing_duration_seconds ?? 0 : 0), 0),
    };
  });
}

/** Percentage for week bars, safe for empty, corrupt or partial aggregates. */
export function weekBarPercent(seconds: number, maximum: number): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(maximum) || seconds <= 0 || maximum <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / maximum) * 100));
}
