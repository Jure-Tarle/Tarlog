/**
 * app/api/exports/timesheet, PDF-Arbeitszeitnachweis (doc 10 §6.2 alle 38
 * Inhalte, §6.3 die 7 Varianten). GET mit Query-Filtern:
 *   from,to (epoch-ms, Pflicht), project_id?, customer_id?, variant?, tz?,
 *   amounts=0|1, checksum=0|1, signature=0|1.
 * Tatsächliche Nettozeit und gerundete Abrechnungszeit werden getrennt geführt;
 * Compliance-Hinweise stammen aus evaluateDay (doc 08). Erzeugt einen Eintrag in
 * exports/export_files + Audit `export_created`/`pdf_generated`.
 */
import { apiError, requireAuth } from "@/lib/api";
import { pool } from "@/lib/db";
import {
  buildTimesheetDocDefinition,
  formatDurationHm,
  formatLocalClock,
  formatLocalDate,
  formatMoneyCents,
  renderPdf,
  type TimesheetRow,
} from "@/lib/pdf";
import { actorId, recordAudit } from "@/lib/invoice";
import {
  allocateExportNumber,
  computeDayCompliance,
  loadTimesheetEntries,
  recordExport,
  requiredEpoch,
  sha256Hex,
  type TimesheetEntry,
} from "../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Variant =
  | "internal_timesheet"
  | "customer_report"
  | "invoice_attachment"
  | "compliance_report"
  | "tax_advisor"
  | "daily_detail"
  | "monthly_summary";

/** Sichtbarkeits-Flags je Variante (doc 10 §6.3). */
const VARIANT_FLAGS: Record<Variant, { internal: boolean; amounts: boolean; compliance: boolean; title: string }> = {
  internal_timesheet: { internal: true, amounts: true, compliance: true, title: "Interner Arbeitszeitnachweis" },
  customer_report: { internal: false, amounts: false, compliance: false, title: "Arbeitszeitnachweis" },
  invoice_attachment: { internal: false, amounts: true, compliance: false, title: "Leistungsnachweis (Rechnungsanlage)" },
  compliance_report: { internal: false, amounts: false, compliance: true, title: "Compliance-Report" },
  tax_advisor: { internal: false, amounts: true, compliance: false, title: "Arbeitszeitnachweis (Steuerberater)" },
  daily_detail: { internal: true, amounts: true, compliance: true, title: "Detaillierter Tagesbericht" },
  monthly_summary: { internal: false, amounts: true, compliance: true, title: "Monatsbericht" },
};

