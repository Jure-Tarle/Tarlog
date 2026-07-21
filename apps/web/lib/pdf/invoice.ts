/**
 * lib/pdf/invoice.ts, reine pdfmake-Dokumentdefinition für die PDF-Rechnung
 * (doc 10 §5.1 Fn 23, §5.3 §14-UStG-Pflichtangaben, §5.4/§5.5 Hinweise).
 *
 * Reine Funktion: nimmt bereits aufbereitete, formatierte Werte (Snapshots,
 * Beträge als Strings) und liefert die Dokumentdefinition. Keine Steuer-/
 * Betragsrechnung hier, die liegt in lib/invoice/* (Integer-Cents).
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";

/** Ein Rechnungsposten, bereits formatiert (doc 10 §5.2). */
export interface InvoicePdfItem {
  position: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  net: string;
  taxRate: string;
}

/** Steuergruppe (Entgelt je Steuersatz, §14 Abs. 4 Nr. 8/9). */
export interface InvoicePdfTaxGroup {
  label: string;
  net: string;
  tax: string;
}

/** Vollständige, formatierte Eingabe der PDF-Rechnung. */
export interface InvoicePdfData {
  /** §14 Nr. 1: Aussteller (Leistender). */
  issuer: { name: string; address: string | null; taxLine: string | null; email: string | null };
  /** §14 Nr. 2: Leistungsempfänger. */
  customer: { name: string; address: string | null; vatId: string | null; number: string | null };
  /** §14 Nr. 5: fortlaufende Rechnungsnummer (oder "ENTWURF"). */
  invoiceNumber: string;
  /** §14 Nr. 4: Ausstellungsdatum. */
  issueDate: string;
  /** §14 Nr. 7: Leistungszeitpunkt/-zeitraum. */
  servicePeriod: string | null;
  serviceDate: string | null;
  dueDate: string | null;
  currency: string;
  typeLabel: string;
  items: InvoicePdfItem[];
  taxGroups: InvoicePdfTaxGroup[];
  totals: { net: string; tax: string; gross: string };
  /** §14 Nr. 10: §19- bzw. §13b-Hinweis. */
  taxNote: string | null;
  /** Kunden-Fußnotiz (default_invoice_note). */
  footerNote: string | null;
  isDraft: boolean;
}

const ACCENT = "#1f6feb";
const MUTED = "#6b7280";
const BORDER = "#d0d7de";

function addressBlock(title: string, lines: (string | null)[]): Content {
  return {
    stack: [
      { text: title, fontSize: 7, color: MUTED, margin: [0, 0, 0, 2] },
      ...lines.filter((l): l is string => Boolean(l)).map((l) => ({ text: l, fontSize: 9 }) as Content),
    ],
  };
}

