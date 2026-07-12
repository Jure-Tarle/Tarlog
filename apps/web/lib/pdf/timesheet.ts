/**
 * lib/pdf/timesheet.ts — reine pdfmake-Dokumentdefinition für den
 * Arbeitszeitnachweis (doc 10 §6.2 alle 38 Inhalte, §6.3 die 7 Varianten).
 *
 * Reine Funktion: nimmt fertig aufbereitete Zeilen/Summen und liefert eine
 * TDocumentDefinition — keine DB, kein pdfmake-Aufruf hier (testbar ohne
 * Server). Die tatsächliche Arbeitszeit (Nettozeit, Inhalt 14) und die
 * gerundete Abrechnungszeit (Inhalt 15/24) werden bewusst getrennt geführt
 * (doc 07, doc 10 §6.2 Schlussabsatz).
 */
import type { Column, Content, TDocumentDefinitions } from "pdfmake/interfaces";

/** Eine Eintragszeile der Nachweis-Tabelle (Inhalte 18–35). */
export interface TimesheetRow {
  /** (19) lokales Datum "yyyy-MM-dd". */
  date: string;
  /** (20) Startzeit lokal "HH:mm". */
  start: string;
  /** (21) Endzeit lokal "HH:mm" (oder "—" wenn laufend). */
  end: string;
  /** (22) Pausen "HH:MM". */
  breakHm: string;
  /** (23) Nettozeit "HH:MM" (tatsächlich). */
  netHm: string;
  /** (24) Abrechnungszeit "HH:MM" (gerundet). */
  billingHm: string;
  /** (25) Projekt. */
  project: string;
  /** (26) Aufgabe. */
  task: string;
  /** (27) Beschreibung. */
  description: string;
  /** (28) interne Notiz (nur interne Variante). */
  internalNote: string | null;
  /** (29) Tags. */
  tags: string[];
  /** (30) abrechenbar j/n. */
  billable: boolean;
  /** (31) Stundensatz (formatiert) oder null. */
  rate: string | null;
  /** (32) Betrag (formatiert) oder null. */
  amount: string | null;
  /** (33) Nachtrag j/n (source = manual_backdated). */
  backdated: boolean;
  /** (34) Nachtragsgrund. */
  backdateReason: string | null;
  /** (35) Compliance-Hinweise dieser Zeile/dieses Tages. */
  compliance: string[];
}

/** Summenblock (Inhalte 12–17). */
export interface TimesheetTotals {
  /** (12) tatsächliche Gesamtarbeitszeit "HH:MM" (brutto). */
  actualHm: string;
  /** (13) Pausenzeit "HH:MM". */
  breakHm: string;
  /** (14) Nettoarbeitszeit "HH:MM". */
  netHm: string;
  /** (15) gerundete Abrechnungszeit "HH:MM". */
  billingHm: string;
  /** (16) abrechenbarer Betrag (formatiert) oder null. */
  amount: string | null;
  /** (17) nicht abrechenbare Zeit "HH:MM". */
  nonBillableHm: string;
}

/** Vollständige Eingabe für den Arbeitszeit-Nachweis. */
export interface TimesheetData {
  /** (1) Titel. */
  title: string;
  /** (2) Logo als data:-URL (optional). */
  logoDataUrl?: string | null;
  /** (3) Name des Nutzers. */
  userName: string;
  /** (4) Unternehmen (optional). */
  company?: string | null;
  /** (5) Kunde. */
  customer?: string | null;
  /** (6) Projekt. */
  project?: string | null;
  /** (7) Zeitraum. */
  periodLabel: string;
  /** (8) Erstellungsdatum. */
  createdAt: string;
  /** (9) eindeutige Exportnummer. */
  exportNumber: string;
  /** (10) Zeitzone (IANA). */
  timezone: string;
  /** (11) Filterkriterien. */
  filterSummary: string;
  totals: TimesheetTotals;
  rows: TimesheetRow[];
  /** Variante steuert Sichtbarkeit (doc 10 §6.3). */
  showInternalNotes: boolean;
  showAmounts: boolean;
  showCompliance: boolean;
  /** (35) aggregierte Compliance-Hinweise (Tages-/Ruhezeitebene, via evaluateDay). */
  complianceNotes?: string[];
  /** (37) Prüfsumme (optional). */
  checksum?: string | null;
  /** (38) Unterschriftsfeld (optional). */
  signature?: boolean;
}

