/**
 * schemas.test.ts — tests for the REAL zod exports of
 * packages/core/src/schemas/index.ts.
 *
 * Verifies:
 *  - a valid time_entry passes
 *  - actual vs. billing duration are separate fields (independent)
 *  - source enum REJECTS "manual" (only "manual_backdated" is valid)
 *  - timer_state status enum has exactly the 7 contract values
 */
import { describe, expect, it } from "vitest";
import {
  timeEntrySchema,
  timeEntrySourceEnum,
  timerStateSchema,
  timerStatusEnum,
} from "../src/schemas/index.js";

const UUID = "018f1a2b-3c4d-7e6f-8a9b-0c1d2e3f4a5b"; // UUIDv7-shaped
const UUID2 = "018f1a2b-3c4d-7e6f-8a9b-0c1d2e3f4a6c";

/** A minimally-valid time_entry input covering all required fields. */
function validTimeEntry() {
  return {
    id: UUID,
    main_account_id: UUID2,
    status: "completed" as const,
    timezone: "Europe/Berlin",
    actual_started_at: 1_700_000_000_000,
    actual_ended_at: 1_700_000_016_200, // +16200 ms
    actual_duration_seconds: 16200, // 4.5h gross
    net_work_duration_seconds: 14400, // 4h net
    billing_duration_seconds: 15300, // 4.25h billed (rounded up, != actual)
    calculation_version: 1,
    source: "live_timer" as const,
  };
}

// ---------------------------------------------------------------------------
// time_entry — valid input passes; defaults applied
// ---------------------------------------------------------------------------
describe("timeEntrySchema — valid time_entry", () => {
  it("accepts a minimally-valid completed entry", () => {
    const parsed = timeEntrySchema.parse(validTimeEntry());
    expect(parsed.id).toBe(UUID);
    expect(parsed.status).toBe("completed");
    expect(parsed.source).toBe("live_timer");
  });

  it("applies documented defaults for optional flags", () => {
    const parsed = timeEntrySchema.parse(validTimeEntry());
    expect(parsed.break_duration_seconds).toBe(0);
    expect(parsed.rounding_delta_seconds).toBe(0);
    expect(parsed.is_billable).toBe(true);
    expect(parsed.client_visible).toBe(true);
    expect(parsed.is_backdated).toBe(false);
    expect(parsed.crosses_midnight).toBe(false);
    expect(parsed.clock_trust).toBe("trusted");
  });

  it("allows a running entry with actual_ended_at = null", () => {
    const running = { ...validTimeEntry(), status: "running" as const, actual_ended_at: null };
    const parsed = timeEntrySchema.parse(running);
    expect(parsed.actual_ended_at).toBeNull();
  });

  it("rejects a non-integer epoch timestamp", () => {
    const bad = { ...validTimeEntry(), actual_started_at: 1.5 };
    expect(timeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a negative duration (seconds are nonnegative ints)", () => {
    const bad = { ...validTimeEntry(), net_work_duration_seconds: -1 };
    expect(timeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const bad = { ...validTimeEntry(), status: "archived" };
    expect(timeEntrySchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// actual vs billing are separate, independent fields
// ---------------------------------------------------------------------------
describe("timeEntrySchema — actual and billing durations are separate fields", () => {
  it("keeps actual_duration_seconds and billing_duration_seconds distinct", () => {
    const parsed = timeEntrySchema.parse(validTimeEntry());
    expect(parsed.actual_duration_seconds).toBe(16200);
    expect(parsed.billing_duration_seconds).toBe(15300);
    expect(parsed.net_work_duration_seconds).toBe(14400);
    // No coupling: billing can differ from actual and from net.
    expect(parsed.billing_duration_seconds).not.toBe(parsed.actual_duration_seconds);
    expect(parsed.billing_duration_seconds).not.toBe(parsed.net_work_duration_seconds);
  });

  it("accepts billing > actual (rounding-up scenario) without cross-field validation", () => {
    const entry = {
      ...validTimeEntry(),
      actual_duration_seconds: 100,
      net_work_duration_seconds: 100,
      billing_duration_seconds: 900, // rounded up to 15 min
    };
    const parsed = timeEntrySchema.parse(entry);
    expect(parsed.billing_duration_seconds).toBe(900);
    expect(parsed.actual_duration_seconds).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// source enum — rejects "manual", accepts "manual_backdated"
// ---------------------------------------------------------------------------
describe("timeEntrySourceEnum — 'manual' rejected, 'manual_backdated' accepted", () => {
  it("accepts the 4 valid sources", () => {
    for (const src of ["live_timer", "manual_backdated", "imported", "api"]) {
      expect(timeEntrySourceEnum.safeParse(src).success).toBe(true);
    }
  });

  it("REJECTS the bare 'manual' value", () => {
    expect(timeEntrySourceEnum.safeParse("manual").success).toBe(false);
  });

  it("time_entry with source 'manual' fails to parse", () => {
    const bad = { ...validTimeEntry(), source: "manual" };
    expect(timeEntrySchema.safeParse(bad).success).toBe(false);
  });

  it("time_entry with source 'manual_backdated' parses", () => {
    const ok = { ...validTimeEntry(), source: "manual_backdated" as const };
    expect(timeEntrySchema.safeParse(ok).success).toBe(true);
  });

  it("enum has exactly 4 options", () => {
    expect(timeEntrySourceEnum.options).toEqual([
      "live_timer",
      "manual_backdated",
      "imported",
      "api",
    ]);
  });
});

// ---------------------------------------------------------------------------
// timer_state status enum — exactly 7 values
// ---------------------------------------------------------------------------
describe("timerStatusEnum — the 7 timer states", () => {
  const expected = [
    "idle",
    "running",
    "paused",
    "stopped",
    "needs_description",
    "sync_pending",
    "conflict",
  ];

  it("has exactly 7 status values in contract order", () => {
    expect(timerStatusEnum.options).toHaveLength(7);
    expect(timerStatusEnum.options).toEqual(expected);
  });

  it("accepts each of the 7 states", () => {
    for (const s of expected) {
      expect(timerStatusEnum.safeParse(s).success).toBe(true);
    }
  });

  it("rejects a non-state value", () => {
    expect(timerStatusEnum.safeParse("cancelled").success).toBe(false);
  });

  it("timerStateSchema defaults status to 'idle'", () => {
    const parsed = timerStateSchema.parse({
      timer_id: UUID,
      main_account_id: UUID2,
      device_started_on: UUID,
      last_modified_by_device: UUID2,
    });
    expect(parsed.status).toBe("idle");
  });

  it("timerStateSchema accepts an explicit valid status", () => {
    const parsed = timerStateSchema.parse({
      timer_id: UUID,
      main_account_id: UUID2,
      device_started_on: UUID,
      last_modified_by_device: UUID2,
      status: "conflict",
    });
    expect(parsed.status).toBe("conflict");
  });

  it("timerStateSchema rejects an invalid status", () => {
    const bad = {
      timer_id: UUID,
      main_account_id: UUID2,
      device_started_on: UUID,
      last_modified_by_device: UUID2,
      status: "frozen",
    };
    expect(timerStateSchema.safeParse(bad).success).toBe(false);
  });
});
