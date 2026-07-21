/**
 * app/api/exports/_shared.ts, gemeinsame Datenbeschaffung für Exporte
 * (kein Route-Handler). Lädt Zeiteinträge eines Zeitraums (scoped) inkl.
 * Projekt-/Aufgaben-Namen + Tags und aggregiert tageweise die
 * Compliance-Hinweise über die Core-Engine (evaluateDay/evaluateRestPeriod,
 * doc 08; doc 10 §6.2 Inhalt 35).
 */
import { createHash } from "node:crypto";
import { uuidv7 } from "uuidv7";
import { pool } from "@/lib/db";
import {
  evaluateDay,
  evaluateRestPeriod,
  GERMAN_PROFILE,
  type DayEntrySummary,
} from "@tarlog/core";
import { formatLocalDate } from "@/lib/pdf";
import { allocateNumber, formatExportNumber, recordAudit, sequenceKey } from "@/lib/invoice";

/** Ein Zeiteintrag für Nachweis/CSV, BIGINT bereits zu Number koerciert. */
export interface TimesheetEntry {
  id: string;
  project: string | null;
  task: string | null;
  description: string | null;
  internal_note: string | null;
  tags: string[];
  billable: boolean;
  timezone: string;
  actual_started_at: number;
  actual_ended_at: number | null;
  actual_seconds: number;
  break_seconds: number;
  net_seconds: number;
  billing_seconds: number;
  rate_cents: number | null;
  currency: string | null;
  billing_amount_cents: number | null;
  source: string;
  is_backdated: boolean;
  backdate_reason: string | null;
}

/** Auswahl-Filter für Nachweis/CSV. */
export interface ExportSelector {
  from?: number;
  to?: number;
  project_id?: string;
  customer_id?: string;
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Lädt alle abgeschlossenen Einträge des Bereichs (billable + non-billable). */
export async function loadTimesheetEntries(
  mainAccountId: string,
  sel: ExportSelector,
): Promise<TimesheetEntry[]> {
  const where = ["te.main_account_id = $1", "te.deleted_at IS NULL"];
  const params: unknown[] = [mainAccountId];
  if (typeof sel.from === "number") {
    params.push(sel.from);
    where.push(`te.actual_started_at >= $${params.length}`);
  }
  if (typeof sel.to === "number") {
    params.push(sel.to);
    where.push(`te.actual_started_at < $${params.length}`);
  }
  if (sel.project_id) {
    params.push(sel.project_id);
    where.push(`te.project_id = $${params.length}`);
  }
  if (sel.customer_id) {
    params.push(sel.customer_id);
    where.push(`(te.customer_id = $${params.length} OR p.customer_id = $${params.length})`);
  }

  const res = await pool.query(
    `SELECT te.id, te.description, te.internal_note, te.is_billable, te.timezone,
            te.actual_started_at, te.actual_ended_at, te.actual_duration_seconds,
            te.break_duration_seconds, te.net_work_duration_seconds, te.billing_duration_seconds,
            te.rate_snapshot, te.billing_amount_snapshot, te.source, te.is_backdated, te.backdate_reason,
            p.name AS project_name, t.name AS task_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       LEFT JOIN tasks t ON t.id = te.task_id
      WHERE ${where.join(" AND ")}
      ORDER BY te.actual_started_at ASC`,
    params,
  );

  const ids = res.rows.map((r) => r.id as string);
  const tagsById = await loadTags(ids);

  return res.rows.map((r): TimesheetEntry => {
    const snap = r.rate_snapshot as { amount_cents?: unknown; currency?: unknown } | null;
    return {
      id: r.id,
      project: r.project_name,
      task: r.task_name,
      description: r.description,
      internal_note: r.internal_note,
      tags: tagsById.get(r.id as string) ?? [],
      billable: r.is_billable === true,
      timezone: r.timezone,
      actual_started_at: num(r.actual_started_at),
      actual_ended_at: numOrNull(r.actual_ended_at),
      actual_seconds: num(r.actual_duration_seconds),
      break_seconds: num(r.break_duration_seconds),
      net_seconds: num(r.net_work_duration_seconds),
      billing_seconds: num(r.billing_duration_seconds),
      rate_cents: snap && snap.amount_cents != null ? Number(snap.amount_cents) : null,
      currency: snap && snap.currency != null ? String(snap.currency) : null,
      billing_amount_cents: numOrNull(r.billing_amount_snapshot),
      source: r.source,
      is_backdated: r.is_backdated === true,
      backdate_reason: r.backdate_reason,
    };
  });
}

async function loadTags(entryIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (entryIds.length === 0) return map;
  const res = await pool.query(
    `SELECT tet.time_entry_id AS eid, tg.name AS name
       FROM time_entry_tags tet JOIN tags tg ON tg.id = tet.tag_id
      WHERE tet.time_entry_id = ANY($1)`,
    [entryIds],
  );
  for (const r of res.rows) {
    const list = map.get(r.eid as string) ?? [];
    list.push(r.name as string);
    map.set(r.eid as string, list);
  }
  return map;
}

/** Einzelne Pausenblöcke je Eintrag (für die 15-Minuten-Regel R3). */
async function loadBreakBlocks(entryIds: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (entryIds.length === 0) return map;
  const res = await pool.query(
    `SELECT time_entry_id AS eid, duration_seconds AS ds
       FROM time_entry_breaks
      WHERE time_entry_id = ANY($1) AND deleted_at IS NULL AND counts_as_rest = true`,
    [entryIds],
  );
  for (const r of res.rows) {
    const list = map.get(r.eid as string) ?? [];
    list.push(Number(r.ds));
    map.set(r.eid as string, list);
  }
  return map;
}

/** True, wenn ein Eintrag das Nachtfenster 23:00,06:00 (lokal) berührt. */
function touchesNight(entry: TimesheetEntry): boolean {
  const startHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: entry.timezone, hour: "2-digit", hour12: false }).format(
      entry.actual_started_at,
    ),
  );
  const endAt = entry.actual_ended_at ?? entry.actual_started_at;
  const endHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: entry.timezone, hour: "2-digit", hour12: false }).format(endAt),
  );
  const isNight = (h: number): boolean => h >= 23 || h < 6;
  return isNight(startHour) || isNight(endHour);
}

