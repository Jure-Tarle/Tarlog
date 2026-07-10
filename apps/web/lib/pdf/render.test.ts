/**
 * Integrationstest des pdfmake-Renderers (der einzige unreine Teil von lib/pdf).
 * Bestätigt, dass vfs_fonts eingebunden ist und ein gültiger PDF-Buffer entsteht
 * (doc 10 §6.4). Läuft in Node (vitest), ohne Chromium.
 */
import { describe, expect, it } from "vitest";
import { renderPdf } from "./render.js";
import { buildInvoiceDocDefinition } from "./invoice.js";

describe("renderPdf", () => {
  it(
    "erzeugt einen gültigen PDF-Buffer aus einer Dokumentdefinition",
    async () => {
      const pdf = await renderPdf(
        buildInvoiceDocDefinition({
          issuer: { name: "Firma", address: "Str. 1", taxLine: "USt-IdNr.: DE123", email: null },
          customer: { name: "Kunde", address: "Weg 2", vatId: null, number: null },
          invoiceNumber: "RE-2026-0001",
          issueDate: "2026-02-01",
          servicePeriod: null,
          serviceDate: null,
          dueDate: null,
          currency: "EUR",
          typeLabel: "Rechnung",
          items: [
            { position: 1, description: "Entwicklung", quantity: "7,50", unit: "Std.", unitPrice: "50,00 €", net: "375,00 €", taxRate: "19 %" },
          ],
          taxGroups: [{ label: "19 %", net: "375,00 €", tax: "71,25 €" }],
          totals: { net: "375,00 €", tax: "71,25 €", gross: "446,25 €" },
          taxNote: null,
          footerNote: null,
          isDraft: false,
        }),
      );
      expect(pdf.length).toBeGreaterThan(500);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    },
    30_000,
  );
});