async function accountTimezone(mainAccountId: string): Promise<string> {
  const res = await pool.query(`SELECT default_timezone FROM main_accounts WHERE id = $1 LIMIT 1`, [mainAccountId]);
  return (res.rows[0]?.default_timezone as string) ?? "Europe/Berlin";
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const sp = req.nextUrl.searchParams;
  let from: number;
  let to: number;
  try {
    from = requiredEpoch(sp, "from");
    to = requiredEpoch(sp, "to");
  } catch (err) {
    return apiError("validation_error", err instanceof Error ? err.message.replace(/^INVALID:/, "") : "Ungültiger Zeitraum.");
  }

  const variantRaw = sp.get("variant") as Variant | null;
  const variant: Variant = variantRaw && variantRaw in VARIANT_FLAGS ? variantRaw : "internal_timesheet";
  const flags = VARIANT_FLAGS[variant];
  const showAmounts = sp.get("amounts") != null ? sp.get("amounts") === "1" : flags.amounts;
  const project_id = sp.get("project_id") ?? undefined;
  const customer_id = sp.get("customer_id") ?? undefined;
  const tz = sp.get("tz") ?? (await accountTimezone(auth.main_account_id));

  const entries = await loadTimesheetEntries(auth.main_account_id, { from, to, project_id, customer_id });
  const compliance = flags.compliance
    ? await computeDayCompliance(entries)
    : { perDay: new Map<string, string[]>(), all: [] as string[] };

  const currency = entries.find((e) => e.currency)?.currency ?? "EUR";

  // Zeilen aufbereiten.
  const rows: TimesheetRow[] = entries.map((e: TimesheetEntry) => {
    const day = formatLocalDate(e.actual_started_at, e.timezone);
    return {
      date: day,
      start: formatLocalClock(e.actual_started_at, e.timezone),
      end: e.actual_ended_at != null ? formatLocalClock(e.actual_ended_at, e.timezone) : ",",
      breakHm: formatDurationHm(e.break_seconds),
      netHm: formatDurationHm(e.net_seconds),
      billingHm: formatDurationHm(e.billing_seconds),
      project: e.project ?? ",",
      task: e.task ?? "",
      description: e.description ?? "",
      internalNote: e.internal_note,
      tags: e.tags,
      billable: e.billable,
      rate: showAmounts && e.rate_cents != null ? formatMoneyCents(e.rate_cents, e.currency ?? currency) + "/h" : null,
      amount: showAmounts && e.billing_amount_cents != null ? formatMoneyCents(e.billing_amount_cents, e.currency ?? currency) : null,
      backdated: e.is_backdated || e.source === "manual_backdated",
      backdateReason: e.backdate_reason,
      compliance: flags.compliance ? (compliance.perDay.get(day) ?? []) : [],
    };
  });

  // Summen (Inhalte 12,17): tatsächliche Nettozeit und gerundete Abrechnungszeit getrennt.
  const actualSum = entries.reduce((s, e) => s + e.actual_seconds, 0);
  const breakSum = entries.reduce((s, e) => s + e.break_seconds, 0);
  const netSum = entries.reduce((s, e) => s + e.net_seconds, 0);
  const billingSum = entries.reduce((s, e) => s + e.billing_seconds, 0);
  const nonBillableSum = entries.filter((e) => !e.billable).reduce((s, e) => s + e.net_seconds, 0);
  const amountSum = entries
    .filter((e) => e.billable && e.billing_amount_cents != null)
    .reduce((s, e) => s + (e.billing_amount_cents ?? 0), 0);

  const periodLabel = `${formatLocalDate(from, tz)}, ${formatLocalDate(to - 1, tz)}`;
  const filterParts = [
    project_id ? `Projekt=${project_id}` : null,
    customer_id ? `Kunde=${customer_id}` : null,
    `Variante=${variant}`,
  ].filter(Boolean);

  // Exportnummer vorab vergeben (erscheint im PDF-Kopf, Inhalt 9).
  const exportNumber = await allocateExportNumber(auth.main_account_id);

  const wantChecksum = sp.get("checksum") === "1";
  const wantSignature = sp.get("signature") === "1";

  // Daten-Prüfsumme (deterministisch über die Einträge), nicht der PDF-Byte-Hash,
  // da ein PDF seinen eigenen Byte-Hash nicht enthalten kann.
  const dataChecksum = wantChecksum
    ? sha256Hex(
        JSON.stringify(
          entries.map((e) => ({
            id: e.id,
            s: e.actual_started_at,
            e: e.actual_ended_at,
            n: e.net_seconds,
            b: e.billing_seconds,
            a: e.billing_amount_cents,
          })),
        ),
      )
    : null;

  const docDefinition = buildTimesheetDocDefinition({
    title: flags.title,
    userName: auth.user_id ?? auth.main_account_id,
    customer: customer_id ?? null,
    project: project_id ?? null,
    periodLabel,
    createdAt: formatLocalDate(Date.now(), tz),
    exportNumber,
    timezone: tz,
    filterSummary: filterParts.join(", ") || "keine",
    totals: {
      actualHm: formatDurationHm(actualSum),
      breakHm: formatDurationHm(breakSum),
      netHm: formatDurationHm(netSum),
      billingHm: formatDurationHm(billingSum),
      amount: showAmounts ? formatMoneyCents(amountSum, currency) : null,
      nonBillableHm: formatDurationHm(nonBillableSum),
    },
    rows,
    showInternalNotes: flags.internal,
    showAmounts,
    showCompliance: flags.compliance,
    complianceNotes: flags.compliance ? compliance.all : [],
    checksum: dataChecksum,
    signature: wantSignature,
  });

  const pdf = await renderPdf(docDefinition);
  const fileChecksum = sha256Hex(pdf);

  await recordExport({
    mainAccountId: auth.main_account_id,
    actor: actorId(auth),
    device_id: auth.device_id ?? null,
    export_number: exportNumber,
    format: "pdf",
    variant,
    filter: { from, to, project_id: project_id ?? null, customer_id: customer_id ?? null, variant },
    period_start: formatLocalDate(from, tz),
    period_end: formatLocalDate(to - 1, tz),
    timezone: tz,
    filename: `${exportNumber}.pdf`,
    mime_type: "application/pdf",
    size_bytes: pdf.length,
    checksum: fileChecksum,
  });

  await recordAudit(pool, {
    main_account_id: auth.main_account_id,
    actor_id: actorId(auth),
    device_id: auth.device_id ?? null,
    entity_type: "exports",
    entity_id: exportNumber,
    action: "pdf_generated",
    after: { document: "timesheet", variant, export_number: exportNumber },
    source: "api",
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${exportNumber}.pdf"`,
      "cache-control": "no-store",
    },
  });
});
