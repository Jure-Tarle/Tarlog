import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { buildTimeline, buildWeekOverview, weekBarPercent } from "./timeOverview";

function entry(id: string, start: number, end: number | null, net = end == null ? 0 : (end - start) / 1000) {
  return {
    id,
    actual_started_at: start,
    actual_ended_at: end,
    net_work_duration_seconds: net,
    break_duration_seconds: 0,
    billing_duration_seconds: net,
    is_billable: true,
    project_id: null,
  };
}

describe("time overview", () => {
  it("uses the greatest prior end and never invents a gap for overlaps", () => {
    const result = buildTimeline([
      entry("long", 0, 3_600_000),
      entry("overlap", 900_000, 1_800_000),
      entry("after", 3_900_000, 4_200_000),
    ]);
    expect(result.filter((item) => item.kind === "gap")).toEqual([
      { kind: "gap", from: 3_600_000, to: 3_900_000, seconds: 300 },
    ]);
  });

  it("sorts unsorted entries chronologically", () => {
    const result = buildTimeline([
      entry("late", 3_600_000, 4_200_000),
      entry("early", 0, 600_000),
      entry("middle", 1_800_000, 2_400_000),
    ]);
    expect(result.filter((item) => item.kind === "entry").map((item) => item.kind === "entry" ? item.entry.id : "")).toEqual(["early", "middle", "late"]);
  });

  it("ignores unfinished entries without an end", () => {
    const result = buildTimeline([entry("running", 0, null), entry("finished", 600_000, 1_200_000)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "entry", entry: { id: "finished" } });
  });

  it("returns all seven days including empty weekend buckets", () => {
    const monday = Date.UTC(2026, 6, 13);
    const days = buildWeekOverview([entry("monday", monday, monday + 3_600_000)], monday, "UTC");
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ key: "2026-07-13", netSeconds: 3600, weekend: false });
    expect(days[5]).toMatchObject({ key: "2026-07-18", netSeconds: 0, weekend: true });
    expect(days[6]).toMatchObject({ key: "2026-07-19", entries: [], weekend: true });
  });

  it("groups UTC instants by the Europe/Berlin local day boundary", () => {
    const zone = "Europe/Berlin";
    const monday = DateTime.fromISO("2026-07-13T00:00", { zone }).toMillis();
    const localMondayUtcSunday = DateTime.fromISO("2026-07-12T22:30:00Z").toMillis();
    const days = buildWeekOverview([entry("boundary", localMondayUtcSunday, localMondayUtcSunday + 1_800_000)], monday, zone);
    expect(days[0]?.key).toBe("2026-07-13");
    expect(days[0]?.entries.map((row) => row.id)).toEqual(["boundary"]);
  });

  it("keeps seven ISO-week dates across the year boundary", () => {
    const zone = "Europe/Berlin";
    const start = DateTime.fromISO("2025-12-29T00:00", { zone }).toMillis();
    const days = buildWeekOverview([], start, zone);
    expect(days.map((day) => day.key)).toEqual([
      "2025-12-29", "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    ]);
  });

  it("builds exactly seven local buckets for the 167-hour DST spring week", () => {
    const zone = "Europe/Berlin";
    const start = DateTime.fromISO("2026-03-23T00:00", { zone }).toMillis();
    const days = buildWeekOverview([], start, zone);
    const nextMonday = DateTime.fromMillis(days[6]!.at, { zone }).plus({ days: 1 }).toMillis();
    expect(days.map((day) => day.key)).toEqual([
      "2026-03-23", "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27", "2026-03-28", "2026-03-29",
    ]);
    expect(days).toHaveLength(7);
    expect((nextMonday - days[0]!.at) / 3_600_000).toBe(167);
  });

  it("builds exactly seven local buckets for the 169-hour DST autumn week", () => {
    const zone = "Europe/Berlin";
    const start = DateTime.fromISO("2026-10-19T00:00", { zone }).toMillis();
    const days = buildWeekOverview([], start, zone);
    const nextMonday = DateTime.fromMillis(days[6]!.at, { zone }).plus({ days: 1 }).toMillis();
    expect(days.map((day) => day.key)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25",
    ]);
    expect(days).toHaveLength(7);
    expect((nextMonday - days[0]!.at) / 3_600_000).toBe(169);
  });

  it("clamps week bar percentages and rejects invalid aggregates", () => {
    expect(weekBarPercent(30, 60)).toBe(50);
    expect(weekBarPercent(120, 60)).toBe(100);
    expect(weekBarPercent(-1, 60)).toBe(0);
    expect(weekBarPercent(10, 0)).toBe(0);
    expect(weekBarPercent(Number.NaN, 60)).toBe(0);
    expect(weekBarPercent(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
