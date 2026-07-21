import type { TDocumentDefinitions } from "pdfmake/interfaces";
import type { ProjectRow } from "./projects";
import type { CustomerRow } from "./customers";
import type { TimeEntry } from "./repositories";
import { fmtClock, fmtDate, fmtHM, fmtMoney } from "./format";
import { getLocale, t } from "../i18n";

type Input = { project: ProjectRow; customer: CustomerRow | null; entries: TimeEntry[]; timezone: string };

export function buildProjectTimesheetDefinition({ project, customer, entries, timezone }: Input): TDocumentDefinitions {
  const net = entries.reduce((sum, row) => sum + (row.net_work_duration_seconds ?? 0), 0);
  const billing = entries.reduce((sum, row) => sum + (row.is_billable ? row.billing_duration_seconds ?? 0 : 0), 0);
  const address = customer ? [[customer.street, customer.house_number].filter(Boolean).join(" "), [customer.postal_code, customer.city].filter(Boolean).join(" "), customer.country].filter(Boolean).join(", ") : "";
  return {
    pageSize: "A4", pageMargins: [42, 46, 42, 46], defaultStyle: { fontSize: 9, color: "#1d1d1f" },
    content: [
      { text: t("TARLOG | PROJEKTNACHWEIS"), color: "#0a84ff", bold: true, characterSpacing: 1.1, fontSize: 9 },
      { text: project.name, bold: true, fontSize: 24, margin: [0, 7, 0, 3] },
      { text: [project.project_code && t("Projekt {code}", { code: project.project_code }), customer?.name, customer?.company, address].filter(Boolean).join(" | "), color: "#6e6e73", margin: [0, 0, 0, 20] },
      { columns: [{ text: [{ text: `${t("Arbeitszeit")}\n`, color: "#6e6e73" }, { text: fmtHM(net), bold: true, fontSize: 17 }] }, { text: [{ text: `${t("Abrechnung")}\n`, color: "#6e6e73" }, { text: fmtHM(billing), bold: true, fontSize: 17 }] }, { text: [{ text: `${t("Einträge")}\n`, color: "#6e6e73" }, { text: String(entries.length), bold: true, fontSize: 17 }] }], margin: [0, 0, 0, 20] },
      { table: { headerRows: 1, widths: [62, 68, 54, "*"], body: [
        [t("Datum"), t("Zeitraum"), t("Dauer"), t("Tätigkeit")].map((text) => ({ text, bold: true, color: "#6e6e73", fillColor: "#f5f5f7" })),
        ...entries.map((entry) => [fmtDate(entry.actual_started_at, entry.timezone || timezone), `${fmtClock(entry.actual_started_at, entry.timezone || timezone)} - ${fmtClock(entry.actual_ended_at ?? entry.actual_started_at, entry.timezone || timezone)}`, fmtHM(entry.net_work_duration_seconds ?? 0), entry.description || t("Ohne Beschreibung")]),
      ] }, layout: "lightHorizontalLines" },
      { text: `${t("Erstellt am {date}", { date: new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium", timeStyle: "short" }).format(new Date()) })} | ${t("Projektwert {value}", { value: fmtMoney(project.fixed_fee_cents ?? 0) })}`, color: "#86868b", fontSize: 8, margin: [0, 18, 0, 0] },
    ],
    footer: (page, pages) => ({ text: t("Tarlog | Seite {page} von {pages}", { page: String(page), pages: String(pages) }), alignment: "center", color: "#86868b", fontSize: 8, margin: [0, 12, 0, 0] }),
  };
}

export async function renderProjectTimesheetPdf(input: Input): Promise<Uint8Array> {
  const mod = await import("pdfmake/build/pdfmake");
  const fonts = await import("pdfmake/build/vfs_fonts");
  const pdfMake = ((mod as unknown as { default?: any }).default ?? mod) as any;
  pdfMake.vfs = (fonts as unknown as { default?: Record<string, string> }).default ?? fonts;
  return new Promise((resolve, reject) => { try { pdfMake.createPdf(buildProjectTimesheetDefinition(input)).getBuffer((buffer: Uint8Array) => resolve(new Uint8Array(buffer))); } catch (error) { reject(error); } });
}
