/**
 * lib/ui/queries.ts — serverseitige Lese-Helfer (Server Components).
 *
 * Lesen passiert „wo möglich" direkt gegen die Server-DB (doc 05 §2.1) statt
 * über HTTP — typsicher via Drizzle, kein Round-Trip, kein Frontend-State.
 * Alles ist auf `main_account_id` gescoped (getAuth, lib/api). Schreiben läuft
 * getrennt über die `/api/**`-Routen der anderen Module (lib/ui/api.ts).
 *
 * NUR aus Server-Components importieren (zieht `pg` über @/lib/db).
 */
import { redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getAuth } from "@/lib/api";

const DEFAULT_TZ = "Europe/Berlin";
const DEFAULT_CURRENCY = "EUR";
const DEFAULT_LOCALE = "de-DE";

export interface AccountCtx {
  id: string;
  timezone: string;
  currency: string;
  locale: string;
  displayName: string;
  companyName: string | null;
  complianceProfileId: string | null;
}

/**
 * Erzwingt eine gültige Session und liefert den Konto-Kontext (Zeitzone,
 * Währung). Ohne Auth → Redirect nach /login (Middleware-Absicherung, doc 09).
 * DB-Fehler werden zu /login degradiert statt in einen Crash zu laufen.
 */
export async function requireAccount(): Promise<AccountCtx> {
  let accountId: string | null = null;
  try {
    const auth = await getAuth();
    accountId = auth?.main_account_id ?? null;
  } catch {
    accountId = null;
  }
  if (!accountId) redirect("/login");

  try {
    const rows = await db
      .select({
        id: schema.mainAccounts.id,
        timezone: schema.mainAccounts.default_timezone,
        currency: schema.mainAccounts.default_currency,
        locale: schema.mainAccounts.default_locale,
        displayName: schema.mainAccounts.display_name,
        companyName: schema.mainAccounts.company_name,
        complianceProfileId: schema.mainAccounts.default_compliance_profile_id,
      })
      .from(schema.mainAccounts)
      .where(eq(schema.mainAccounts.id, accountId))
      .limit(1);
    const r = rows[0];
    if (r) {
      return {
        id: r.id,
        timezone: r.timezone || DEFAULT_TZ,
        currency: r.currency || DEFAULT_CURRENCY,
        locale: r.locale || DEFAULT_LOCALE,
        displayName: r.displayName,
        companyName: r.companyName,
        complianceProfileId: r.complianceProfileId,
      };
    }
  } catch {
    /* fällt auf Defaults zurück */
  }
  return {
    id: accountId,
    timezone: DEFAULT_TZ,
    currency: DEFAULT_CURRENCY,
    locale: DEFAULT_LOCALE,
    displayName: "Konto",
    companyName: null,
    complianceProfileId: null,
  };
}

// ---------------------------------------------------------------------------
// Zeitraum-Grenzen (lokaler Kalender in Konto-Zeitzone, DST-fest via Intl-Offset)
// ---------------------------------------------------------------------------

export interface Range {
  start: number;
  end: number;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Kalender-Datumsarithmetik auf „YYYY-MM-DD" (zeitzonenfrei, UTC-Kalender). */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Wall-Clock-Offset (ms) einer Zeitzone am Instant `at`: localAsUTC − at. */
function tzOffsetMs(at: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(at))) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const hour = map.hour === 24 ? 0 : (map.hour ?? 0);
  const asUTC = Date.UTC(
    map.year ?? 1970,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    hour,
    map.minute ?? 0,
    map.second ?? 0,
  );
  return asUTC - at;
}

/** epoch-ms der lokalen Mitternacht (00:00) eines Kalendertags in `tz` (DST-fest). */
function zonedMidnight(isoDate: string, tz: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const wantUTC = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  // Zwei Iterationen fangen DST-Übergänge robust ab.
  let epoch = wantUTC - tzOffsetMs(wantUTC, tz);
  epoch = wantUTC - tzOffsetMs(epoch, tz);
  return epoch;
}

