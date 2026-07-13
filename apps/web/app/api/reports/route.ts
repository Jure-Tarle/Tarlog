/**
 * app/api/reports — Report-Katalog als JSON (doc 10 §7). Ein Endpunkt, per
 * `type` gesteuert: day | week | month | project | customer. Grundsatz:
 * tatsächliche Zeit (`actual`/`net`) und gerundete Abrechnungszeit (`billing`)
 * werden IMMER getrennt ausgewiesen (doc 07, doc 10 §4).
 *
 * Query: type (Pflicht), from,to (epoch-ms; Pflicht für day/week/month),
 * project_id (Pflicht für project), customer_id (Pflicht für customer), tz?.
 */
import { apiError, json, requireAuth } from "@/lib/api";
import { pool } from "@/lib/db";
import { computeBudgetUsage } from "@tarlog/core";
import { computeDayCompliance, loadTimesheetEntries, type TimesheetEntry } from "../exports/_shared.js";
import { formatLocalDate } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = ["day", "week", "month", "project", "customer"] as const;
type ReportType = (typeof TYPES)[number];

/** Getrennte Ist-/Abrechnungs-Kennzahlen eines Aggregats. */
interface Summary {
  entry_count: number;
  actual_seconds: number;
  net_seconds: number;
  break_seconds: number;
  billing_seconds: number;
  billable_billing_seconds: number;
  non_billable_net_seconds: number;
  billing_amount_cents: number;
}

function emptySummary(): Summary {
  return {
    entry_count: 0,
    actual_seconds: 0,
    net_seconds: 0,
    break_seconds: 0,
    billing_seconds: 0,
    billable_billing_seconds: 0,
    non_billable_net_seconds: 0,
    billing_amount_cents: 0,
  };
}

function addEntry(s: Summary, e: TimesheetEntry): void {
  s.entry_count += 1;
  s.actual_seconds += e.actual_seconds;
  s.net_seconds += e.net_seconds;
  s.break_seconds += e.break_seconds;
  s.billing_seconds += e.billing_seconds;
  if (e.billable) {
    s.billable_billing_seconds += e.billing_seconds;
    s.billing_amount_cents += e.billing_amount_cents ?? 0;
  } else {
    s.non_billable_net_seconds += e.net_seconds;
  }
}

function summarize(entries: TimesheetEntry[]): Summary {
  const s = emptySummary();
  for (const e of entries) addEntry(s, e);
  return s;
}

/** Aggregiert Einträge in benannte Buckets (Reihenfolge stabil). */
function bucketBy(entries: TimesheetEntry[], keyOf: (e: TimesheetEntry) => string): { key: string; summary: Summary }[] {
  const map = new Map<string, Summary>();
  for (const e of entries) {
    const k = keyOf(e);
    const s = map.get(k) ?? emptySummary();
    addEntry(s, e);
    map.set(k, s);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, summary]) => ({ key, summary }));
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const sp = req.nextUrl.searchParams;
  const typeRaw = sp.get("type");
  if (!typeRaw || !(TYPES as readonly string[]).includes(typeRaw)) {
    return apiError("validation_error", `type muss einer von ${TYPES.join(", ")} sein.`);
  }
  const type = typeRaw as ReportType;

  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw != null && Number.isFinite(Number(fromRaw)) ? Number(fromRaw) : undefined;
  const to = toRaw != null && Number.isFinite(Number(toRaw)) ? Number(toRaw) : undefined;
  const project_id = sp.get("project_id") ?? undefined;
  const customer_id = sp.get("customer_id") ?? undefined;

  if ((type === "day" || type === "week" || type === "month") && (from == null || to == null)) {
    return apiError("validation_error", "from und to (epoch-ms) sind für day/week/month erforderlich.");
  }
  if (type === "project" && !project_id) return apiError("validation_error", "project_id ist erforderlich.");
  if (type === "customer" && !customer_id) return apiError("validation_error", "customer_id ist erforderlich.");

  const entries = await loadTimesheetEntries(auth.main_account_id, { from, to, project_id, customer_id });
  const totals = summarize(entries);
  const currency = entries.find((e) => e.currency)?.currency ?? "EUR";
  const tz = sp.get("tz") ?? entries[0]?.timezone ?? "Europe/Berlin";

  const body: Record<string, unknown> = {
    type,
    range: from != null && to != null ? { from, to } : null,
    filters: { project_id: project_id ?? null, customer_id: customer_id ?? null },
    currency,
    totals,
  };

  if (type === "day" || type === "week" || type === "month") {
    body.buckets = bucketBy(entries, (e) => formatLocalDate(e.actual_started_at, e.timezone));
    const compliance = await computeDayCompliance(entries);
    body.compliance = compliance.all;
  } else if (type === "customer") {
    body.buckets = bucketBy(entries, (e) => e.project ?? "Ohne Projekt");
  } else if (type === "project") {
    body.buckets = bucketBy(entries, (e) => e.task ?? "Ohne Aufgabe");
    body.budget = await projectBudget(auth.main_account_id, project_id!, totals);
  }

  return json(body);
});

/** Budget-Auslastung eines Projekts (doc 07 fn 14, doc 10 §7 Report 10). */
async function projectBudget(
  mainAccountId: string,
  projectId: string,
  totals: Summary,
): Promise<Record<string, unknown> | null> {
  const res = await pool.query(
    `SELECT budget_hours, budget_money_cents, warn_thresholds
       FROM budgets WHERE project_id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [projectId, mainAccountId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const budgetSeconds = r.budget_hours != null ? Math.round(Number(r.budget_hours) * 3600) : undefined;
  const budgetCents = r.budget_money_cents != null ? Number(r.budget_money_cents) : undefined;
  const thresholds = Array.isArray(r.warn_thresholds) ? (r.warn_thresholds as number[]) : [0.8, 1.0];

  const usage = computeBudgetUsage(totals.billable_billing_seconds, totals.billing_amount_cents, {
    budget_seconds: budgetSeconds,
    budget_cents: budgetCents,
    warn_thresholds: thresholds,
  });
  return {
    budget_seconds: budgetSeconds ?? null,
    budget_cents: budgetCents ?? null,
    used_seconds: totals.billable_billing_seconds,
    used_cents: totals.billing_amount_cents,
    seconds_ratio: usage.seconds_ratio,
    cents_ratio: usage.cents_ratio,
    crossed_thresholds: usage.crossed_thresholds,
  };
}
