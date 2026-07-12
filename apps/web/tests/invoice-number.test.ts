/**
 * Rechnungsnummern-Format RE-{JAHR}-{NNNN} (doc 10 §5.6).
 *
 * Reine Formatierer aus lib/invoice/number.ts — kein Server/DB. Deckt das
 * lückenlose, nullgepolsterte Nummernschema (Rechnung + Export) und den
 * settings-Key eines Jahres-Nummernkreises ab.
 */
import { describe, expect, it } from "vitest";
import {
  formatExportNumber,
  formatInvoiceNumber,
  sequenceKey,
} from "../lib/invoice/number.js";

describe("formatInvoiceNumber (RE-JAHR-NNNN)", () => {
  it("baut RE-<Jahr>-<4-stellig nullgepolstert>", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("RE-2026-0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("RE-2026-0042");
    expect(formatInvoiceNumber(2026, 1234)).toBe("RE-2026-1234");
  });

  it("entspricht dem Muster RE-<4-stelliges Jahr>-<mind. 4 Ziffern>", () => {
    expect(formatInvoiceNumber(2026, 7)).toMatch(/^RE-\d{4}-\d{4,}$/);
  });

  it("schneidet Zähler > 9999 nicht ab (bleibt lückenlos, keine Kollision)", () => {
    expect(formatInvoiceNumber(2026, 12345)).toBe("RE-2026-12345");
  });

  it("respektiert einen abweichenden Präfix (z. B. Gutschrift)", () => {
    expect(formatInvoiceNumber(2027, 7, "GS")).toBe("GS-2027-0007");
  });
});

describe("formatExportNumber (EX-JAHR-NNNN)", () => {
  it("nutzt EX-Präfix + 4-stelligen Zähler", () => {
    expect(formatExportNumber(2026, 1)).toBe("EX-2026-0001");
    expect(formatExportNumber(2026, 99)).toBe("EX-2026-0099");
  });
});

describe("sequenceKey", () => {
  it("bildet den settings-Key je Kreis + Jahr", () => {
    expect(sequenceKey("invoice", 2026)).toBe("number_sequence:invoice:2026");
    expect(sequenceKey("export", 2027)).toBe("number_sequence:export:2027");
  });
});