/** Baut die Dokumentdefinition der Rechnung (doc 10 §5). */
export function buildInvoiceDocDefinition(data: InvoicePdfData): TDocumentDefinitions {
  // Aussteller-Kopf + Empfänger.
  const parties: Content = {
    columns: [
      addressBlock("Aussteller", [data.issuer.name, data.issuer.address, data.issuer.taxLine, data.issuer.email]),
      addressBlock("Rechnung an", [
        data.customer.name,
        data.customer.address,
        data.customer.number ? `Kundennr.: ${data.customer.number}` : null,
        data.customer.vatId ? `USt-IdNr.: ${data.customer.vatId}` : null,
      ]),
    ],
    columnGap: 24,
  };

  // Rechnungskopf-Metadaten (§14 Nr. 4/5/7).
  const metaTable: Content = {
    margin: [0, 16, 0, 0],
    table: {
      widths: ["auto", "*"],
      body: [
        [{ text: "Rechnungsnr.", style: "metaLabel" }, { text: data.invoiceNumber, style: "metaValue", bold: true }],
        [{ text: "Rechnungsdatum", style: "metaLabel" }, { text: data.issueDate, style: "metaValue" }],
        ...(data.serviceDate
          ? [[{ text: "Leistungsdatum", style: "metaLabel" }, { text: data.serviceDate, style: "metaValue" }]]
          : []),
        ...(data.servicePeriod
          ? [[{ text: "Leistungszeitraum", style: "metaLabel" }, { text: data.servicePeriod, style: "metaValue" }]]
          : []),
        ...(data.dueDate
          ? [[{ text: "Fällig am", style: "metaLabel" }, { text: data.dueDate, style: "metaValue" }]]
          : []),
      ],
    },
    layout: "noBorders",
  };

  // Posten-Tabelle (§14 Nr. 6/8).
  const itemHead: Content[] = [
    { text: "Pos.", style: "th" },
    { text: "Beschreibung", style: "th" },
    { text: "Menge", style: "th", alignment: "right" },
    { text: "Einheit", style: "th" },
    { text: "Einzelpreis", style: "th", alignment: "right" },
    { text: "USt", style: "th", alignment: "right" },
    { text: "Netto", style: "th", alignment: "right" },
  ];
  const itemBody: Content[][] = [itemHead];
  for (const it of data.items) {
    itemBody.push([
      { text: String(it.position), style: "td" },
      { text: it.description, style: "td" },
      { text: it.quantity, style: "td", alignment: "right" },
      { text: it.unit, style: "td" },
      { text: it.unitPrice, style: "td", alignment: "right" },
      { text: it.taxRate, style: "td", alignment: "right" },
      { text: it.net, style: "td", alignment: "right" },
    ]);
  }

  // Summen + Steuergruppen (§14 Nr. 8/9).
  const summaryBody: Content[][] = [
    [{ text: "Netto", style: "sumLabel" }, { text: data.totals.net, style: "sumValue" }],
  ];
  for (const g of data.taxGroups) {
    summaryBody.push([
      { text: `USt ${g.label}`, style: "sumLabel" },
      { text: g.tax, style: "sumValue" },
    ]);
  }
  summaryBody.push([
    { text: "Gesamtbetrag", style: "sumLabelBold" },
    { text: data.totals.gross, style: "sumValueBold" },
  ]);

  const content: Content[] = [
    { text: data.typeLabel, fontSize: 16, bold: true, color: ACCENT },
    parties,
    metaTable,
    {
      margin: [0, 16, 0, 0],
      table: { headerRows: 1, widths: [22, "*", 40, 40, 60, 34, 60], body: itemBody },
      layout: {
        hLineWidth: (i: number) => (i <= 1 ? 0.8 : 0.4),
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
    },
    {
      margin: [0, 12, 0, 0],
      columns: [
        { width: "*", text: "" },
        {
          width: 240,
          table: { widths: ["*", "auto"], body: summaryBody },
          layout: {
            hLineWidth: (i: number) => (i === summaryBody.length - 1 || i === summaryBody.length ? 0.8 : 0),
            vLineWidth: () => 0,
            hLineColor: () => BORDER,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
        },
      ],
    },
  ];

  // §14 Nr. 10: Steuerbefreiungs-Hinweis (§19 / §13b).
  if (data.taxNote) {
    content.push({ text: data.taxNote, fontSize: 9, margin: [0, 16, 0, 0], color: "#111827" });
  }
  if (data.footerNote) {
    content.push({ text: data.footerNote, fontSize: 8, color: MUTED, margin: [0, 12, 0, 0] });
  }

  return {
    pageSize: "A4",
    pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: "Roboto", fontSize: 9, color: "#111827" },
    // Entwurf sichtbar markieren (keine gültige Rechnung ohne Finalisierung).
    ...(data.isDraft
      ? {
          watermark: { text: "ENTWURF", color: "#9ca3af", opacity: 0.25, bold: true },
        }
      : {}),
    styles: {
      th: { fontSize: 8, bold: true, color: MUTED },
      td: { fontSize: 8 },
      metaLabel: { fontSize: 8, color: MUTED, margin: [0, 1, 8, 1] },
      metaValue: { fontSize: 8, margin: [0, 1, 0, 1] },
      sumLabel: { fontSize: 8, color: MUTED, alignment: "right" },
      sumValue: { fontSize: 8, alignment: "right" },
      sumLabelBold: { fontSize: 10, bold: true, alignment: "right" },
      sumValueBold: { fontSize: 10, bold: true, alignment: "right" },
    },
    footer: (currentPage: number, pageCount: number): Content => ({
      columns: [
        { text: data.invoiceNumber, fontSize: 7, color: MUTED, margin: [48, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, alignment: "right", fontSize: 7, color: MUTED, margin: [0, 0, 48, 0] },
      ],
      margin: [0, 12, 0, 0],
    }),
    content,
  };
}
