/**
 * PDF-Arbeitsnachweis: die reine Dokumentdefinition (doc 10 §6.2/§6.3) muss
 * ohne Server/Rendering die Pflichtinhalte tragen:
 *  - Titel,
 *  - Zeitraum,
 *  - actual (tatsächlich/netto) UND billing (Abrechnung) GETRENNT geführt,
 *  - Nachtrag-Kennzeichnung (source = manual_backdated),
 *  - Compliance-Hinweise.
 * Geprüft wird die erzeugte TDocumentDefinition (serialisiert), nicht das PDF.
 */
import { describe, expect, it } from "vitest";
import { buildTimesheetDocDefinition, type TimesheetData } from "../lib/pdf/timesheet.js";

function baseData(over: Partial<TimesheetData> = {}): TimesheetData {
  return {
    title: "Interner Arbeitszeitnachweis",
    userName: "Test",
    periodLabel: "2026-01-01 – 2026-01-31",
    createdAt: "2026-02-01",
    exportNumber: "EX-2026-0001",
    timezone: "Europe/Berlin",
    filterSummary: "keine",
    totals: {
      actualHm: "08:00",
      breakHm: "00:30",
      netHm: "07:30",
      billingHm: "07:15",
      amount: "375,00 €",
      nonBillableHm: "00:00",
    },
    rows: [
      {
        date: "2026-01-02",
        start: "09:00",
        end: "17:00",
        breakHm: "00:30",
        netHm: "07:30",
        billingHm: "07:15",
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
        compliance: ["ArbZG §4: Ruhepause fehlt"],
      },
    ],
    showInternalNotes: true,
    showAmounts: true,
    showCompliance: true,
    complianceNotes: ["ArbZG §5: Ruhezeit 11h unterschritten"],
    checksum: "abc123",
    signature: true,
    ...over,
  };
}

describe("buildTimesheetDocDefinition — Pflichtinhalte", () => {
  it("ist eine A4-Definition mit Content-Array und Seitenfuß", () => {
    const dd = buildTimesheetDocDefinition(baseData());
    expect(dd.pageSize).toBe("A4");
    expect(Array.isArray(dd.content)).toBe(true);
    expect(typeof dd.footer).toBe("function");
  });

  it("trägt den Titel", () => {
    const json = JSON.stringify(buildTimesheetDocDefinition(baseData()).content);
    expect(json).toContain("Interner Arbeitszeitnachweis");
  });

  it("trägt den Zeitraum (Label + Wert)", () => {
    const json = JSON.stringify(buildTimesheetDocDefinition(baseData()).content);
    expect(json).toContain("Zeitraum");
    expect(json).toContain("2026-01-01 – 2026-01-31");
  });

  it("führt tatsächliche (netto) UND Abrechnungszeit GETRENNT", () => {
    const json = JSON.stringify(buildTimesheetDocDefinition(baseData()).content);
    // Getrennte Summen-Kacheln …
    expect(json).toContain("Netto (tatsächlich)");
    expect(json).toContain("Abrechnung (gerundet)");
    // … mit unterschiedlichen Werten (07:30 tatsächlich vs. 07:15 gerundet).
    expect(json).toContain("07:30");
    expect(json).toContain("07:15");
  });

  it("kennzeichnet Nachträge (source = manual_backdated) inkl. Grund", () => {
    const json = JSON.stringify(buildTimesheetDocDefinition(baseData()).content);
    expect(json).toContain("Nachtrag");
    expect(json).toContain("forgot_to_start");
  });

  it("enthält den Compliance-Block und -Hinweise", () => {
    const json = JSON.stringify(buildTimesheetDocDefinition(baseData()).content);
    expect(json).toContain("Compliance-Hinweise");
    expect(json).toContain("ArbZG §5: Ruhezeit 11h unterschritten");
  });

  it("blendet Beträge/interne Notizen in reduzierten Varianten aus", () => {
    const reduced = buildTimesheetDocDefinition(
      baseData({ showInternalNotes: false, showAmounts: false, showCompliance: false }),
    );
    const json = JSON.stringify(reduced.content);
    expect(json).not.toContain("Intern: intern");
    expect(json).not.toContain("Compliance-Hinweise");
    // Nachtrag bleibt dennoch sichtbar (Revisionssicherheit).
    expect(json).toContain("Nachtrag");
  });
});
