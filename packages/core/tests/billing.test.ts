/**
 * billing.test.ts, tests for the REAL exports of packages/core/src/billing/index.ts.
 * Signatures verified against source:
 *   resolveRate(opts: ResolveRateOptions): RateSnapshot
 *   computeAmountCents(billing_seconds, rate: RateSnapshot): Cents
 *   computeDayRate(net_day_seconds, rule: DayRateRule): Cents
 *   computeDayRateDetailed(net_day_seconds, rule): DayRateResult
 *   computeFixedFeeMargin(actual_seconds, f: FixedFeeInput): FixedFeeMargin
 *   computeBudgetUsage(used_seconds, used_cents, b: BudgetInput): BudgetUsage
 *
 * Money = integer cents only (no float drift). Durations = integer seconds.
 */
import { describe, expect, it } from "vitest";
import {
  computeAmountCents,
  computeBudgetUsage,
  computeDayRate,
  computeDayRateDetailed,
  computeFixedFeeMargin,
  resolveRate,
} from "../src/billing/index.js";
import type {
  BudgetInput,
  DayRateRule,
  FixedFeeInput,
  RateSnapshot,
} from "../src/types.js";

const HOUR = 3600;

function rate(amount_cents: number, source: RateSnapshot["source"] = "default"): RateSnapshot {
  return { amount_cents, currency: "EUR", source };
}

// ---------------------------------------------------------------------------
// resolveRate, precedence task > project > customer > default
// ---------------------------------------------------------------------------
describe("resolveRate precedence (task > project > customer > default)", () => {
  const task = rate(1000, "task");
  const project = rate(2000, "project");
  const customer = rate(3000, "customer");
  const dflt = rate(4000, "default");

  it("task wins over all others", () => {
    const r = resolveRate({ task, project, customer, default: dflt });
    expect(r.amount_cents).toBe(1000);
    expect(r.source).toBe("task");
  });

  it("project wins when no task", () => {
    const r = resolveRate({ project, customer, default: dflt });
    expect(r.amount_cents).toBe(2000);
    expect(r.source).toBe("project");
  });

  it("customer wins when no task/project", () => {
    const r = resolveRate({ customer, default: dflt });
    expect(r.amount_cents).toBe(3000);
    expect(r.source).toBe("customer");
  });

  it("default is the last resort", () => {
    const r = resolveRate({ default: dflt });
    expect(r.amount_cents).toBe(4000);
    expect(r.source).toBe("default");
  });

  it("stamps source from the winning tier even if the snapshot claims another source", () => {
    // A customer-tier snapshot passed as `project` must be re-stamped source="project".
    const r = resolveRate({ project: rate(2000, "customer") });
    expect(r.source).toBe("project");
  });

  it("throws when no rate at any tier is set", () => {
    expect(() => resolveRate({})).toThrow();
  });
});

// ---------------------------------------------------------------------------
// computeAmountCents, integer correctness, no float drift
// ---------------------------------------------------------------------------
describe("computeAmountCents integer correctness (no float drift)", () => {
  it("4500s x 9000c/h = 11250c", () => {
    expect(computeAmountCents(4500, rate(9000))).toBe(11250);
  });

  it("1s x 3600c/h = 1c", () => {
    expect(computeAmountCents(1, rate(3600))).toBe(1);
  });

  it("full hour x rate = rate", () => {
    expect(computeAmountCents(HOUR, rate(9000))).toBe(9000);
  });

  it("returns an integer for a rounding-prone input", () => {
    // 1000s x 10000c/3600 = 2777.77.. -> rounds to 2778 (integer, no drift)
    const cents = computeAmountCents(1000, rate(10000));
    expect(Number.isInteger(cents)).toBe(true);
    expect(cents).toBe(2778);
  });

  it("zero seconds -> zero cents", () => {
    expect(computeAmountCents(0, rate(9000))).toBe(0);
  });

  it("large values stay exact integers (no Number precision loss at this scale)", () => {
    // 8h x 250.00 EUR/h = 2000.00 EUR = 200000c
    expect(computeAmountCents(8 * HOUR, rate(25000))).toBe(200000);
  });
});

