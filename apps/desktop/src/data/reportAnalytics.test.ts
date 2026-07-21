import { describe, expect, it } from "vitest";
import { buildActivityHeatmap, buildTrendBuckets, reportRange } from "./reportAnalytics";
import type { TimeEntry } from "./repositories";

const timezone = "Europe/Berlin";
const reference = Date.parse("2026-07-16T10:00:00Z");

function entry(at: string, seconds: number): TimeEntry {
  return {
    id: at,
    actual_started_at: Date.parse(at),
    actual_ended_at: Date.parse(at) + seconds * 1000,
    net_work_duration_seconds: seconds,
  } as TimeEntry;
}

describe("report analytics", () => {
  it("creates calendar ranges for all supported periods", () => {
    expect(reportRange("week", timezone, reference).label).toBe("KW 29 | 2026");
    expect(reportRange("month", timezone, reference).label).toBe("Juli 2026");
    expect(reportRange("quarter", timezone, reference).label).toBe("3. Quartal | 2026");
    expect(reportRange("year", timezone, reference).label).toBe("Jahr 2026");
  });

  it("groups weekly work into local calendar days", () => {
    const range = reportRange("week", timezone, reference);
    const buckets = buildTrendBuckets([
      entry("2026-07-13T08:00:00Z", 3600),
      entry("2026-07-13T11:00:00Z", 1800),
      entry("2026-07-15T08:00:00Z", 7200),
    ], "week", timezone, range);

    expect(buckets).toHaveLength(7);
    expect(buckets[0]?.seconds).toBe(5400);
    expect(buckets[2]?.seconds).toBe(7200);
  });

  it("builds a 52 by 7 activity grid with intensity levels", () => {
    const weeks = buildActivityHeatmap([entry("2026-07-15T08:00:00Z", 5 * 3600)], timezone, reference);
    expect(weeks).toHaveLength(52);
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(weeks.flatMap((week) => week.days).find((day) => day.date === "2026-07-15")?.level).toBe(3);
  });
});