/** Heutiges (bzw. `isoDate`) Kalenderdatum in `tz` als „YYYY-MM-DD". */
export function todayIso(tz: string, at: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

export function dayRange(tz: string, isoDate?: string): Range {
  const iso = isoDate ?? todayIso(tz);
  return { start: zonedMidnight(iso, tz), end: zonedMidnight(addDaysIso(iso, 1), tz) };
}

export function weekRange(tz: string, isoDate?: string): Range {
  const iso = isoDate ?? todayIso(tz);
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay(); // 0=So
  const mondayOffset = (dow + 6) % 7;
  const startIso = addDaysIso(iso, -mondayOffset);
  return { start: zonedMidnight(startIso, tz), end: zonedMidnight(addDaysIso(startIso, 7), tz) };
}

export function monthRange(tz: string, isoDate?: string): Range {
  const iso = isoDate ?? todayIso(tz);
  const [y, m] = iso.split("-").map(Number);
  const startIso = `${y}-${pad2(m ?? 1)}-01`;
  const nextMonth = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + 1, 1));
  const endIso = `${nextMonth.getUTCFullYear()}-${pad2(nextMonth.getUTCMonth() + 1)}-01`;
  return { start: zonedMidnight(startIso, tz), end: zonedMidnight(endIso, tz) };
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export interface TimerRow {
  timer_id: string;
  status: string;
  project_id: string | null;
  task_id: string | null;
  current_time_entry_id: string | null;
  started_at: number | null;
  paused_at: number | null;
  accumulated_pause_seconds: number;
  active_pause_started_at: number | null;
  description_required: boolean | null;
  billing_status: string | null;
  projectName: string | null;
  taskName: string | null;
}

/** Aktueller Timer-Zustand des Kontos (aktiver zuerst). */
export async function getTimer(accountId: string): Promise<TimerRow | null> {
  const rows = await db
    .select({
      timer_id: schema.timerStates.timer_id,
      status: schema.timerStates.status,
      project_id: schema.timerStates.project_id,
      task_id: schema.timerStates.task_id,
      current_time_entry_id: schema.timerStates.current_time_entry_id,
      started_at: schema.timerStates.started_at,
      paused_at: schema.timerStates.paused_at,
      accumulated_pause_seconds: schema.timerStates.accumulated_pause_seconds,
      active_pause_started_at: schema.timerStates.active_pause_started_at,
      description_required: schema.timerStates.description_required,
      billing_status: schema.timerStates.billing_status,
      projectName: schema.projects.name,
      taskName: schema.tasks.name,
    })
    .from(schema.timerStates)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.timerStates.project_id))
    .leftJoin(schema.tasks, eq(schema.tasks.id, schema.timerStates.task_id))
    .where(eq(schema.timerStates.main_account_id, accountId));

  if (rows.length === 0) return null;
  const active = rows.find((r) => r.status === "running" || r.status === "paused");
  return active ?? rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Zeiteinträge
// ---------------------------------------------------------------------------

export interface EntryRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  status: string;
  actual_started_at: number;
  actual_ended_at: number | null;
  actual_duration_seconds: number;
  break_duration_seconds: number | null;
  net_work_duration_seconds: number;
  billing_duration_seconds: number;
  billing_amount_snapshot: number | null;
  is_billable: boolean | null;
  description: string | null;
  source: string;
  is_backdated: boolean | null;
  backdate_reason: string | null;
  rounding_reason: string | null;
  crosses_midnight: boolean | null;
  invoice_id: string | null;
  projectName: string | null;
  customerName: string | null;
}

