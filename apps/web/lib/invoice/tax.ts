/**
 * lib/invoice/tax.ts — reine Steuerlogik der Rechnung (doc 10 §5.3–§5.5).
 *
 * §14 Abs. 4 Nr. 8/9: Entgelt + Steuerbetrag je Steuersatz-Gruppe.
 * §19 UStG (Kleinunternehmer des Ausstellers) und §13b UStG (Reverse Charge
 * beim Kunden) führen zu `tax_rate = 0` + Pflichthinweis. Alles in
 * Integer-Cents, Rundung je Gruppe (kein Float-Drift).
 */
import type { Cents } from "@tarlog/core";

/** Steuerliche Behandlung der Rechnung. */
export type TaxTreatment = "standard" | "small_business" | "reverse_charge";

/** Pflichthinweis §19 UStG (Neuregelung seit 01.01.2025, doc 10 §5.4). */
export const SMALL_BUSINESS_NOTE =
  "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";

/** Pflichthinweis §13b UStG / §14a Abs. 5 UStG (doc 10 §5.5). */
export const REVERSE_CHARGE_NOTE =
  "Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge, § 13b UStG).";

/** Ergebnis der Steuer-Behandlung. */
export interface TaxContext {
  treatment: TaxTreatment;
  /** Anzuwendender Steuersatz in Prozent (0 bei §19/§13b). */
  tax_rate: number;
  /** §14 Nr. 10 Hinweistext oder null. */
  note: string | null;
}

/**
 * Bestimmt die Steuer-Behandlung (doc 10 §5.4/§5.5): §19 des Ausstellers hat
 * Vorrang (keine USt), sonst §13b beim Kunden (keine USt), sonst Regelsteuersatz
 * des Kunden.
 */
export function resolveTaxContext(params: {
  issuerSmallBusiness: boolean;
  customerReverseCharge: boolean;
  customerTaxRate: number;
}): TaxContext {
  if (params.issuerSmallBusiness) {
    return { treatment: "small_business", tax_rate: 0, note: SMALL_BUSINESS_NOTE };
  }
  if (params.customerReverseCharge) {
    return { treatment: "reverse_charge", tax_rate: 0, note: REVERSE_CHARGE_NOTE };
  }
  return { treatment: "standard", tax_rate: params.customerTaxRate, note: null };
}

/** Steuergruppe: Entgelt + Steuerbetrag + Brutto je Satz (§14 Nr. 8/9). */
export interface TaxGroup {
  tax_rate: number;
  net_cents: Cents;
  tax_cents: Cents;
  gross_cents: Cents;
}

/** Rechnungssummen (Netto/USt/Brutto) inkl. Aufschlüsselung je Steuersatz. */
export interface InvoiceTotals {
  net_cents: Cents;
  tax_cents: Cents;
  gross_cents: Cents;
  groups: TaxGroup[];
}

/**
 * Aggregiert Posten zu Steuergruppen und Summen. Der Steuerbetrag wird EINMAL je
 * Gruppe aus dem Netto-Entgelt gerundet (`round(net × rate / 100)`), nicht je
 * Posten — so entsteht kein Rundungs-Drift (doc 10 §4.1 Integer-Cents).
 */
export function computeTotals(items: { net_amount_cents: Cents; tax_rate: number }[]): InvoiceTotals {
  const byRate = new Map<number, Cents>();
  for (const it of items) {
    byRate.set(it.tax_rate, (byRate.get(it.tax_rate) ?? 0) + it.net_amount_cents);
  }
  const groups: TaxGroup[] = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, net]) => {
      const tax = Math.round((net * rate) / 100);
      return { tax_rate: rate, net_cents: net, tax_cents: tax, gross_cents: net + tax };
    });
  const net_cents = groups.reduce((s, g) => s + g.net_cents, 0);
  const tax_cents = groups.reduce((s, g) => s + g.tax_cents, 0);
  return { net_cents, tax_cents, gross_cents: net_cents + tax_cents, groups };
}
