/**
 * lib/invoice/snapshot.ts — reine Snapshot-Bildung für die Finalisierung
 * (doc 10 §5.1 Fn 16–19, §5.6). Zum Finalisierungszeitpunkt werden Kunde,
 * Projekt, Satz und Rundungsregel eingefroren, damit spätere
 * Stammdatenänderungen finalisierte Rechnungen nicht verändern (Immutability).
 */
import type { BillableEntry, DraftItem, InvoiceCustomer } from "./types.js";

/** Projekt-Kerndaten für den Snapshot (doc 10 §2). */
export interface SnapshotProject {
  id: string;
  name: string;
  project_code: string | null;
  billing_type: string;
  customer_id: string | null;
}

/** §14 Nr. 2 + Kundenstamm → Kunden-Snapshot (doc 10 §5.1 Fn 16). */
export function buildCustomerSnapshot(c: InvoiceCustomer): Record<string, unknown> {
  return {
    id: c.id,
    name: c.name,
    company: c.company,
    contact_person: c.contact_person,
    email: c.email,
    billing_address: c.billing_address,
    vat_id: c.vat_id,
    customer_number: c.customer_number,
    default_tax_rate: c.default_tax_rate,
    reverse_charge_hint: c.reverse_charge_hint ?? false,
    small_business_hint: c.small_business_hint ?? false,
    frozen_at: Date.now(),
  };
}

/** Projekt-Snapshot (doc 10 §5.1 Fn 17); null wenn kein Projektbezug. */
export function buildProjectSnapshot(p: SnapshotProject | null): Record<string, unknown> | null {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    project_code: p.project_code,
    billing_type: p.billing_type,
    customer_id: p.customer_id,
    frozen_at: Date.now(),
  };
}

/** Satz-Snapshot je Posten (doc 10 §5.1 Fn 18). */
export function buildRateSnapshot(items: DraftItem[]): Record<string, unknown> {
  return {
    items: items.map((it) => ({
      description: it.description,
      kind: it.kind,
      unit: it.unit,
      unit_price_cents: it.unit_price_cents,
      tax_rate: it.tax_rate,
    })),
    frozen_at: Date.now(),
  };
}

/** Rundungsregel-Snapshot aus den verknüpften Einträgen (doc 10 §5.1 Fn 19). */
export function buildRoundingSnapshot(entries: BillableEntry[]): Record<string, unknown> {
  return {
    entries: entries.map((e) => ({
      time_entry_id: e.id,
      rounding_rule_id: e.rounding_rule_id,
      rounding_reason: e.rounding_reason,
      rounding_delta_seconds: e.rounding_delta_seconds ?? 0,
      net_work_duration_seconds: e.net_work_duration_seconds,
      billing_duration_seconds: e.billing_duration_seconds,
    })),
    frozen_at: Date.now(),
  };
}