const entryColumns = {
  id: schema.timeEntries.id,
  project_id: schema.timeEntries.project_id,
  task_id: schema.timeEntries.task_id,
  status: schema.timeEntries.status,
  actual_started_at: schema.timeEntries.actual_started_at,
  actual_ended_at: schema.timeEntries.actual_ended_at,
  actual_duration_seconds: schema.timeEntries.actual_duration_seconds,
  break_duration_seconds: schema.timeEntries.break_duration_seconds,
  net_work_duration_seconds: schema.timeEntries.net_work_duration_seconds,
  billing_duration_seconds: schema.timeEntries.billing_duration_seconds,
  billing_amount_snapshot: schema.timeEntries.billing_amount_snapshot,
  is_billable: schema.timeEntries.is_billable,
  description: schema.timeEntries.description,
  source: schema.timeEntries.source,
  is_backdated: schema.timeEntries.is_backdated,
  backdate_reason: schema.timeEntries.backdate_reason,
  rounding_reason: schema.timeEntries.rounding_reason,
  crosses_midnight: schema.timeEntries.crosses_midnight,
  invoice_id: schema.timeEntries.invoice_id,
  projectName: schema.projects.name,
  customerName: schema.customers.name,
} as const;

/** Einträge im Zeitraum [start,end) (Anzeige-Sortierung nach Startzeit). */
export async function listEntries(accountId: string, range: Range): Promise<EntryRow[]> {
  return db
    .select(entryColumns)
    .from(schema.timeEntries)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.timeEntries.project_id))
    .leftJoin(schema.customers, eq(schema.customers.id, schema.timeEntries.customer_id))
    .where(
      and(
        eq(schema.timeEntries.main_account_id, accountId),
        gte(schema.timeEntries.actual_started_at, range.start),
        lt(schema.timeEntries.actual_started_at, range.end),
        isNull(schema.timeEntries.deleted_at),
      ),
    )
    .orderBy(schema.timeEntries.actual_started_at);
}

export interface BreakRow {
  id: string;
  time_entry_id: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number;
  kind: string | null;
  counts_as_rest: boolean | null;
}

/** Pausenblöcke eines Tages (über die Einträge des Zeitraums). */
export async function listBreaks(accountId: string, range: Range): Promise<BreakRow[]> {
  return db
    .select({
      id: schema.timeEntryBreaks.id,
      time_entry_id: schema.timeEntryBreaks.time_entry_id,
      started_at: schema.timeEntryBreaks.started_at,
      ended_at: schema.timeEntryBreaks.ended_at,
      duration_seconds: schema.timeEntryBreaks.duration_seconds,
      kind: schema.timeEntryBreaks.kind,
      counts_as_rest: schema.timeEntryBreaks.counts_as_rest,
    })
    .from(schema.timeEntryBreaks)
    .where(
      and(
        eq(schema.timeEntryBreaks.main_account_id, accountId),
        gte(schema.timeEntryBreaks.started_at, range.start),
        lt(schema.timeEntryBreaks.started_at, range.end),
        isNull(schema.timeEntryBreaks.deleted_at),
      ),
    )
    .orderBy(schema.timeEntryBreaks.started_at);
}

// ---------------------------------------------------------------------------
// Aggregate (Summen aus einer Eintragsmenge)
// ---------------------------------------------------------------------------

export interface Sums {
  netSeconds: number;
  breakSeconds: number;
  billableSeconds: number;
  nonBillableSeconds: number;
  billableAmountCents: number;
}

export function sumEntries(entries: EntryRow[]): Sums {
  const s: Sums = {
    netSeconds: 0,
    breakSeconds: 0,
    billableSeconds: 0,
    nonBillableSeconds: 0,
    billableAmountCents: 0,
  };
  for (const e of entries) {
    s.netSeconds += e.net_work_duration_seconds ?? 0;
    s.breakSeconds += e.break_duration_seconds ?? 0;
    if (e.is_billable) {
      s.billableSeconds += e.billing_duration_seconds ?? 0;
      s.billableAmountCents += e.billing_amount_snapshot ?? 0;
    } else {
      s.nonBillableSeconds += e.net_work_duration_seconds ?? 0;
    }
  }
  return s;
}

async function countWhere(where: ReturnType<typeof and> | undefined): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.timeEntries)
    .where(where);
  return rows[0]?.n ?? 0;
}

export interface DashboardData {
  today: Sums;
  week: Sums;
  month: Sums;
  draftCount: number;
  backdatedCount: number;
  openBillingSeconds: number;
  openBillingAmountCents: number;
  recentProjects: Array<{ id: string; name: string }>;
}

