/**
 * lib/timer/repository.ts, getippter Datenzugriff für timer_states,
 * time_entries, time_entry_breaks (doc 06 A.1/A.3). Rohes parametrisiertes SQL
 * (wie lib/session.ts / lib/events.ts), exakte @tarlog/db-Spaltennamen. BIGINT-
 * Spalten (epoch-ms, *_cents, server_revision) kommen als String → `toNum`.
 */
import type { PoolClient } from "pg";
import type { BreakInput, TimerStatus } from "@tarlog/core";
import { pool } from "@/lib/db";
import { toNum, toNumOrNull } from "@/lib/sync/mutation";

/** Gemappte timer_states-Zeile (18 Felder, doc 04 §3.2). */
export interface TimerRow {
  timer_id: string;
  main_account_id: string;
  current_time_entry_id: string | null;
  status: TimerStatus;
  project_id: string | null;
  task_id: string | null;
  started_at: number | null;
  paused_at: number | null;
  accumulated_pause_seconds: number;
  active_pause_started_at: number | null;
  device_started_on: string;
  last_modified_by_device: string;
  sync_version: number;
  server_revision: number | null;
  local_revision: number;
  description_required: boolean;
  billing_status: "billable" | "non_billable" | "undecided";
  compliance_warnings: unknown[] | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapTimer(r: any): TimerRow {
  return {
    timer_id: r.timer_id,
    main_account_id: r.main_account_id,
    current_time_entry_id: r.current_time_entry_id ?? null,
    status: r.status,
    project_id: r.project_id ?? null,
    task_id: r.task_id ?? null,
    started_at: toNumOrNull(r.started_at),
    paused_at: toNumOrNull(r.paused_at),
    accumulated_pause_seconds: toNum(r.accumulated_pause_seconds),
    active_pause_started_at: toNumOrNull(r.active_pause_started_at),
    device_started_on: r.device_started_on,
    last_modified_by_device: r.last_modified_by_device,
    sync_version: toNum(r.sync_version),
    server_revision: toNumOrNull(r.server_revision),
    local_revision: toNum(r.local_revision),
    description_required: Boolean(r.description_required),
    billing_status: r.billing_status ?? "undecided",
    compliance_warnings: r.compliance_warnings ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const TIMER_COLS = `timer_id, main_account_id, current_time_entry_id, status,
  project_id, task_id, started_at, paused_at, accumulated_pause_seconds,
  active_pause_started_at, device_started_on, last_modified_by_device,
  sync_version, server_revision, local_revision, description_required,
  billing_status, compliance_warnings`;

/** Der eine aktive Timer (running|paused) des Accounts, oder null. */
export async function loadActiveTimer(
  q: PoolClient | typeof pool,
  mainAccountId: string,
): Promise<TimerRow | null> {
  const res = await q.query(
    `SELECT ${TIMER_COLS} FROM timer_states
      WHERE main_account_id = $1 AND status IN ('running','paused')
      LIMIT 1`,
    [mainAccountId],
  );
  return res.rows[0] ? mapTimer(res.rows[0]) : null;
}

/** Timer per PK (jeder Status). */
export async function loadTimerById(
  q: PoolClient | typeof pool,
  timerId: string,
  mainAccountId: string,
): Promise<TimerRow | null> {
  const res = await q.query(
    `SELECT ${TIMER_COLS} FROM timer_states
      WHERE timer_id = $1 AND main_account_id = $2 LIMIT 1`,
    [timerId, mainAccountId],
  );
  return res.rows[0] ? mapTimer(res.rows[0]) : null;
}

/** Aktueller Timer für die Kopfleiste: aktiv, sonst zuletzt geänderter. */
export async function loadCurrentTimer(
  mainAccountId: string,
): Promise<TimerRow | null> {
  const active = await loadActiveTimer(pool, mainAccountId);
  if (active) return active;
  const res = await pool.query(
    `SELECT ${TIMER_COLS} FROM timer_states
      WHERE main_account_id = $1
      ORDER BY COALESCE(server_revision, 0) DESC, started_at DESC NULLS LAST
      LIMIT 1`,
    [mainAccountId],
  );
  return res.rows[0] ? mapTimer(res.rows[0]) : null;
}

/** Account-Defaults für Zeitzone/Währung (Fallbacks bei Auflösung). */
export async function loadAccountDefaults(
  q: PoolClient | typeof pool,
  mainAccountId: string,
): Promise<{ default_timezone: string; default_currency: string }> {
  const res = await q.query(
    `SELECT default_timezone, default_currency FROM main_accounts WHERE id = $1 LIMIT 1`,
    [mainAccountId],
  );
  const row = res.rows[0];
  return {
    default_timezone: row?.default_timezone ?? "Europe/Berlin",
    default_currency: row?.default_currency ?? "EUR",
  };
}

export interface ProjectContext {
  id: string;
  customer_id: string | null;
  billing_type: string;
  description_required: boolean;
  backdating_allowed: boolean;
  backdating_reason_required: boolean;
  hourly_rate_cents: number | null;
  rounding_rule_id: string | null;
}

export async function loadProject(
  q: PoolClient | typeof pool,
  id: string,
  mainAccountId: string,
): Promise<ProjectContext | null> {
  const res = await q.query(
    `SELECT id, customer_id, billing_type, description_required,
            backdating_allowed, backdating_reason_required,
            hourly_rate_cents, rounding_rule_id
       FROM projects
      WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, mainAccountId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    customer_id: r.customer_id ?? null,
    billing_type: r.billing_type,
    description_required: Boolean(r.description_required),
    backdating_allowed: Boolean(r.backdating_allowed),
    backdating_reason_required: Boolean(r.backdating_reason_required),
    hourly_rate_cents: toNumOrNull(r.hourly_rate_cents),
    rounding_rule_id: r.rounding_rule_id ?? null,
  };
}

export interface CustomerContext {
  id: string;
  default_hourly_rate_cents: number | null;
  default_rounding_rule_id: string | null;
  default_currency: string | null;
}

export async function loadCustomer(
  q: PoolClient | typeof pool,
  id: string,
  mainAccountId: string,
): Promise<CustomerContext | null> {
  const res = await q.query(
    `SELECT id, default_hourly_rate_cents, default_rounding_rule_id, default_currency
       FROM customers
      WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, mainAccountId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    default_hourly_rate_cents: toNumOrNull(r.default_hourly_rate_cents),
    default_rounding_rule_id: r.default_rounding_rule_id ?? null,
    default_currency: r.default_currency ?? null,
  };
}

export interface TaskContext {
  id: string;
  project_id: string | null;
  default_billable: boolean;
  default_hourly_rate_cents: number | null;
}

export async function loadTask(
  q: PoolClient | typeof pool,
  id: string,
  mainAccountId: string,
): Promise<TaskContext | null> {
  const res = await q.query(
    `SELECT id, project_id, default_billable, default_hourly_rate_cents
       FROM tasks
      WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, mainAccountId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    project_id: r.project_id ?? null,
    default_billable: r.default_billable == null ? true : Boolean(r.default_billable),
    default_hourly_rate_cents: toNumOrNull(r.default_hourly_rate_cents),
  };
}

/** Abgeschlossene Pausen eines Eintrags als core-`BreakInput[]`. */
export async function loadBreaksForEntry(
  q: PoolClient | typeof pool,
  entryId: string,
): Promise<BreakInput[]> {
  const res = await q.query(
    `SELECT started_at, ended_at FROM time_entry_breaks
      WHERE time_entry_id = $1 AND deleted_at IS NULL AND ended_at IS NOT NULL
      ORDER BY started_at ASC`,
    [entryId],
  );
  return res.rows.map((r) => ({
    started_at: toNum(r.started_at),
    ended_at: toNumOrNull(r.ended_at),
  }));
}

/** Gemappte time_entries-Zeile (die für Sync/Antworten relevanten Felder). */
export interface TimeEntryRow {
  id: string;
  main_account_id: string;
  project_id: string | null;
  task_id: string | null;
  customer_id: string | null;
  status: string;
  timezone: string;
  actual_started_at: number;
  actual_ended_at: number | null;
  actual_duration_seconds: number;
  break_duration_seconds: number;
  net_work_duration_seconds: number;
  billing_duration_seconds: number;
  rounding_rule_id: string | null;
  rounding_delta_seconds: number;
  rounding_reason: string | null;
  calculation_version: number;
  rate_snapshot: Record<string, unknown> | null;
  billing_amount_snapshot: number | null;
  description: string | null;
  is_billable: boolean;
  client_visible: boolean;
  source: string;
  backdate_reason: string | null;
  correction_reason: string | null;
  is_backdated: boolean;
  crosses_midnight: boolean;
  clock_trust: string;
  invoice_id: string | null;
  deleted_at: number | null;
  sync_version: number;
  server_revision: number | null;
  local_revision: number;
  hlc: string | null;
  created_at: number;
  updated_at: number;
}

const ENTRY_COLS = `id, main_account_id, project_id, task_id, customer_id, status,
  timezone, actual_started_at, actual_ended_at, actual_duration_seconds,
  break_duration_seconds, net_work_duration_seconds, billing_duration_seconds,
  rounding_rule_id, rounding_delta_seconds, rounding_reason, calculation_version,
  rate_snapshot, billing_amount_snapshot, description, is_billable, client_visible,
  source, backdate_reason, correction_reason, is_backdated, crosses_midnight,
  clock_trust, invoice_id, deleted_at, sync_version, server_revision,
  local_revision, hlc, created_at, updated_at`;

/* eslint-disable @typescript-eslint/no-explicit-any */
export function mapEntry(r: any): TimeEntryRow {
  return {
    id: r.id,
    main_account_id: r.main_account_id,
    project_id: r.project_id ?? null,
    task_id: r.task_id ?? null,
    customer_id: r.customer_id ?? null,
    status: r.status,
    timezone: r.timezone,
    actual_started_at: toNum(r.actual_started_at),
    actual_ended_at: toNumOrNull(r.actual_ended_at),
    actual_duration_seconds: toNum(r.actual_duration_seconds),
    break_duration_seconds: toNum(r.break_duration_seconds),
    net_work_duration_seconds: toNum(r.net_work_duration_seconds),
    billing_duration_seconds: toNum(r.billing_duration_seconds),
    rounding_rule_id: r.rounding_rule_id ?? null,
    rounding_delta_seconds: toNum(r.rounding_delta_seconds),
    rounding_reason: r.rounding_reason ?? null,
    calculation_version: toNum(r.calculation_version),
    rate_snapshot: r.rate_snapshot ?? null,
    billing_amount_snapshot: toNumOrNull(r.billing_amount_snapshot),
    description: r.description ?? null,
    is_billable: r.is_billable == null ? true : Boolean(r.is_billable),
    client_visible: r.client_visible == null ? true : Boolean(r.client_visible),
    source: r.source,
    backdate_reason: r.backdate_reason ?? null,
    correction_reason: r.correction_reason ?? null,
    is_backdated: Boolean(r.is_backdated),
    crosses_midnight: Boolean(r.crosses_midnight),
    clock_trust: r.clock_trust ?? "trusted",
    invoice_id: r.invoice_id ?? null,
    deleted_at: toNumOrNull(r.deleted_at),
    sync_version: toNum(r.sync_version),
    server_revision: toNumOrNull(r.server_revision),
    local_revision: toNum(r.local_revision),
    hlc: r.hlc ?? null,
    created_at: toNum(r.created_at),
    updated_at: toNum(r.updated_at),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadTimeEntry(
  q: PoolClient | typeof pool,
  id: string,
  mainAccountId: string,
): Promise<TimeEntryRow | null> {
  const res = await q.query(
    `SELECT ${ENTRY_COLS} FROM time_entries WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
    [id, mainAccountId],
  );
  return res.rows[0] ? mapEntry(res.rows[0]) : null;
}

export interface ListEntriesFilter {
  mainAccountId: string;
  from?: number | null;
  to?: number | null;
  projectId?: string | null;
  status?: string | null;
  limit: number;
}

export async function listTimeEntries(
  filter: ListEntriesFilter,
): Promise<TimeEntryRow[]> {
  const clauses: string[] = ["main_account_id = $1", "deleted_at IS NULL"];
  const values: unknown[] = [filter.mainAccountId];
  if (filter.from != null) {
    values.push(filter.from);
    clauses.push(`actual_started_at >= $${values.length}`);
  }
  if (filter.to != null) {
    values.push(filter.to);
    clauses.push(`actual_started_at <= $${values.length}`);
  }
  if (filter.projectId) {
    values.push(filter.projectId);
    clauses.push(`project_id = $${values.length}`);
  }
  if (filter.status) {
    values.push(filter.status);
    clauses.push(`status = $${values.length}`);
  }
  values.push(filter.limit);
  const res = await pool.query(
    `SELECT ${ENTRY_COLS} FROM time_entries
      WHERE ${clauses.join(" AND ")}
      ORDER BY actual_started_at DESC
      LIMIT $${values.length}`,
    values,
  );
  return res.rows.map(mapEntry);
}
