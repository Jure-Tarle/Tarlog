/**
 * Unit-Tests der reinen Rechnungslogik (doc 10 §5). Kein Server/DB — nur pure
 * functions (tax/build/snapshot). Deckt Testfall 20 (Summe = gerundete
 * Abrechnungszeit) und §19/§13b-Steuerbehandlung ab.
 */
import { describe, expect, it } from "vitest";
import { buildHourlyItems, type FallbackRate } from "./build.js";
import { computeTotals, resolveTaxContext, SMALL_BUSINESS_NOTE, REVERSE_CHARGE_NOTE } from "./tax.js";
import type { BillableEntry } from "./types.js";

function entry(over: Partial<BillableEntry>): BillableEntry {
  return {
    id: "e1",
    project_id: "p1",
    task_id: null,
    label: "Projekt A · Entwicklung",
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

const fallback: FallbackRate = { amount_cents: 5000, currency: "EUR", source: "customer" };

describe("buildHourlyItems", () => {
  it("berechnet Betrag aus billing_duration × Satz (Testfall 20)", () => {
    // 75 min (4500 s) × 60,00 €/h = 93,75 €? nein: 4500/3600*6000 = 7500 cents.
    const items = buildHourlyItems([entry({})], 19, fallback);
    expect(items).toHaveLength(1);
    expect(items[0]!.net_amount_cents).toBe(7500);
    expect(items[0]!.quantity).toBeCloseTo(1.25, 5);
    expect(items[0]!.unit_price_cents).toBe(6000);
    expect(items[0]!.tax_rate).toBe(19);
  });

  it("gruppiert gleiche Bezeichnung+Satz und rundet EINMAL aus der Summensekundenzahl", () => {
    // Zwei Einträge je 4200 s (70 min) netto→ billing 4500 s. Summe 9000 s = 2,5 h.
    const items = buildHourlyItems(
      [entry({ id: "a" }), entry({ id: "b" })],
      19,
      fallback,
    );
    expect(items).toHaveLength(1);
    // 9000/3600*6000 = 15000 cents.
    expect(items[0]!.net_amount_cents).toBe(15000);
    expect(items[0]!.links).toHaveLength(2);
  });

  it("nutzt den Fallback-Satz, wenn kein rate_snapshot vorliegt", () => {
    const items = buildHourlyItems([entry({ rate_snapshot: null })], 0, fallback);
    // 4500/3600*5000 = 6250 cents.
    expect(items[0]!.net_amount_cents).toBe(6250);
    expect(items[0]!.unit_price_cents).toBe(5000);
  });

  it("überspringt Einträge ohne Abrechnungszeit", () => {
    const items = buildHourlyItems([entry({ billing_duration_seconds: 0 })], 19, fallback);
    expect(items).toHaveLength(0);
  });
});

describe("computeTotals", () => {
  it("gruppiert je Steuersatz und rundet die Steuer einmal je Gruppe", () => {
    const totals = computeTotals([
      { net_amount_cents: 10000, tax_rate: 19 },
      { net_amount_cents: 5000, tax_rate: 19 },
      { net_amount_cents: 2000, tax_rate: 7 },
    ]);
    expect(totals.net_cents).toBe(17000);
    // 15000 * 19% = 2850; 2000 * 7% = 140.
    expect(totals.tax_cents).toBe(2990);
    expect(totals.gross_cents).toBe(19990);
    expect(totals.groups).toHaveLength(2);
    expect(totals.groups.find((g) => g.tax_rate === 19)!.tax_cents).toBe(2850);
  });

  it("liefert 0 Steuer bei Steuersatz 0 (§19/§13b)", () => {
    const totals = computeTotals([{ net_amount_cents: 10000, tax_rate: 0 }]);
    expect(totals.tax_cents).toBe(0);
    expect(totals.gross_cents).toBe(10000);
  });
});

describe("resolveTaxContext", () => {
  it("§19 Kleinunternehmer hat Vorrang: Steuersatz 0 + Hinweis", () => {
    const ctx = resolveTaxContext({ issuerSmallBusiness: true, customerReverseCharge: true, customerTaxRate: 19 });
    expect(ctx.treatment).toBe("small_business");
    expect(ctx.tax_rate).toBe(0);
    expect(ctx.note).toBe(SMALL_BUSINESS_NOTE);
  });

  it("§13b Reverse Charge: Steuersatz 0 + Hinweis", () => {
    const ctx = resolveTaxContext({ issuerSmallBusiness: false, customerReverseCharge: true, customerTaxRate: 19 });
    expect(ctx.treatment).toBe("reverse_charge");
    expect(ctx.tax_rate).toBe(0);
    expect(ctx.note).toBe(REVERSE_CHARGE_NOTE);
  });

  it("Regelfall: Steuersatz des Kunden, kein Hinweis", () => {
    const ctx = resolveTaxContext({ issuerSmallBusiness: false, customerReverseCharge: false, customerTaxRate: 19 });
    expect(ctx.treatment).toBe("standard");
    expect(ctx.tax_rate).toBe(19);
    expect(ctx.note).toBeNull();
  });
});