/** Aggregierte Dashboard-Kennzahlen (doc 11 §3). */
export async function getDashboard(account: AccountCtx): Promise<DashboardData> {
  const tz = account.timezone;
  const month = monthRange(tz);
  const week = weekRange(tz);
  const today = dayRange(tz);
  const wideStart = Math.min(month.start, week.start);
  const wideEnd = Math.max(month.end, week.end, today.end);

  const entries = await listEntries(account.id, { start: wideStart, end: wideEnd });
  const inRange = (e: EntryRow, r: Range) =>
    e.actual_started_at >= r.start && e.actual_started_at < r.end;

  const todaySums = sumEntries(entries.filter((e) => inRange(e, today)));
  const weekSums = sumEntries(entries.filter((e) => inRange(e, week)));
  const monthSums = sumEntries(entries.filter((e) => inRange(e, month)));

  const [draftCount, backdatedCount] = await Promise.all([
    countWhere(
      and(
        eq(schema.timeEntries.main_account_id, account.id),
        eq(schema.timeEntries.status, "draft"),
        isNull(schema.timeEntries.deleted_at),
      ),
    ),
    countWhere(
      and(
        eq(schema.timeEntries.main_account_id, account.id),
        eq(schema.timeEntries.source, "manual_backdated"),
        isNull(schema.timeEntries.deleted_at),
      ),
    ),
  ]);

  // Offene, abrechenbare, noch nicht fakturierte Zeit.
  const openRows = await db
    .select({
      billing_duration_seconds: schema.timeEntries.billing_duration_seconds,
      billing_amount_snapshot: schema.timeEntries.billing_amount_snapshot,
    })
    .from(schema.timeEntries)
    .where(
      and(
        eq(schema.timeEntries.main_account_id, account.id),
        eq(schema.timeEntries.is_billable, true),
        isNull(schema.timeEntries.invoice_id),
        isNull(schema.timeEntries.deleted_at),
      ),
    );
  let openBillingSeconds = 0;
  let openBillingAmountCents = 0;
  for (const r of openRows) {
    openBillingSeconds += r.billing_duration_seconds ?? 0;
    openBillingAmountCents += r.billing_amount_snapshot ?? 0;
  }

  const recentProjects = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(
      and(eq(schema.projects.main_account_id, account.id), isNull(schema.projects.deleted_at)),
    )
    .orderBy(desc(schema.projects.updated_at))
    .limit(6);

  return {
    today: todaySums,
    week: weekSums,
    month: monthSums,
    draftCount,
    backdatedCount,
    openBillingSeconds,
    openBillingAmountCents,
    recentProjects,
  };
}

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export interface CustomerRow {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  customer_number: string | null;
  default_currency: string | null;
  default_hourly_rate_cents: number | null;
  payment_term_days: number | null;
  status: string | null;
}

export async function listCustomers(accountId: string): Promise<CustomerRow[]> {
  return db
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      company: schema.customers.company,
      email: schema.customers.email,
      customer_number: schema.customers.customer_number,
      default_currency: schema.customers.default_currency,
      default_hourly_rate_cents: schema.customers.default_hourly_rate_cents,
      payment_term_days: schema.customers.payment_term_days,
      status: schema.customers.status,
    })
    .from(schema.customers)
    .where(and(eq(schema.customers.main_account_id, accountId), isNull(schema.customers.deleted_at)))
    .orderBy(schema.customers.name);
}

export interface ProjectRow {
  id: string;
  name: string;
  customer_id: string | null;
  status: string | null;
  project_code: string | null;
  billing_type: string;
  hourly_rate_cents: number | null;
  day_rate_cents: number | null;
  fixed_fee_cents: number | null;
  rounding_rule_id: string | null;
  description_required: boolean | null;
  backdating_allowed: boolean | null;
  backdating_reason_required: boolean | null;
  customerName: string | null;
}