/** Ergebnis der tageweisen Compliance-Auswertung. */
export interface DayCompliance {
  /** date → Hinweistexte (nicht-grün) dieses Tages. */
  perDay: Map<string, string[]>;
  /** flache, deduplizierte Liste aller Hinweise. */
  all: string[];
}

/**
 * Aggregiert die Einträge tageweise (lokale Kalendertage) und wertet sie gegen
 * das DE-Profil aus (Pausen/Tageshöchst/Nachtarbeit/Sonn-Feiertag). Zusätzlich
 * Ruhezeit zwischen aufeinanderfolgenden Tagen (evaluateRestPeriod).
 */
export async function computeDayCompliance(entries: TimesheetEntry[]): Promise<DayCompliance> {
  const perDay = new Map<string, string[]>();
  const all: string[] = [];
  if (entries.length === 0) return { perDay, all };

  const blocksById = await loadBreakBlocks(entries.map((e) => e.id));
  const holidays = new Set(
    ((GERMAN_PROFILE.rules_json.flags as { public_holidays?: string[] })?.public_holidays ?? []) as string[],
  );

  // Tages-Aggregate bilden.
  const byDay = new Map<
    string,
    { net: number; brk: number; blocks: number[]; first: number; last: number; night: boolean; tz: string }
  >();
  for (const e of entries) {
    const day = formatLocalDate(e.actual_started_at, e.timezone);
    const endAt = e.actual_ended_at ?? e.actual_started_at;
    const acc = byDay.get(day);
    const blocks = blocksById.get(e.id) ?? (e.break_seconds > 0 ? [e.break_seconds] : []);
    if (acc) {
      acc.net += e.net_seconds;
      acc.brk += e.break_seconds;
      acc.blocks.push(...blocks);
      acc.first = Math.min(acc.first, e.actual_started_at);
      acc.last = Math.max(acc.last, endAt);
      acc.night = acc.night || touchesNight(e);
    } else {
      byDay.set(day, {
        net: e.net_seconds,
        brk: e.break_seconds,
        blocks: [...blocks],
        first: e.actual_started_at,
        last: endAt,
        night: touchesNight(e),
        tz: e.timezone,
      });
    }
  }

  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const push = (date: string, msg: string): void => {
    const list = perDay.get(date) ?? [];
    list.push(msg);
    perDay.set(date, list);
    if (!all.includes(msg)) all.push(msg);
  };

  for (const [date, agg] of days) {
    const [y, m, d] = date.split("-").map((x) => Number(x));
    const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0 = Sonntag
    const summary: DayEntrySummary = {
      date,
      net_seconds: agg.net,
      break_seconds: agg.brk,
      break_blocks: agg.blocks,
      first_start_at: agg.first,
      last_end_at: agg.last,
      is_sunday: weekday === 0,
      is_holiday: holidays.has(date),
      has_night_work: agg.night,
    };
    for (const r of evaluateDay(summary, GERMAN_PROFILE)) {
      if (r.status !== "green") push(date, r.message);
    }
  }

  // Ruhezeit zwischen aufeinanderfolgenden Tagen.
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1]?.[1];
    const cur = days[i];
    if (!prev || !cur) continue;
    const rest = evaluateRestPeriod(prev.last, cur[1].first);
    if (rest && rest.status !== "green") push(cur[0], rest.message);
  }

  return { perDay, all };
}

/** SHA-256-Hex einer Export-Nutzlast (Prüfsumme, doc 10 §6.1 / doc 12 §1.1). */
export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Vergibt die nächste Exportnummer (EX-{JAHR}-{NNNN}) in eigener Transaktion.
 * Wird VOR dem Rendern aufgerufen, damit die Nummer im PDF-Kopf (Inhalt 9)
 * erscheint. Seltene Lücke möglich, falls das Rendern danach scheitert
 * (Exportnummern müssen nicht lückenlos sein, anders als Rechnungsnummern).
 */
