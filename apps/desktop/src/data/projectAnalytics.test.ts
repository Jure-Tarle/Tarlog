import { describe, expect, it } from "vitest";
import { activitiesByDescription, activitiesByTask, activeDayCount, effectiveFixedHourlyCents } from "./projectAnalytics";
import type { TimeEntry } from "./repositories";

function entry(id: string, description: string | null, seconds: number, taskId: string | null, at = 1_700_000_000_000): TimeEntry {
  return {
    id,
    main_account_id: "account",
    customer_id: null,
    project_id: "project",
    task_id: taskId,
    actual_started_at: at,
    actual_ended_at: at + seconds * 1000,
    timezone: "Europe/Berlin",
    description,
    internal_note: null,
    is_billable: true,
    source: "live_timer",
    is_backdated: false,
    backdate_reason: null,
    clock_trust: "trusted",
    started_monotonic_ns: null,
    ended_monotonic_ns: null,
    net_work_duration_seconds: seconds,
    break_duration_seconds: 0,
    billing_duration_seconds: seconds,
    rounding_delta_seconds: 0,
    rounding_reason: null,
    hourly_rate_snapshot_cents: null,
    billing_amount_snapshot: null,
    status: "completed",
    device_id: null,
    invoice_id: null,
  } as unknown as TimeEntry;
}

describe("project analytics", () => {
  it("ranks repeated descriptions by worked time", () => {
    const result = activitiesByDescription([
      entry("1", "Konzept", 3600, null),
      entry("2", "  Konzept ", 1800, null),
      entry("3", "Meeting", 1200, null),
    ]);
    expect(result[0]).toMatchObject({ label: "Konzept", seconds: 5400, entries: 2 });
    expect(result[0]?.share).toBeCloseTo(5400 / 6600);
  });

  it("groups tasks and counts distinct local days", () => {
    const rows = [entry("1", null, 600, "task"), entry("2", null, 600, "task", 1_700_086_400_000)];
    expect(activitiesByTask(rows, new Map([["task", "Recherche"]]))[0]).toMatchObject({ label: "Recherche", entries: 2 });
    expect(activeDayCount(rows, "Europe/Berlin")).toBe(2);
  });

  it("calculates fixed-price revenue from net working time", () => {
    expect(effectiveFixedHourlyCents(30000, 23 * 3600)).toBe(1304);
    expect(effectiveFixedHourlyCents(30000, 0)).toBeNull();
  });
});