export async function listProjects(accountId: string): Promise<ProjectRow[]> {
  return db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      customer_id: schema.projects.customer_id,
      status: schema.projects.status,
      project_code: schema.projects.project_code,
      billing_type: schema.projects.billing_type,
      hourly_rate_cents: schema.projects.hourly_rate_cents,
      day_rate_cents: schema.projects.day_rate_cents,
      fixed_fee_cents: schema.projects.fixed_fee_cents,
      rounding_rule_id: schema.projects.rounding_rule_id,
      description_required: schema.projects.description_required,
      backdating_allowed: schema.projects.backdating_allowed,
      backdating_reason_required: schema.projects.backdating_reason_required,
      customerName: schema.customers.name,
    })
    .from(schema.projects)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.projects.customer_id))
    .where(and(eq(schema.projects.main_account_id, accountId), isNull(schema.projects.deleted_at)))
    .orderBy(schema.projects.name);
}

export interface TaskRow {
  id: string;
  name: string;
  project_id: string | null;
  default_billable: boolean | null;
  cost_center: string | null;
  status: string | null;
  projectName: string | null;
}

export async function listTasks(accountId: string): Promise<TaskRow[]> {
  return db
    .select({
      id: schema.tasks.id,
      name: schema.tasks.name,
      project_id: schema.tasks.project_id,
      default_billable: schema.tasks.default_billable,
      cost_center: schema.tasks.cost_center,
      status: schema.tasks.status,
      projectName: schema.projects.name,
    })
    .from(schema.tasks)
    .leftJoin(schema.projects, eq(schema.projects.id, schema.tasks.project_id))
    .where(and(eq(schema.tasks.main_account_id, accountId), isNull(schema.tasks.deleted_at)))
    .orderBy(schema.tasks.sort_order, schema.tasks.name);
}

// ---------------------------------------------------------------------------
// Rechnungen / Exporte / Rundungsregeln
// ---------------------------------------------------------------------------

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  type: string;
  status: string | null;
  issue_date: string | null;
  currency: string;
  net_amount_cents: number;
  tax_amount_cents: number;
  gross_amount_cents: number;
  customerName: string | null;
}

export async function listInvoices(accountId: string): Promise<InvoiceRow[]> {
  return db
    .select({
      id: schema.invoices.id,
      invoice_number: schema.invoices.invoice_number,
      type: schema.invoices.type,
      status: schema.invoices.status,
      issue_date: schema.invoices.issue_date,
      currency: schema.invoices.currency,
      net_amount_cents: schema.invoices.net_amount_cents,
      tax_amount_cents: schema.invoices.tax_amount_cents,
      gross_amount_cents: schema.invoices.gross_amount_cents,
      customerName: schema.customers.name,
    })
    .from(schema.invoices)
    .leftJoin(schema.customers, eq(schema.customers.id, schema.invoices.customer_id))
    .where(eq(schema.invoices.main_account_id, accountId))
    .orderBy(desc(schema.invoices.created_at));
}

export interface ExportRow {
  id: string;
  export_number: string | null;
  format: string;
  variant: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: number;
  filename: string | null;
  size_bytes: number | null;
}

export async function listExports(accountId: string): Promise<ExportRow[]> {
  return db
    .select({
      id: schema.exports.id,
      export_number: schema.exports.export_number,
      format: schema.exports.format,
      variant: schema.exports.variant,
      period_start: schema.exports.period_start,
      period_end: schema.exports.period_end,
      created_at: schema.exports.created_at,
      filename: schema.exportFiles.filename,
      size_bytes: schema.exportFiles.size_bytes,
    })
    .from(schema.exports)
    .leftJoin(schema.exportFiles, eq(schema.exportFiles.export_id, schema.exports.id))
    .where(eq(schema.exports.main_account_id, accountId))
    .orderBy(desc(schema.exports.created_at))
    .limit(100);
}

export interface RoundingRuleRow {
  id: string;
  name: string;
  mode: string;
  interval_minutes: number | null;
  min_duration_seconds: number | null;
  scope: string | null;
  valid_from: string;
  valid_until: string | null;
}