// ---------------------------------------------------------------------------
// computeDayRate, full day from 6h; 7h -> full, 3.5h -> half, extra hours
// ---------------------------------------------------------------------------
describe("computeDayRate classification (full day >= 6h)", () => {
  const rule: DayRateRule = {
    full_day_from_seconds: 6 * HOUR, // 21600
    half_day_from_seconds: 3 * HOUR, // 10800
    full_day_cents: 80000,
    half_day_cents: 45000,
  };

  it("7h -> full day", () => {
    expect(computeDayRate(7 * HOUR, rule)).toBe(80000);
    const d = computeDayRateDetailed(7 * HOUR, rule);
    expect(d.classification).toBe("full_day");
    expect(d.amount_cents).toBe(80000);
  });

  it("exactly 6h -> full day (>= boundary is inclusive)", () => {
    const d = computeDayRateDetailed(6 * HOUR, rule);
    expect(d.classification).toBe("full_day");
    expect(d.amount_cents).toBe(80000);
  });

  it("3.5h -> half day", () => {
    const d = computeDayRateDetailed(3.5 * HOUR, rule);
    expect(d.classification).toBe("half_day");
    expect(d.amount_cents).toBe(45000);
  });

  it("below half threshold -> none, 0 cents", () => {
    const d = computeDayRateDetailed(2 * HOUR, rule);
    expect(d.classification).toBe("none");
    expect(d.amount_cents).toBe(0);
  });

  it("extra hours: full + ceil(extra/3600) x extra_hour_cents", () => {
    const withExtra: DayRateRule = { ...rule, extra_hour_cents: 9000 };
    // 8h = full(6h) + 2h extra -> 80000 + 2*9000 = 98000
    const d = computeDayRateDetailed(8 * HOUR, withExtra);
    expect(d.classification).toBe("full_day");
    expect(d.extra_hours).toBe(2);
    expect(d.amount_cents).toBe(98000);
  });

  it("extra hours are ceilinged per started hour", () => {
    const withExtra: DayRateRule = { ...rule, extra_hour_cents: 9000 };
    // 6h + 1s -> 1 started extra hour -> 80000 + 9000
    const d = computeDayRateDetailed(6 * HOUR + 1, withExtra);
    expect(d.extra_hours).toBe(1);
    expect(d.amount_cents).toBe(89000);
  });

  it("no extra_hour_cents -> no extra billing even past full day", () => {
    const d = computeDayRateDetailed(9 * HOUR, rule);
    expect(d.extra_hours).toBe(0);
    expect(d.amount_cents).toBe(80000);
  });
});

