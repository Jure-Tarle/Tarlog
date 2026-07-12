/**
 * app/api/exports/csv — CSV-Export der Zeiteinträge (doc 10 §6.1, doc 12
 * Testfall 24: Spalten vollständig, korrekt escaped, UTF-8, verlustfrei
 * re-importierbar). GET mit from,to (epoch-ms), project_id?, customer_id?.
 * Rohzeiten als epoch-ms (verlustfrei), Beträge als Integer-Cents.
 */
import { apiError, requireAuth } from "@/lib/api";
import { actorId } from "@/lib/invoice";
import {
  allocateExportNumber,
  loadTimesheetEntries,
  recordExport,
  requiredEpoch,
  sha256Hex,
  type TimesheetEntry,
} from "../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS = [
  "id",
  "timezone",
  "actual_started_at",
  "actual_ended_at",
  "project",
  "task",
  "description",
  "internal_note",
  "tags",
  "billable",
  "actual_seconds",
  "break_seconds",
  "net_seconds",
  "billing_seconds",
  "rate_cents",
  "currency",
  "billing_amount_cents",
  "source",
  "is_backdated",
  "backdate_reason",
] as const;

/** RFC-4180-Escaping: Feld quoten, wenn Trenner/Quote/Zeilenumbruch enthalten. */
function csvField(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toRow(e: TimesheetEntry): string {
  const cells: unknown[] = [
    e.id,
    e.timezone,
    e.actual_started_at,
    e.actual_ended_at,
    e.project,
    e.task,
    e.description,
    e.internal_note,
    e.tags.join("|"),
    e.billable,
    e.actual_seconds,
    e.break_seconds,
    e.net_seconds,
    e.billing_seconds,
    e.rate_cents,
    e.currency,
    e.billing_amount_cents,
    e.source,
    e.is_backdated,
    e.backdate_reason,
  ];
  return cells.map(csvField).join(",");
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
  const project_id = sp.get("project_id") ?? undefined;
  const customer_id = sp.get("customer_id") ?? undefined;

  const entries = await loadTimesheetEntries(auth.main_account_id, { from, to, project_id, customer_id });

  // UTF-8-BOM für Tabellenkalkulationen (Excel).
  const lines = [COLUMNS.join(","), ...entries.map(toRow)];
  const csv = `﻿${lines.join("\r\n")}\r\n`;
  const checksum = sha256Hex(csv);

  const exportNumber = await allocateExportNumber(auth.main_account_id);
  await recordExport({
    mainAccountId: auth.main_account_id,
    actor: actorId(auth),
    device_id: auth.device_id ?? null,
    export_number: exportNumber,
    format: "csv",
    variant: null,
    filter: { from, to, project_id: project_id ?? null, customer_id: customer_id ?? null },
    timezone: entries[0]?.timezone ?? "Europe/Berlin",
    filename: `${exportNumber}.csv`,
    mime_type: "text/csv; charset=utf-8",
    size_bytes: Buffer.byteLength(csv, "utf8"),
    checksum,
  });

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportNumber}.csv"`,
      "cache-control": "no-store",
    },
  });
});
