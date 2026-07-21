/**
 * Invoice-Positionsbetrag = Integer-Cents aus billing_seconds × Satz
 * (doc 10 §4/§5, doc 07 Fn 11). Getestet auf zwei Ebenen ohne Server/DB:
 *  - das core-Primitiv computeAmountCents (reine Integer-Arithmetik),
 *  - der Postenbau buildHourlyItems (Gruppierung + EINMALIGE Rundung aus der
 *    Summensekundenzahl, Testfall 20).
 */
import { describe, expect, it } from "vitest";
import { computeAmountCents, type RateSnapshot } from "@tarlog/core";
import { buildHourlyItems, type FallbackRate } from "../lib/invoice/build.js";
import type { BillableEntry } from "../lib/invoice/types.js";

const rate: RateSnapshot = { amount_cents: 6000, currency: "EUR", source: "project" };
const fallback: FallbackRate = { amount_cents: 5000, currency: "EUR", source: "customer" };

function entry(over: Partial<BillableEntry>): BillableEntry {
  return {
    id: "e1",
    project_id: "p1",
    task_id: null,
    label: "Projekt A | Entwicklung",
    description: null,
    timezone: "Europe/Berlin",
    actual_started_at: 0,
    actual_ended_at: 1,
    billing_duration_seconds: 4500,
    net_work_duration_seconds: 4200,
    rate_snapshot: { amount_cents: 6000, currency: "EUR", source: "project" },
    billing_amount_snapshot: 7500,
    rounding_rule_id: "r1",
    rounding_reason: "ceil_started_interval:900s",
    rounding_delta_seconds: 300,
    ...over,
  };
}

describe("computeAmountCents (Fn 11: round(billing_seconds/3600 × rate))", () => {
  it("4500 s (75 min) × 60,00 €/h = 7500 Cents", () => {
    expect(computeAmountCents(4500, rate)).toBe(7500);
  });

  it("liefert immer ganze Cents (Integer, nie Float)", () => {
    // 100 s × 6000 c/h = 600000/3600 = 166.66… → 167 (kaufmännisch gerundet)
    const c = computeAmountCents(100, rate);
    expect(Number.isInteger(c)).toBe(true);
    expect(c).toBe(167);
  });

  it("0 Sekunden → 0 Cents", () => {
    expect(computeAmountCents(0, rate)).toBe(0);
  });
});

describe("buildHourlyItems (Positionsbetrag aus Abrechnungszeit)", () => {
  it("berechnet net_amount_cents = billing_duration × Satz (Integer)", () => {
    const items = buildHourlyItems([entry({})], 19, fallback);
    expect(items).toHaveLength(1);
    expect(items[0]!.net_amount_cents).toBe(7500);
    expect(Number.isInteger(items[0]!.net_amount_cents)).toBe(true);
    expect(items[0]!.unit_price_cents).toBe(6000);
    expect(items[0]!.tax_rate).toBe(19);
  });

  it("gruppiert gleiche Bezeichnung+Satz und rundet EINMAL aus der Summensekundenzahl (Testfall 20)", () => {
    // 2 × 4500 s = 9000 s = 2,5 h → 9000/3600 × 6000 = 15000 Cents
    const items = buildHourlyItems([entry({ id: "a" }), entry({ id: "b" })], 19, fallback);
    expect(items).toHaveLength(1);
    expect(items[0]!.net_amount_cents).toBe(15000);
    expect(items[0]!.links).toHaveLength(2);
  });

  it("nutzt den Fallback-Satz ohne rate_snapshot", () => {
    // 4500/3600 × 5000 = 6250 Cents
    const items = buildHourlyItems([entry({ rate_snapshot: null })], 0, fallback);
    expect(items[0]!.net_amount_cents).toBe(6250);
    expect(items[0]!.unit_price_cents).toBe(5000);
  });

  it("überspringt Einträge ohne Abrechnungszeit", () => {
    expect(buildHourlyItems([entry({ billing_duration_seconds: 0 })], 19, fallback)).toHaveLength(0);
  });
});
