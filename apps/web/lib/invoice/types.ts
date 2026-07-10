/**
 * lib/invoice/types.ts — gemeinsame Typen für den Rechnungsbau (doc 10 §5).
 *
 * Reine Datenformen; keine DB-Kopplung. Geld immer Integer-Cents, Zeiten
 * epoch-ms UTC + IANA-Zeitzone, Dauern ganze Sekunden (doc 05 §8, doc 10
 * "Bewusste Entscheidungen").
 */
import type { Cents, CurrencyCode, EpochMs, IanaTimezone, Seconds } from "@ptl/core";

/** Aussteller (Leistender) — §14 Abs. 4 Nr. 1/3 (doc 10 §5.3). */
export interface IssuerProfile {
  display_name: string;
  company_name: string | null;
  email: string | null;
  /** Freitext-Anschrift des Ausstellers (aus settings, sonst null). */
  address: string | null;
  /** Steuernummer oder USt-IdNr des Leistenden (§14 Nr. 3). */
  tax_number: string | null;
  vat_id: string | null;
  /** §19 UStG Kleinunternehmer des Leistenden. */
  small_business: boolean;
  currency: CurrencyCode;
  locale: string;
}

/** Kunden-Stammdaten, die in die Rechnung/den Snapshot einfließen (doc 10 §1). */
export interface InvoiceCustomer {
  id: string;
  name: string;
  company: string | null;
  contact_person: string | null;
  email: string | null;
  billing_address: string | null;
  vat_id: string | null;
  customer_number: string | null;
  /** default_tax_rate als numeric-String (z. B. "19.00"). */
  default_tax_rate: string | null;
  reverse_charge_hint: boolean | null;
  small_business_hint: boolean | null;
  default_currency: string | null;
  default_invoice_note: string | null;
  payment_term_days: number | null;
}

/**
 * Ein abrechenbarer Zeiteintrag, reduziert auf die für den Rechnungsbau
 * relevanten Felder (doc 06 A.3). `label` ist die vom Aufrufer aufgelöste
 * Gruppen-/Postenbezeichnung (z. B. "Projekt · Aufgabe").
 */
export interface BillableEntry {
  id: string;
  project_id: string | null;
  task_id: string | null;
  label: string;
  description: string | null;
  timezone: IanaTimezone;
  actual_started_at: EpochMs;
  actual_ended_at: EpochMs | null;
  billing_duration_seconds: Seconds;
  net_work_duration_seconds: Seconds;
  /** Eingefrorener Ratensatz am Eintrag (doc 07 §5). */
  rate_snapshot: { amount_cents: Cents; currency: CurrencyCode; source?: string } | null;
  billing_amount_snapshot: Cents | null;
  rounding_rule_id: string | null;
  rounding_reason: string | null;
  rounding_delta_seconds: Seconds | null;
}

/** Ein fertig berechneter Rechnungsposten (Integer-Cents; doc 10 §5.2). */
export interface DraftItem {
  kind: "hourly" | "day_rate" | "fixed_fee" | "flat" | "discount" | "expense" | "travel";
  description: string;
  /** Menge in Stunden/Tagen/Stück (Anzeige). */
  quantity: number;
  unit: "hours" | "days" | "piece" | "percent";
  unit_price_cents: Cents;
  net_amount_cents: Cents;
  /** Steuersatz in Prozent (0 bei §19/§13b). */
  tax_rate: number;
  /** Verknüpfte Zeiteinträge (invoice_time_entries) mit abgerechneter Dauer. */
  links: { time_entry_id: string; billed_duration_seconds: Seconds }[];
}