const ACCENT = "#1f6feb";
const MUTED = "#6b7280";
const BORDER = "#d0d7de";

/** Kopf-/Meta-Zeile "Label: Wert". */
function metaRow(label: string, value: string): Content {
  return {
    columns: [
      { width: 120, text: label, color: MUTED, fontSize: 8 },
      { width: "*", text: value, fontSize: 8 },
    ],
    margin: [0, 1, 0, 1],
  };
}

/** Summen-Kachel. */
function totalCell(label: string, value: string): Content {
  return {
    stack: [
      { text: label, fontSize: 7, color: MUTED },
      { text: value, fontSize: 11, bold: true, margin: [0, 2, 0, 0] },
    ],
  };
}

/**
 * Baut die Dokumentdefinition des Arbeitszeitnachweises (doc 10 §6.2/§6.3).
 * Spalten und Blöcke werden je Variante ein-/ausgeblendet (interne Notiz,
 * Beträge, Compliance).
 */
export function buildTimesheetDocDefinition(data: TimesheetData): TDocumentDefinitions {
  const showAmounts = data.showAmounts;
  const showNotes = data.showInternalNotes;
  const showCompliance = data.showCompliance;

  // (1) Titel + (2) Logo Kopfzeile.
  const headerColumns: Column[] = [
    {
      width: "*",
      stack: [
        { text: data.title, fontSize: 16, bold: true, color: ACCENT },
        { text: data.userName, fontSize: 9, margin: [0, 2, 0, 0] },
        ...(data.company ? [{ text: data.company, fontSize: 8, color: MUTED } as Content] : []),
      ],
    },
  ];
  if (data.logoDataUrl) {
    headerColumns.push({ width: 90, image: data.logoDataUrl, fit: [90, 40], alignment: "right" });
  }

  // Meta-Block (Inhalte 5–11).
  const meta: Content[] = [
    ...(data.customer ? [metaRow("Kunde", data.customer)] : []),
    ...(data.project ? [metaRow("Projekt", data.project)] : []),
    metaRow("Zeitraum", data.periodLabel),
    metaRow("Erstellt am", data.createdAt),
    metaRow("Exportnummer", data.exportNumber),
    metaRow("Zeitzone", data.timezone),
    metaRow("Filter", data.filterSummary),
  ];

  // Summenblock (Inhalte 12–17).
  const totalsRow: Content[] = [
    totalCell("Tatsächlich (brutto)", data.totals.actualHm),
    totalCell("Pausen", data.totals.breakHm),
    totalCell("Netto (tatsächlich)", data.totals.netHm),
    totalCell("Abrechnung (gerundet)", data.totals.billingHm),
    totalCell("Nicht abrechenbar", data.totals.nonBillableHm),
  ];
  if (showAmounts && data.totals.amount) {
    totalsRow.push(totalCell("Betrag", data.totals.amount));
  }

  // Tabellen-Kopf (Inhalte 19–35, variantenabhängig).
  const head: Content[] = [
    { text: "Datum", style: "th" },
    { text: "Start", style: "th" },
    { text: "Ende", style: "th" },
    { text: "Pause", style: "th" },
    { text: "Netto", style: "th" },
    { text: "Abr.", style: "th" },
    { text: "Projekt / Aufgabe", style: "th" },
    { text: "Beschreibung", style: "th" },
    { text: "Abr.?", style: "th" },
  ];
  if (showAmounts) {
    head.push({ text: "Satz", style: "th" });
    head.push({ text: "Betrag", style: "th" });
  }

  const widths: (string | number)[] = [46, 28, 28, 30, 30, 30, "*", "*", 26];
  if (showAmounts) widths.push(44, 48);

  const body: Content[][] = [head];
  for (const r of data.rows) {
    // Projekt/Aufgabe + optionale interne Notiz + Nachtrag-Markierung.
    const projTaskStack: Content[] = [
      { text: r.project || "—", fontSize: 7 },
      { text: r.task || "", fontSize: 6, color: MUTED },
    ];
    if (r.backdated) {
      projTaskStack.push({
        text: `Nachtrag${r.backdateReason ? `: ${r.backdateReason}` : ""}`,
        fontSize: 6,
        color: "#b45309",
        italics: true,
      });
    }
    if (r.tags.length > 0) {
      projTaskStack.push({ text: r.tags.join(", "), fontSize: 6, color: ACCENT });
    }

    const descStack: Content[] = [{ text: r.description || "—", fontSize: 7 }];
    if (showNotes && r.internalNote) {
      descStack.push({ text: `Intern: ${r.internalNote}`, fontSize: 6, color: MUTED, italics: true });
    }
    if (showCompliance && r.compliance.length > 0) {
      descStack.push({ text: r.compliance.join(" · "), fontSize: 6, color: "#b91c1c" });
    }

    const row: Content[] = [
      { text: r.date, style: "td" },
      { text: r.start, style: "td" },
      { text: r.end, style: "td" },
      { text: r.breakHm, style: "td" },
      { text: r.netHm, style: "td" },
      { text: r.billingHm, style: "td", bold: true },
      { stack: projTaskStack },
      { stack: descStack },
      { text: r.billable ? "ja" : "nein", style: "td" },
    ];
    if (showAmounts) {
      row.push({ text: r.rate ?? "—", style: "td" });
      row.push({ text: r.amount ?? "—", style: "td" });
    }
    body.push(row);
  }

  const content: Content[] = [
    { columns: headerColumns },
    { canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 1, lineColor: ACCENT }], margin: [0, 4, 0, 8] },
    { columns: [{ width: "*", stack: meta }] },
    { text: "Zusammenfassung", style: "section", margin: [0, 12, 0, 4] },
    { columns: totalsRow, columnGap: 8 },
    { text: "Einträge", style: "section", margin: [0, 14, 0, 4] },
    {
      table: { headerRows: 1, widths, body },
      layout: {
        hLineWidth: (i: number) => (i === 0 || i === 1 ? 0.8 : 0.4),
        vLineWidth: () => 0,
        hLineColor: () => BORDER,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
    },
  ];

  // (35) aggregierte Compliance-Hinweise unter der Tabelle.
  if (showCompliance && data.complianceNotes && data.complianceNotes.length > 0) {
    content.push({ text: "Compliance-Hinweise", style: "section", margin: [0, 14, 0, 4] });
    content.push({
      ul: data.complianceNotes,
      fontSize: 8,
      color: "#b91c1c",
    });
  }

  // (37) Prüfsumme + (38) Unterschriftsfeld.
  if (data.checksum) {
    content.push({ text: `Prüfsumme (SHA-256): ${data.checksum}`, fontSize: 7, color: MUTED, margin: [0, 16, 0, 0] });
  }
  if (data.signature) {
    content.push({
      stack: [
        { text: " ", margin: [0, 24, 0, 0] },
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: BORDER }] },
        { text: "Ort, Datum, Unterschrift", fontSize: 7, color: MUTED, margin: [0, 2, 0, 0] },
      ],
      margin: [0, 20, 0, 0],
    });
  }

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 48],
    defaultStyle: { font: "Roboto", fontSize: 8, color: "#111827" },
    styles: {
      section: { fontSize: 11, bold: true, color: "#111827" },
      th: { fontSize: 7, bold: true, color: MUTED },
      td: { fontSize: 7 },
    },
    // (36) Seitenzahlen.
    footer: (currentPage: number, pageCount: number): Content => ({
      columns: [
        { text: data.exportNumber, fontSize: 7, color: MUTED, margin: [40, 0, 0, 0] },
        { text: `Seite ${currentPage} / ${pageCount}`, alignment: "right", fontSize: 7, color: MUTED, margin: [0, 0, 40, 0] },
      ],
      margin: [0, 12, 0, 0],
    }),
    content,
  };
}