export async function allocateExportNumber(mainAccountId: string): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const year = new Date().getUTCFullYear();
    const { number } = await allocateNumber(
      client,
      mainAccountId,
      sequenceKey("export", year),
      (seq) => formatExportNumber(year, seq),
    );
    await client.query("COMMIT");
    return number;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Metadaten eines erzeugten Exports (doc 10 §6.1: exports + export_files). */
export interface RecordExportInput {
  mainAccountId: string;
  actor: string;
  device_id?: string | null;
  /** Vorab via allocateExportNumber vergebene Nummer. */
  export_number: string;
  format: "pdf" | "csv" | "xlsx" | "json" | "zip";
  variant?:
    | "internal_timesheet"
    | "customer_report"
    | "invoice_attachment"
    | "compliance_report"
    | "tax_advisor"
    | "daily_detail"
    | "monthly_summary"
    | null;
  filter: Record<string, unknown>;
  period_start?: string | null;
  period_end?: string | null;
  timezone: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  checksum: string;
}

/**
 * Schreibt Export- + Datei-Metadaten transaktional (Nummer bereits vergeben)
 * und ein Audit-Event `export_created`. Die Datei selbst wird gestreamt
 * (storage_path = "inline:stream"). Liefert die Export-ID.
 */
export async function recordExport(input: RecordExportInput): Promise<{ export_id: string; export_number: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const number = input.export_number;
    const exportId = uuidv7();
    const now = Date.now();

    await client.query(
      `INSERT INTO exports
         (id, main_account_id, export_number, format, variant, filter_json, period_start, period_end,
          timezone, checksum, created_by_device, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12)`,
      [
        exportId,
        input.mainAccountId,
        number,
        input.format,
        input.variant ?? null,
        JSON.stringify(input.filter),
        input.period_start ?? null,
        input.period_end ?? null,
        input.timezone,
        input.checksum,
        input.device_id ?? null,
        now,
      ],
    );

    await client.query(
      `INSERT INTO export_files
         (id, main_account_id, export_id, filename, mime_type, storage_path, size_bytes, checksum_sha256, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [uuidv7(), input.mainAccountId, exportId, input.filename, input.mime_type, "inline:stream", input.size_bytes, input.checksum, now],
    );

    await recordAudit(client, {
      main_account_id: input.mainAccountId,
      actor_id: input.actor,
      device_id: input.device_id ?? null,
      entity_type: "exports",
      entity_id: exportId,
      action: "export_created",
      after: { export_number: number, format: input.format, variant: input.variant ?? null, filename: input.filename },
      source: "api",
    });

    await client.query("COMMIT");
    return { export_id: exportId, export_number: number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Domänentabellen für den Voll-Export (feste Liste, kein User-Input). */
const DUMP_TABLES = [
  "customers",
  "projects",
  "tasks",
  "tags",
  "time_entries",
  "time_entry_breaks",
  "time_entry_tags",
  "rounding_rules",
  "billing_rates",
  "day_rate_rules",
  "fixed_fee_contracts",
  "budgets",
  "invoices",
  "invoice_items",
  "invoice_time_entries",
  "exports",
  "export_files",
  "compliance_results",
  "attachments",
  "settings",
  "devices",
  "audit_logs",
] as const;

/**
 * Vollständiger, account-gescopeter Datenexport (doc 12 §1 Nr. 9 / doc 09
 * Art. 20). Geheimnisse (password_hash/token_hash/session_hash) werden NICHT
 * exportiert. Liefert ein je Tabelle geschlüsseltes Objekt.
 */
export async function dumpAccount(
  mainAccountId: string,
  opts: { includeAudit?: boolean } = {},
): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};

  // main_accounts nur mit unbedenklichen Feldern (kein password_hash).
  const acc = await pool.query(
    `SELECT id, display_name, mode, email, company_name, default_currency, default_locale,
            default_timezone, default_compliance_profile_id, created_at, updated_at
       FROM main_accounts WHERE id = $1`,
    [mainAccountId],
  );
  out.main_accounts = acc.rows;

  for (const table of DUMP_TABLES) {
    if (table === "audit_logs" && opts.includeAudit === false) continue;
    const res = await pool.query(`SELECT * FROM ${table} WHERE main_account_id = $1`, [mainAccountId]);
    out[table] = res.rows;
  }

  const cp = await pool.query(`SELECT * FROM compliance_profiles WHERE main_account_id = $1`, [mainAccountId]);
  out.compliance_profiles = cp.rows;

  return out;
}

/** Liest einen Pflicht-Zeitparameter (epoch-ms) aus der Query oder wirft. */
export function requiredEpoch(sp: URLSearchParams, key: string): number {
  const raw = sp.get(key);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`INVALID:Parameter "${key}" (epoch-ms) fehlt oder ist ungültig.`);
  return n;
}