export async function listRoundingRules(accountId: string): Promise<RoundingRuleRow[]> {
  return db
    .select({
      id: schema.roundingRules.id,
      name: schema.roundingRules.name,
      mode: schema.roundingRules.mode,
      interval_minutes: schema.roundingRules.interval_minutes,
      min_duration_seconds: schema.roundingRules.min_duration_seconds,
      scope: schema.roundingRules.scope,
      valid_from: schema.roundingRules.valid_from,
      valid_until: schema.roundingRules.valid_until,
    })
    .from(schema.roundingRules)
    .where(and(eq(schema.roundingRules.main_account_id, accountId), isNull(schema.roundingRules.deleted_at)))
    .orderBy(schema.roundingRules.name);
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ComplianceRow {
  id: string;
  scope: string;
  scope_date: string | null;
  rule_code: string;
  severity: "green" | "yellow" | "red";
  message: string;
  override_reason: string | null;
}

export async function listComplianceResults(
  accountId: string,
  sinceEpochMs: number,
): Promise<ComplianceRow[]> {
  return db
    .select({
      id: schema.complianceResults.id,
      scope: schema.complianceResults.scope,
      scope_date: schema.complianceResults.scope_date,
      rule_code: schema.complianceResults.rule_code,
      severity: schema.complianceResults.severity,
      message: schema.complianceResults.message,
      override_reason: schema.complianceResults.override_reason,
    })
    .from(schema.complianceResults)
    .where(
      and(
        eq(schema.complianceResults.main_account_id, accountId),
        gte(schema.complianceResults.created_at, sinceEpochMs),
      ),
    )
    .orderBy(desc(schema.complianceResults.scope_date));
}

// ---------------------------------------------------------------------------
// Sync / Geräte
// ---------------------------------------------------------------------------

export interface DeviceRow {
  id: string;
  device_name: string;
  platform: string;
  app_version: string;
  sync_status: string | null;
  last_sync_at: number | null;
  server_connected: boolean | null;
  revoked: boolean | null;
  live_channel_status: string | null;
  connected_at: number;
}

export async function listDevices(accountId: string): Promise<DeviceRow[]> {
  return db
    .select({
      id: schema.devices.id,
      device_name: schema.devices.device_name,
      platform: schema.devices.platform,
      app_version: schema.devices.app_version,
      sync_status: schema.devices.sync_status,
      last_sync_at: schema.devices.last_sync_at,
      server_connected: schema.devices.server_connected,
      revoked: schema.devices.revoked,
      live_channel_status: schema.devices.live_channel_status,
      connected_at: schema.devices.connected_at,
    })
    .from(schema.devices)
    .where(and(eq(schema.devices.main_account_id, accountId), isNull(schema.devices.deleted_at)))
    .orderBy(desc(schema.devices.last_sync_at));
}

export async function getConflictCount(accountId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.conflictRecords)
    .where(
      and(
        eq(schema.conflictRecords.main_account_id, accountId),
        eq(schema.conflictRecords.resolution, "unresolved"),
      ),
    );
  return rows[0]?.n ?? 0;
}

export interface AttachmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: number;
}

export async function listAttachments(accountId: string): Promise<AttachmentRow[]> {
  return db
    .select({
      id: schema.attachments.id,
      entity_type: schema.attachments.entity_type,
      entity_id: schema.attachments.entity_id,
      filename: schema.attachments.filename,
      mime_type: schema.attachments.mime_type,
      size_bytes: schema.attachments.size_bytes,
      created_at: schema.attachments.created_at,
    })
    .from(schema.attachments)
    .where(and(eq(schema.attachments.main_account_id, accountId), isNull(schema.attachments.deleted_at)))
    .orderBy(desc(schema.attachments.created_at))
    .limit(200);
}

export interface SettingRow {
  id: string;
  scope: string;
  key: string;
  value_json: Record<string, unknown>;
}

export async function listSettings(accountId: string): Promise<SettingRow[]> {
  return db
    .select({
      id: schema.settings.id,
      scope: schema.settings.scope,
      key: schema.settings.key,
      value_json: schema.settings.value_json,
    })
    .from(schema.settings)
    .where(eq(schema.settings.main_account_id, accountId))
    .orderBy(schema.settings.key);
}
