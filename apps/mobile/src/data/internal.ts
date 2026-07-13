/**
 * data/internal.ts — private plumbing for the local store (doc 11 §7).
 *
 * This module owns everything the public `data/index.ts` contract needs but is
 * NOT part of the contract: local bootstrap (a singleton main account + a stable
 * device id), the default rounding rule / rate used by the offline calc, raw
 * SQLite row shapes, and the row→model mappers.
 *
 * Business logic (net/rounding/billing) is NEVER done here — it lives in
 * `@tarlog/core`. This file only opens/reads/writes rows and shuttles them into the
 * pure engine. Conventions mirror ../lib/db: epoch-ms UTC INTEGER, durations
 * `*_seconds` INTEGER, money `*_cents` INTEGER, ids UUIDv7 TEXT, booleans 0/1.
 */
import type { RateSnapshot, RoundingRule, TimerStatus, Uuid } from "@tarlog/core";
import type * as SQLite from "expo-sqlite";
import { getDb, initDb } from "../lib/db";
import { newId } from "../lib/ids";
import { nowMs } from "../lib/time";
import type {
  Customer,
  Project,
  Task,
  TimeEntry,
  TimerState,
} from "./index";

// ---------------------------------------------------------------------------
// Bootstrap: one local main account + a stable device id (doc 11 §7 local-first)
// ---------------------------------------------------------------------------

/**
 * This is a single-user, local-first iOS client: exactly one `main_accounts`
 * row backs the whole device. It is created lazily on first write and cached.
 */
let cachedAccountId: Uuid | null = null;

/** Stable identifier for THIS device (no `devices` table in the iOS subset). */
export const DEVICE_ID = "ptl-ios-local-device" as const;

/**
 * Timer statuses that count as "an active timer already exists" for the
 * single-timer guard. `stopped`/`idle` are terminal and may be replaced.
 */
export const ACTIVE_TIMER_STATUSES: readonly TimerStatus[] = [
  "running",
  "paused",
  "needs_description",
];

/**
 * Default rounding rule for the offline client: `none` (billing = net). A real
 * per-project rule is resolved server-side / in a later milestone; until then
 * the engine still runs, it simply rounds by nothing.
 */
export const DEFAULT_ROUNDING_RULE: RoundingRule = {
  id: "00000000-0000-7000-8000-0000000000ff",
  mode: "none",
};

/**
 * Default rate snapshot for the offline client: 0 cents. Keeps
 * `billing_amount_snapshot` a valid frozen integer until rate resolution
 * (task > project > customer > default, doc 07 §5) is wired to real rates.
 */
export const DEFAULT_RATE: RateSnapshot = {
  amount_cents: 0,
  currency: "EUR",
  source: "default",
};

/** Open + migrate once, returning the shared handle. */
export function db(): SQLite.SQLiteDatabase {
  return initDb();
}

/** Resolve (and lazily create) the singleton local main account id. */
export function accountId(): Uuid {
  if (cachedAccountId) return cachedAccountId;
  const conn = getDb();
  const existing = conn.getFirstSync<{ id: string }>(
    "SELECT id FROM main_accounts LIMIT 1;",
  );
  if (existing) {
    cachedAccountId = existing.id;
    return cachedAccountId;
  }
  const id = newId();
  const at = nowMs();
  conn.runSync(
    `INSERT INTO main_accounts (id, display_name, mode, created_at, updated_at)
     VALUES (?, ?, 'local', ?, ?);`,
    [id, "Local", at, at],
  );
  cachedAccountId = id;
  return id;
}

/** Drop the cached account id (tests, or after a local wipe). */
export function resetAccountCache(): void {
  cachedAccountId = null;
}

// ---------------------------------------------------------------------------
// Raw row shapes (SQLite stores booleans as 0/1, everything else 1:1)
// ---------------------------------------------------------------------------

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
  description_required: number | null;
}

