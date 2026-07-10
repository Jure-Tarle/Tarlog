/**
 * Unit-Tests der reinen PDF-Dokumentdefinitionen + Formatierung (doc 10 §6.4:
 * "dokumentdefinition testbar ohne Server"). Rendert NICHT — prüft nur die
 * erzeugten Definitionsstrukturen und Formatierer.
 */
import { describe, expect, it } from "vitest";
import { formatDurationHm, formatLocalClock, formatLocalDate, formatMoneyCents, secondsToHours } from "./format.js";
import { buildTimesheetDocDefinition, type TimesheetData } from "./timesheet.js";
import { buildInvoiceDocDefinition, type InvoicePdfData } from "./invoice.js";

describe("format", () => {
  it("formatiert Dauer als HH:MM", () => {
    expect(formatDurationHm(4500)).toBe("01:15");
    expect(formatDurationHm(0)).toBe("00:00");
    expect(formatDurationHm(3660)).toBe("01:01");
  });

  it("rechnet Sekunden in Dezimalstunden", () => {
    expect(secondsToHours(4500)).toBe(1.25);
  });

  it("formatiert Geld als Euro-Cents", () => {
    // Non-breaking spaces sind egal — Betrag + Symbol prüfen.
    expect(formatMoneyCents(123456, "EUR").replace(/ /g, " ")).toContain("1.234,56");
  });

  it("löst lokale Zeit IANA-korrekt auf (DST Europe/Berlin)", () => {
    // 2026-06-01 12:00 UTC = 14:00 Berlin (Sommerzeit).
    const at = Date.UTC(2026, 5, 1, 12, 0, 0);
    expect(formatLocalDate(at, "Europe/Berlin")).toBe("2026-06-01");
    expect(formatLocalClock(at, "Europe/Berlin")).toBe("14:00");
  });
});

const timesheet: TimesheetData = {
  title: "Interner Arbeitszeitnachweis",
  userName: "Test",
  periodLabel: "2026-01-01 – 2026-01-31",
  createdAt: "2026-02-01",
  exportNumber: "EX-2026-0001",
  timezone: "Europe/Berlin",
  filterSummary: "keine",
  totals: { actualHm: "08:00", breakHm: "00:30", netHm: "07:30", billingHm: "07:30", amount: "375,00 €", nonBillableHm: "00:00" },
  rows: [
    {
      date: "2026-01-02",
      start: "09:00",
      end: "17:00",
      breakHm: "00:30",
      netHm: "07:30",
      billingHm: "07:30",
      project: "Projekt A",
      task: "Entwicklung",
      description: "Feature X",
      internalNote: "intern",
      tags: ["billable"],
      billable: true,
      rate: "50,00 €/h",
      amount: "375,00 €",
      backdated: true,
      backdateReason: "forgot_to_start",
      compliance: ["ArbZG §4: …"],
    },
  ],
  showInternalNotes: true,
  showAmounts: true,
  showCompliance: true,
  complianceNotes: ["ArbZG §4: …"],
  checksum: "abc123",
  signature: true,
};

describe("buildTimesheetDocDefinition", () => {
  it("liefert eine A4-Definition mit Content-Array", () => {
    const dd = buildTimesheetDocDefinition(timesheet);
    expect(dd.pageSize).toBe("A4");
    expect(Array.isArray(dd.content)).toBe(true);
    expect(typeof dd.footer).toBe("function");
  });

  it("blendet interne Notizen/Beträge in reduzierten Varianten aus", () => {
    const reduced = buildTimesheetDocDefinition({ ...timesheet, showInternalNotes: false, showAmounts: false });
    const jsonStr = JSON.stringify(reduced.content);
    expect(jsonStr).not.toContain("Intern: intern");
  });
});

const invoice: InvoicePdfData = {
  issuer: { name: "Firma", address: "Str. 1, Ort", taxLine: "USt-IdNr.: DE123", email: "a@b.de" },
  customer: { name: "Kunde GmbH", address: "Weg 2", vatId: "DE999", number: "K-1" },
  invoiceNumber: "RE-2026-0001",
  issueDate: "2026-02-01",
  servicePeriod: "2026-01-01 – 2026-01-31",
  serviceDate: null,
  dueDate: "2026-02-15",
  currency: "EUR",
  typeLabel: "Rechnung",
  items: [
    { position: 1, description: "Entwicklung", quantity: "7,50", unit: "Std.", unitPrice: "50,00 €", net: "375,00 €", taxRate: "19 %" },
  ],
  taxGroups: [{ label: "19 %", net: "375,00 €", tax: "71,25 €" }],
  totals: { net: "375,00 €", tax: "71,25 €", gross: "446,25 €" },
  taxNote: null,
  footerNote: "Danke",
  isDraft: false,
};

describe("buildInvoiceDocDefinition", () => {
  it("liefert eine A4-Definition ohne Wasserzeichen bei finalisierter Rechnung", () => {
    const dd = buildInvoiceDocDefinition(invoice);
    expect(dd.pageSize).toBe("A4");
    expect(dd.watermark).toBeUndefined();
  });

  it("setzt ENTWURF-Wasserzeichen bei Entwurf", () => {
    const dd = buildInvoiceDocDefinition({ ...invoice, isDraft: true });
    expect(dd.watermark).toBeDefined();
  });
});