// ---------------------------------------------------------------------------
// computeFixedFeeMargin, cost, margin, ratio, over_budget
// ---------------------------------------------------------------------------
describe("computeFixedFeeMargin", () => {
  const f: FixedFeeInput = {
    fixed_fee_cents: 500000, // 5000.00 EUR fixed
    budget_hours: 50,
    internal_rate_cents: 6000, // 60.00 EUR/h internal cost
  };

  it("computes cost, margin and ratio for time under budget", () => {
    // 40h actual x 6000c = 240000c cost; margin = 500000 - 240000 = 260000
    const m = computeFixedFeeMargin(40 * HOUR, f);
    expect(m.actual_cost_cents).toBe(240000);
    expect(m.margin_cents).toBe(260000);
    expect(m.margin_ratio).toBeCloseTo(260000 / 500000, 10);
    expect(m.over_budget).toBe(false);
  });

  it("over_budget true when actual seconds exceed budget_hours", () => {
    // 60h > 50h budget
    const m = computeFixedFeeMargin(60 * HOUR, f);
    expect(m.over_budget).toBe(true);
  });

  it("over_budget false exactly at the budget boundary", () => {
    const m = computeFixedFeeMargin(50 * HOUR, f);
    expect(m.over_budget).toBe(false); // strict > in impl
  });

  it("negative margin when internal cost exceeds the fixed fee", () => {
    // 100h x 6000 = 600000 > 500000 fixed -> margin -100000
    const m = computeFixedFeeMargin(100 * HOUR, f);
    expect(m.margin_cents).toBe(-100000);
    expect(m.margin_ratio).toBeLessThan(0);
    expect(m.over_budget).toBe(true);
  });

  it("actual_cost_cents is an integer (Math.round, no float drift)", () => {
    const m = computeFixedFeeMargin(1000, { ...f, internal_rate_cents: 10000 });
    expect(Number.isInteger(m.actual_cost_cents)).toBe(true);
    expect(m.actual_cost_cents).toBe(2778); // round(1000*10000/3600)
  });

  it("margin_ratio is 0 when fixed_fee_cents is 0 (no divide-by-zero)", () => {
    const m = computeFixedFeeMargin(10 * HOUR, { ...f, fixed_fee_cents: 0 });
    expect(m.margin_ratio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeBudgetUsage, ratios per dimension + crossed thresholds
// ---------------------------------------------------------------------------
describe("computeBudgetUsage thresholds", () => {
  const thresholds: BudgetInput["warn_thresholds"] = [0.8, 1.0];

  it("time budget: ratio and no thresholds crossed at 50%", () => {
    const b: BudgetInput = { budget_seconds: 100 * HOUR, warn_thresholds: thresholds };
    const u = computeBudgetUsage(50 * HOUR, 0, b);
    expect(u.seconds_ratio).toBeCloseTo(0.5, 10);
    expect(u.cents_ratio).toBeNull();
    expect(u.crossed_thresholds).toEqual([]);
  });

  it("crosses the 0.8 threshold at 80% but not 1.0", () => {
    const b: BudgetInput = { budget_seconds: 100 * HOUR, warn_thresholds: thresholds };
    const u = computeBudgetUsage(80 * HOUR, 0, b);
    expect(u.seconds_ratio).toBeCloseTo(0.8, 10);
    expect(u.crossed_thresholds).toEqual([0.8]);
  });

  it("crosses both thresholds at/over 100%", () => {
    const b: BudgetInput = { budget_seconds: 100 * HOUR, warn_thresholds: thresholds };
    const u = computeBudgetUsage(120 * HOUR, 0, b);
    expect(u.crossed_thresholds).toEqual([0.8, 1.0]);
  });

  it("money budget: cents_ratio independent of time", () => {
    const b: BudgetInput = { budget_cents: 100000, warn_thresholds: thresholds };
    const u = computeBudgetUsage(0, 90000, b);
    expect(u.seconds_ratio).toBeNull();
    expect(u.cents_ratio).toBeCloseTo(0.9, 10);
    expect(u.crossed_thresholds).toEqual([0.8]);
  });

  it("uses the highest of the two dimensions to decide thresholds", () => {
    // seconds at 50%, cents at 90% -> max=0.9 -> crosses 0.8
    const b: BudgetInput = {
      budget_seconds: 100 * HOUR,
      budget_cents: 100000,
      warn_thresholds: thresholds,
    };
    const u = computeBudgetUsage(50 * HOUR, 90000, b);
    expect(u.crossed_thresholds).toEqual([0.8]);
  });

  it("no budgets set -> both ratios null, no thresholds crossed", () => {
    const b: BudgetInput = { warn_thresholds: thresholds };
    const u = computeBudgetUsage(50 * HOUR, 90000, b);
    expect(u.seconds_ratio).toBeNull();
    expect(u.cents_ratio).toBeNull();
    expect(u.crossed_thresholds).toEqual([]);
  });

  it("exactly-at threshold counts as crossed (>= semantics)", () => {
    const b: BudgetInput = { budget_seconds: 100 * HOUR, warn_thresholds: [0.8] };
    const u = computeBudgetUsage(80 * HOUR, 0, b);
    expect(u.crossed_thresholds).toEqual([0.8]);
  });
});