export interface TimeEntryRow {
  id: string;
  main_account_id: string;
  project_id: string | null;
  task_id: string | null;
  customer_id: string | null;
  status: TimeEntry["status"];
  timezone: string;
  actual_started_at: number;
  actual_ended_at: number | null;
  actual_duration_seconds: number;
  break_duration_seconds: number | null;
  net_work_duration_seconds: number;
  billing_duration_seconds: number;
  rounding_rule_id: string | null;
  rounding_delta_seconds: number | null;
  rounding_reason: string | null;
  calculation_version: number;
  billing_amount_snapshot: number | null;
  description: string | null;
  is_billable: number | null;
  source: TimeEntry["source"];
  is_backdated: number | null;
}

export interface CustomerRow {
  id: string;
  main_account_id: string;
  name: string;
  company: string | null;
  status: Customer["status"] | null;
}

export interface ProjectRow {
  id: string;
  main_account_id: string;
  name: string;
  customer_id: string | null;
  billing_type: Project["billing_type"];
  status: Project["status"] | null;
  description_required: number | null;
}

export interface TaskRow {
  id: string;
  main_account_id: string;
  project_id: string | null;
  name: string;
  default_billable: number | null;
  status: Task["status"] | null;
}

// ---------------------------------------------------------------------------
// Mappers — SQLite row → public contract model
// ---------------------------------------------------------------------------

const bool = (v: number | null | undefined): boolean => v === 1;

export function mapTimer(r: TimerRow): TimerState {
  return {
    timer_id: r.timer_id,
    main_account_id: r.main_account_id,
    current_time_entry_id: r.current_time_entry_id,
    status: r.status,
    project_id: r.project_id,
    task_id: r.task_id,
    started_at: r.started_at,
    paused_at: r.paused_at,
    accumulated_pause_seconds: r.accumulated_pause_seconds,
    active_pause_started_at: r.active_pause_started_at,
    description_required: bool(r.description_required),
  };
}

export function mapEntry(r: TimeEntryRow): TimeEntry {
  return {
    id: r.id,
    main_account_id: r.main_account_id,
    project_id: r.project_id,
    task_id: r.task_id,
    customer_id: r.customer_id,
    status: r.status,
    timezone: r.timezone,
    actual_started_at: r.actual_started_at,
    actual_ended_at: r.actual_ended_at,
    actual_duration_seconds: r.actual_duration_seconds,
    break_duration_seconds: r.break_duration_seconds ?? 0,
    net_work_duration_seconds: r.net_work_duration_seconds,
    billing_duration_seconds: r.billing_duration_seconds,
    rounding_rule_id: r.rounding_rule_id,
    rounding_delta_seconds: r.rounding_delta_seconds ?? 0,
    rounding_reason: r.rounding_reason,
    calculation_version: r.calculation_version,
    billing_amount_snapshot: r.billing_amount_snapshot,
    description: r.description,
    is_billable: bool(r.is_billable),
    source: r.source,
    is_backdated: bool(r.is_backdated),
  };
}

export function mapCustomer(r: CustomerRow): Customer {
  return {
    id: r.id,
    main_account_id: r.main_account_id,
    name: r.name,
    company: r.company,
    status: r.status ?? "active",
  };
}

export function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    main_account_id: r.main_account_id,
    name: r.name,
    customer_id: r.customer_id,
    billing_type: r.billing_type,
    status: r.status ?? "active",
    description_required: bool(r.description_required),
  };
}

export function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    main_account_id: r.main_account_id,
    project_id: r.project_id,
    name: r.name,
    default_billable: bool(r.default_billable),
    status: r.status ?? "active",
  };
}

// ---------------------------------------------------------------------------
// Shared SELECT column lists (keep row shapes and mappers in lock-step)
// ---------------------------------------------------------------------------

export const TIMER_COLS =
  "timer_id, main_account_id, current_time_entry_id, status, project_id, task_id, started_at, paused_at, accumulated_pause_seconds, active_pause_started_at, description_required";

export const ENTRY_COLS =
  "id, main_account_id, project_id, task_id, customer_id, status, timezone, actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds, net_work_duration_seconds, billing_duration_seconds, rounding_rule_id, rounding_delta_seconds, rounding_reason, calculation_version, billing_amount_snapshot, description, is_billable, source, is_backdated";

export const CUSTOMER_COLS = "id, main_account_id, name, company, status";

export const PROJECT_COLS =
  "id, main_account_id, name, customer_id, billing_type, status, description_required";

export const TASK_COLS =
  "id, main_account_id, project_id, name, default_billable, status";
