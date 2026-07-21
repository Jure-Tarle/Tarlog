import { DateTime } from "luxon";
import type { IanaTimezone } from "@tarlog/core";
import type { TimeEntry } from "./repositories";
import { getLanguage, t } from "../i18n";

export type ReportPeriod = "week" | "month" | "quarter" | "year";

export type ReportRange = {
  from: number;
  to: number;
  label: string;
};

export type TrendBucket = {
  key: string;
  label: string;
  accessibleLabel: string;
  seconds: number;
};

export type ActivityDay = {
  date: string;
  label: string;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export type ActivityWeek = {
  key: string;
  monthLabel: string | null;
  days: ActivityDay[];
};

export function reportRange(period: ReportPeriod, timezone: IanaTimezone, reference = Date.now()): ReportRange {
  const current = DateTime.fromMillis(reference, { zone: timezone }).setLocale(getLanguage());

  if (period === "week") {
    const start = current.startOf("week");
    return {
      from: start.toMillis(),
      to: start.plus({ weeks: 1 }).toMillis(),
      label: t("KW {week} | {year}", { week: start.weekNumber, year: start.weekYear }),
    };
  }

  if (period === "month") {
    const start = current.startOf("month");
    return {
      from: start.toMillis(),
      to: start.plus({ months: 1 }).toMillis(),
      label: start.toFormat("LLLL yyyy"),
    };
  }

  if (period === "quarter") {
    const quarter = Math.floor((current.month - 1) / 3) + 1;
    const start = DateTime.fromObject(
      { year: current.year, month: (quarter - 1) * 3 + 1, day: 1 },
      { zone: timezone },
    );
    return {
      from: start.toMillis(),
      to: start.plus({ months: 3 }).toMillis(),
      label: t("{quarter}. Quartal | {year}", { quarter, year: start.year }),
    };
  }

  const start = current.startOf("year");
  return {
    from: start.toMillis(),
    to: start.plus({ years: 1 }).toMillis(),
    label: t("Jahr {year}", { year: start.year }),
  };
}

export function buildTrendBuckets(
  entries: TimeEntry[],
  period: ReportPeriod,
  timezone: IanaTimezone,
  range: Pick<ReportRange, "from" | "to">,
): TrendBucket[] {
  const start = DateTime.fromMillis(range.from, { zone: timezone }).setLocale(getLanguage());
  const end = DateTime.fromMillis(range.to, { zone: timezone });
  const buckets: Array<{ start: DateTime; end: DateTime; label: string; accessibleLabel: string }> = [];

  if (period === "week" || period === "month") {
    let cursor = start;
    while (cursor < end) {
      const next = cursor.plus({ days: 1 });
      buckets.push({
        start: cursor,
        end: next,
        label: period === "week" ? cursor.toFormat("ccc") : cursor.toFormat("d"),
        accessibleLabel: cursor.toFormat("cccc, d. LLLL"),
      });
      cursor = next;
    }
  } else if (period === "quarter") {
    let cursor = start;
    let week = 1;
    while (cursor < end) {
      const next = DateTime.min(cursor.plus({ weeks: 1 }), end);
      buckets.push({ start: cursor, end: next, label: `W${week}`, accessibleLabel: t("Woche {week}", { week }) });
      cursor = next;
      week += 1;
    }
  } else {
    let cursor = start;
    while (cursor < end) {
      const next = cursor.plus({ months: 1 });
      buckets.push({
        start: cursor,
        end: next,
        label: cursor.toFormat("LLL"),
        accessibleLabel: cursor.toFormat("LLLL yyyy"),
      });
      cursor = next;
    }
  }

  return buckets.map((bucket) => ({
    key: bucket.start.toISO() ?? String(bucket.start.toMillis()),
    label: bucket.label,
    accessibleLabel: bucket.accessibleLabel,
    seconds: entries.reduce((sum, entry) => {
      const started = DateTime.fromMillis(entry.actual_started_at, { zone: timezone });
      return started >= bucket.start && started < bucket.end
        ? sum + (entry.net_work_duration_seconds ?? 0)
        : sum;
    }, 0),
  }));
}

export function activityHeatmapRange(timezone: IanaTimezone, reference = Date.now()) {
  const end = DateTime.fromMillis(reference, { zone: timezone }).startOf("day").plus({ days: 1 });
  const start = end.minus({ days: 1 }).startOf("week").minus({ weeks: 51 });
  return { from: start.toMillis(), to: end.toMillis() };
}

export function buildActivityHeatmap(
  entries: TimeEntry[],
  timezone: IanaTimezone,
  reference = Date.now(),
): ActivityWeek[] {
  const range = activityHeatmapRange(timezone, reference);
  const start = DateTime.fromMillis(range.from, { zone: timezone }).setLocale(getLanguage());
  const secondsByDate = new Map<string, number>();

  for (const entry of entries) {
    const date = DateTime.fromMillis(entry.actual_started_at, { zone: timezone }).toISODate();
    if (date) secondsByDate.set(date, (secondsByDate.get(date) ?? 0) + (entry.net_work_duration_seconds ?? 0));
  }

  let previousMonth = -1;
  return Array.from({ length: 52 }, (_, weekIndex) => {
    const weekStart = start.plus({ weeks: weekIndex });
    const monthLabel = weekStart.month !== previousMonth ? weekStart.toFormat("LLL") : null;
    previousMonth = weekStart.month;

    return {
      key: weekStart.toISODate() ?? String(weekIndex),
      monthLabel,
      days: Array.from({ length: 7 }, (_, dayIndex) => {
        const day = weekStart.plus({ days: dayIndex });
        const date = day.toISODate() ?? "";
        const seconds = secondsByDate.get(date) ?? 0;
        const hours = seconds / 3600;
        const level: ActivityDay["level"] = seconds === 0 ? 0 : hours < 1 ? 1 : hours < 4 ? 2 : hours < 8 ? 3 : 4;
        return {
          date,
          label: day.toFormat("cccc, d. LLLL yyyy"),
          seconds,
          level,
        };
      }),
    };
  });
}
