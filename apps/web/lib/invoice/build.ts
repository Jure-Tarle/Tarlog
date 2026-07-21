/**
 * lib/invoice/build.ts, reiner Bau der Stundenposten aus Zeiteinträgen
 * (doc 10 §5.1 Fn 1, §5.2 Postenart `hourly`).
 *
 * Grundsatz (doc 10 §4): die abrechenbare Zeit stammt aus der gerundeten
 * `billing_duration_seconds`, nie aus `actual_duration_seconds`. Der Betrag wird
 * über `computeAmountCents(billing_seconds, rate)` aus @tarlog/core berechnet
 * (Integer-Cents). Einträge werden nach aufgelöstem Satz + Bezeichnung gruppiert;
 * je Gruppe genau ein Posten, der Betrag EINMAL aus der Summensekundenzahl
 * gerundet, die Postensumme stimmt damit exakt zur gerundeten Abrechnungszeit
 * (Testfall 20).
 */
import { computeAmountCents } from "@tarlog/core";
import type { Cents, CurrencyCode, RateSnapshot, Seconds } from "@tarlog/core";
import type { BillableEntry, DraftItem } from "./types.js";

/** Fällt zurück, wenn ein Eintrag keinen eingefrorenen `rate_snapshot` trägt. */
export interface FallbackRate {
  amount_cents: Cents;
  currency: CurrencyCode;
  source: RateSnapshot["source"];
}

/** Löst den effektiven Satz eines Eintrags auf (Snapshot vor Fallback). */
function entryRate(entry: BillableEntry, fallback: FallbackRate): RateSnapshot {
  const snap = entry.rate_snapshot;
  if (snap && typeof snap.amount_cents === "number" && typeof snap.currency === "string") {
    return {
      amount_cents: snap.amount_cents,
      currency: snap.currency,
      source: (snap.source as RateSnapshot["source"]) ?? "manual",
    };
  }
  return { amount_cents: fallback.amount_cents, currency: fallback.currency, source: fallback.source };
}

/** Menge in Stunden aus Sekunden, auf 2 Nachkommastellen (Anzeige). */
function toHours(seconds: Seconds): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

/**
 * Baut Stundenposten aus billable Einträgen. Gruppiert nach
 * `label + amount_cents + currency`; Steuersatz kommt aus dem Kontext.
 * Nicht abrechenbare oder laufende (kein Ende) Einträge müssen der Aufrufer
 * bereits ausgefiltert haben; hier zählt `billing_duration_seconds`.
 */
export function buildHourlyItems(
  entries: BillableEntry[],
  taxRate: number,
  fallback: FallbackRate,
): DraftItem[] {
  const groups = new Map<
    string,
    { rate: RateSnapshot; label: string; seconds: Seconds; links: DraftItem["links"] }
  >();

  for (const e of entries) {
    if (e.billing_duration_seconds <= 0) continue;
    const rate = entryRate(e, fallback);
    const key = `${e.label}||${rate.amount_cents}||${rate.currency}`;
    const g = groups.get(key);
    if (g) {
      g.seconds += e.billing_duration_seconds;
      g.links.push({ time_entry_id: e.id, billed_duration_seconds: e.billing_duration_seconds });
    } else {
      groups.set(key, {
        rate,
        label: e.label,
        seconds: e.billing_duration_seconds,
        links: [{ time_entry_id: e.id, billed_duration_seconds: e.billing_duration_seconds }],
      });
    }
  }

  const items: DraftItem[] = [];
  for (const g of groups.values()) {
    // Betrag EINMAL aus der Gruppen-Summensekundenzahl runden (kein Per-Eintrag-Drift).
    const net = computeAmountCents(g.seconds, g.rate);
    items.push({
      kind: "hourly",
      description: g.label,
      quantity: toHours(g.seconds),
      unit: "hours",
      unit_price_cents: g.rate.amount_cents,
      net_amount_cents: net,
      tax_rate: taxRate,
      links: g.links,
    });
  }
  // Stabile Reihenfolge nach Bezeichnung.
  items.sort((a, b) => a.description.localeCompare(b.description));
  return items;
}

/**
 * Freie Posten (Pauschale/Rabatt/Auslage/Reisekosten) übernehmen (doc 10 §5.2).
 * Rabatt trägt einen negativen Betrag. Menge/Einzelpreis sind Anzeigefelder;
 * `net_amount_cents` ist der maßgebliche Wert.
 */
export interface ExtraItemInput {
  kind: "flat" | "discount" | "expense" | "travel";
  description: string;
  quantity?: number;
  unit?: DraftItem["unit"];
  unit_price_cents?: Cents;
  net_amount_cents: Cents;
}

export function buildExtraItems(inputs: ExtraItemInput[], taxRate: number): DraftItem[] {
  return inputs.map((it) => ({
    kind: it.kind,
    description: it.description,
    quantity: it.quantity ?? 1,
    unit: it.unit ?? "piece",
    unit_price_cents: it.unit_price_cents ?? it.net_amount_cents,
    net_amount_cents: it.net_amount_cents,
    tax_rate: taxRate,
    links: [],
  }));
}
