/**
 * data/index.ts — THE STORE CONTRACT for the iOS app (doc 02 §4.5, doc 11 §7).
 *
 * This file defines the FULL set of store functions the screen author and sync
 * author code against, implemented over expo-sqlite (see ../lib/db). Business
 * logic (net/rounding/billing/compliance) is delegated to `@ptl/core`; this
 * layer only orchestrates local storage + core (AC28: iOS architecture prepared).
 *
 * Hard rules baked into these signatures:
 *  - Business logic (net/rounding/billing/compliance) is NEVER done here; it
 *    comes from `@ptl/core`. This layer only orchestrates storage + core.
 *  - Instants are UTC epoch-ms (`EpochMs`); each entry carries its `timezone`.
 *  - Durations are integer seconds; money is integer cents; ids are UUIDv7.
 *  - Exactly ONE active timer per main account (single-timer invariant); the
 *    timer moves through idle/running/paused/stopped/needs_description/
 *    sync_pending/conflict.
 *  - Local persistence is `expo-sqlite` (see ../lib/db); server sync is
 *    optional (Bearer device_token to the web API, doc 04).
 */
import type {
  Cents,
  EpochMs,
  IanaTimezone,
  RoundingMode,
  Seconds,
  TimerStatus,
  Uuid,
} from "@ptl/core";
import { CALCULATION_VERSION, calculateEntry } from "@ptl/core";
import { deviceTimezone, durationSeconds, nowMs } from "../lib/time";
import { newId } from "../lib/ids";
import {
  accountId,
  CUSTOMER_COLS,
  db,
  DEFAULT_RATE,
  DEFAULT_ROUNDING_RULE,
  DEVICE_ID,
  ENTRY_COLS,
  mapCustomer,
  mapEntry,
  mapProject,
  mapTask,
  mapTimer,
  PROJECT_COLS,
  TASK_COLS,
  TIMER_COLS,
  type TimeEntryRow,
  type TimerRow,
} from "./internal";

// ---------------------------------------------------------------------------
// Row shapes (read models) — strukturgleich to ../lib/db tables. Kept minimal;
// authors widen as screens need more columns.
// ---------------------------------------------------------------------------

/** Persisted timer singleton (doc 06 timer_states). */
export interface TimerState {
  timer_id: Uuid;
  main_account_id: Uuid;
  current_time_entry_id: Uuid | null;
  status: TimerStatus;
  project_id: Uuid | null;
  task_id: Uuid | null;
  started_at: EpochMs | null;
  paused_at: EpochMs | null;
  accumulated_pause_seconds: Seconds;
  active_pause_started_at: EpochMs | null;
  description_required: boolean;
}

/** A time entry row (doc 06 time_entries) — the 12 calc fields plus context. */
export interface TimeEntry {
  id: Uuid;
  main_account_id: Uuid;
  project_id: Uuid | null;
  task_id: Uuid | null;
  customer_id: Uuid | null;
  status: "draft" | "running" | "paused" | "stopped" | "completed" | "invoiced";
  timezone: IanaTimezone;
  actual_started_at: EpochMs;
  actual_ended_at: EpochMs | null;
  actual_duration_seconds: Seconds;
  break_duration_seconds: Seconds;
  net_work_duration_seconds: Seconds;
  billing_duration_seconds: Seconds;
  rounding_rule_id: Uuid | null;
  rounding_delta_seconds: Seconds;
  rounding_reason: string | null;
  calculation_version: number;
  billing_amount_snapshot: Cents | null;
  description: string | null;
  is_billable: boolean;
  source: "live_timer" | "manual_backdated" | "imported" | "api";
  is_backdated: boolean;
}

export interface Customer {
  id: Uuid;
  main_account_id: Uuid;
  name: string;
  company: string | null;
  status: "active" | "paused" | "archived";
}

export interface Project {
  id: Uuid;
  main_account_id: Uuid;
  name: string;
  customer_id: Uuid | null;
  billing_type: "hourly" | "day_rate" | "fixed_fee" | "retainer" | "non_billable";
  status: "planned" | "active" | "paused" | "completed" | "archived";
  description_required: boolean;
}

export interface Task {
  id: Uuid;
  main_account_id: Uuid;
  project_id: Uuid | null;
  name: string;
  default_billable: boolean;
  status: "active" | "archived";
}

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/** Params to start a live timer (doc 11 §7 nr. 1). Project/task optional. */
export interface StartTimerInput {
  project_id?: Uuid;
  task_id?: Uuid;
  timezone?: IanaTimezone;
  description?: string;
}

/** Params to stop a running timer (doc 11 §7 nr. 4). */
export interface StopTimerInput {
  /** Required when the timer is in `needs_description`. */
  description?: string;
  is_billable?: boolean;
}

/** A backdated (manually entered) time entry (doc 11 §7 nr. 6). */
export interface BackdateEntryInput {
  project_id?: Uuid;
  task_id?: Uuid;
  customer_id?: Uuid;
  timezone: IanaTimezone;
  actual_started_at: EpochMs;
  actual_ended_at: EpochMs;
  breaks?: { started_at: EpochMs; ended_at: EpochMs | null }[];
  description?: string;
  is_billable?: boolean;
  /** Reason for the backdate (may be mandatory per project config). */
  backdate_reason?: string;
}

/** A new time entry created live (via the timer). */
export interface CreateEntryInput {
  project_id?: Uuid;
  task_id?: Uuid;
  customer_id?: Uuid;
  timezone: IanaTimezone;
  actual_started_at: EpochMs;
  description?: string;
  is_billable?: boolean;
}

export interface CustomerInput {
  name: string;
  company?: string;
}

export interface ProjectInput {
  name: string;
  customer_id?: Uuid;
  billing_type: Project["billing_type"];
  description_required?: boolean;
}

export interface TaskInput {
  name: string;
  project_id?: Uuid;
  default_billable?: boolean;
}

/** Rounding rule reference resolved for an entry (mirrors core RoundingRule). */
export interface RoundingRuleRef {
  id: Uuid;
  mode: RoundingMode;
  interval_seconds?: number;
  minimum_seconds?: Seconds;
}

// ===========================================================================
// timer — the single-timer state machine (doc 04 §3, doc 11 §7 nr. 1–5)
// Exactly ONE active timer per main account. Transitions call `@ptl/core` for
// any duration math; this layer only persists state + emits sync events.
// ===========================================================================

// ---------------------------------------------------------------------------
// Private row helpers (kept here so the contract objects stay declarative)
// ---------------------------------------------------------------------------

/** Load a timer row by id, or throw if it no longer exists. */
function loadTimerRow(timerId: Uuid): TimerRow {
  const row = db().getFirstSync<TimerRow>(
    `SELECT ${TIMER_COLS} FROM timer_states WHERE timer_id = ?;`,
    [timerId],
  );
  if (!row) throw new Error(`Timer ${timerId} nicht gefunden.`);
  return row;
}

/** Load a time-entry row by id, or throw. */
function loadEntryRow(entryId: Uuid): TimeEntryRow {
  const row = db().getFirstSync<TimeEntryRow>(
    `SELECT ${ENTRY_COLS} FROM time_entries WHERE id = ?;`,
    [entryId],
  );
  if (!row) throw new Error(`Time entry ${entryId} nicht gefunden.`);
  return row;
}

/**
 * Insert a fresh `running` time entry (live-timer path). The 12 calc fields are
 * zeroed — they are computed by `@ptl/core` at stop time, never here.
 */
function insertRunningEntry(input: CreateEntryInput): Uuid {
  const conn = db();
  const acct = accountId();
  const id = newId();
  const at = nowMs();
  conn.runSync(
    `INSERT INTO time_entries (
       id, main_account_id, project_id, task_id, customer_id, status, timezone,
       actual_started_at, actual_duration_seconds, net_work_duration_seconds,
       billing_duration_seconds, calculation_version, description, is_billable,
       source, is_backdated, device_started_on, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, 0, 0, 0, ?, ?, ?, 'live_timer', 0, ?, ?, ?);`,
    [
      id,
      acct,
      input.project_id ?? null,
      input.task_id ?? null,
      input.customer_id ?? null,
      input.timezone,
      input.actual_started_at,
      CALCULATION_VERSION,
      input.description ?? null,
      input.is_billable === false ? 0 : 1,
      DEVICE_ID,
      at,
      at,
    ],
  );
  return id;
}

export const timer = {
  /** Current persisted timer singleton for the account, or null. */
  async getState(): Promise<TimerState | null> {
    const conn = db();
    const acct = accountId();
    const row = conn.getFirstSync<TimerRow>(
      `SELECT ${TIMER_COLS} FROM timer_states WHERE main_account_id = ?
       ORDER BY started_at DESC LIMIT 1;`,
      [acct],
    );
    return row ? mapTimer(row) : null;
  },

  /** Start a timer: create a `running` time_entry, timer → running. */
  async start(input: StartTimerInput): Promise<TimerState> {
    const conn = db();
    const acct = accountId();

    // Single-timer guard: reject if an active timer already exists.
    const active = conn.getFirstSync<{ timer_id: string }>(
      `SELECT timer_id FROM timer_states
       WHERE main_account_id = ? AND status IN ('running','paused','needs_description')
       LIMIT 1;`,
      [acct],
    );
    if (active) {
      throw new Error("Es läuft bereits ein Timer (Single-Timer-Invariante).");
    }

    const timezone = input.timezone ?? deviceTimezone();
    const startedAt = nowMs();

    // description_required is inherited from the project (doc 11 §7 nr. 4).
    let descriptionRequired = false;
    if (input.project_id) {
      const p = conn.getFirstSync<{ description_required: number | null }>(
        "SELECT description_required FROM projects WHERE id = ?;",
        [input.project_id],
      );
      descriptionRequired = p?.description_required === 1;
    }

    const entryId = insertRunningEntry({
      project_id: input.project_id,
      task_id: input.task_id,
      timezone,
      actual_started_at: startedAt,
      description: input.description,
    });

    // Keep a single timer row per account: drop terminal rows, insert fresh.
    conn.runSync("DELETE FROM timer_states WHERE main_account_id = ?;", [acct]);
    const timerId = newId();
    conn.runSync(
      `INSERT INTO timer_states (
         timer_id, main_account_id, current_time_entry_id, status, project_id,
         task_id, started_at, accumulated_pause_seconds, device_started_on,
         last_modified_by_device, description_required
       ) VALUES (?, ?, ?, 'running', ?, ?, ?, 0, ?, ?, ?);`,
      [
        timerId,
        acct,
        entryId,
        input.project_id ?? null,
        input.task_id ?? null,
        startedAt,
        DEVICE_ID,
        DEVICE_ID,
        descriptionRequired ? 1 : 0,
      ],
    );
    return mapTimer(loadTimerRow(timerId));
  },

  /** Pause: timer → paused, set active_pause_started_at. */
  async pause(timerId: Uuid): Promise<TimerState> {
    const conn = db();
    const t = loadTimerRow(timerId);
    if (t.status !== "running") {
      throw new Error("Timer ist nicht laufend; pause nicht möglich.");
    }
    const at = nowMs();
    conn.runSync(
      `UPDATE timer_states SET status = 'paused', paused_at = ?, active_pause_started_at = ?
       WHERE timer_id = ?;`,
      [at, at, timerId],
    );
    return mapTimer(loadTimerRow(timerId));
  },

  /** Resume: timer → running, fold pause into accumulated_pause_seconds. */
  async resume(timerId: Uuid): Promise<TimerState> {
    const conn = db();
    const t = loadTimerRow(timerId);
    if (t.status !== "paused") {
      throw new Error("Timer ist nicht pausiert; resume nicht möglich.");
    }
    const at = nowMs();
    let accumulated = t.accumulated_pause_seconds;
    if (t.active_pause_started_at !== null) {
      accumulated += durationSeconds(t.active_pause_started_at, at);
    }
    conn.runSync(
      `UPDATE timer_states
       SET status = 'running', accumulated_pause_seconds = ?,
           active_pause_started_at = NULL, paused_at = NULL
       WHERE timer_id = ?;`,
      [accumulated, timerId],
    );
    return mapTimer(loadTimerRow(timerId));
  },

  /**
   * Stop: set actual_ended_at, run the core calc pipeline, persist the 12 calc
   * fields on the entry. If a description is required and missing, the timer
   * lands in `needs_description` and the entry is NOT finalized.
   */
  async stop(timerId: Uuid, input?: StopTimerInput): Promise<TimerState> {
    const conn = db();
    const t = loadTimerRow(timerId);
    if (t.current_time_entry_id === null) {
      throw new Error("Timer hat keinen laufenden Eintrag; stop nicht möglich.");
    }
    const entry = loadEntryRow(t.current_time_entry_id);
    const endedAt = nowMs();

    // Fold any still-open pause into the accumulated pause total.
    let pauseSeconds = t.accumulated_pause_seconds;
    if (t.status === "paused" && t.active_pause_started_at !== null) {
      pauseSeconds += durationSeconds(t.active_pause_started_at, endedAt);
    }

    const description = input?.description ?? entry.description ?? null;

    // Description gate: hold in needs_description, do NOT finalize the entry.
    if (t.description_required === 1 && (description === null || description === "")) {
      conn.runSync(
        `UPDATE timer_states
         SET status = 'needs_description', accumulated_pause_seconds = ?,
             active_pause_started_at = NULL, paused_at = NULL
         WHERE timer_id = ?;`,
        [pauseSeconds, timerId],
      );
      return mapTimer(loadTimerRow(timerId));
    }

    // Model accumulated pause as a single break for the core pipeline.
    const breaks =
      pauseSeconds > 0
        ? [
            {
              started_at: entry.actual_started_at,
              ended_at: entry.actual_started_at + pauseSeconds * 1000,
            },
          ]
        : [];

    const calc = calculateEntry(
      {
        actual_started_at: entry.actual_started_at,
        actual_ended_at: endedAt,
        timezone: entry.timezone,
        breaks,
      },
      DEFAULT_ROUNDING_RULE,
      DEFAULT_RATE,
    );

    const isBillable = input?.is_billable ?? entry.is_billable === 1;
    const at = nowMs();
    conn.runSync(
      `UPDATE time_entries SET
         status = 'completed', actual_ended_at = ?, actual_duration_seconds = ?,
         break_duration_seconds = ?, net_work_duration_seconds = ?,
         billing_duration_seconds = ?, rounding_rule_id = ?,
         rounding_delta_seconds = ?, rounding_reason = ?, calculation_version = ?,
         rate_snapshot = ?, billing_amount_snapshot = ?, description = ?,
         is_billable = ?, updated_at = ?
       WHERE id = ?;`,
      [
        calc.actual_ended_at,
        calc.actual_duration_seconds,
        calc.break_duration_seconds,
        calc.net_work_duration_seconds,
        calc.billing_duration_seconds,
        calc.rounding_rule_id,
        calc.rounding_delta_seconds,
        calc.rounding_reason,
        calc.calculation_version,
        JSON.stringify(calc.rate_snapshot),
        calc.billing_amount_snapshot,
        description,
        isBillable ? 1 : 0,
        at,
        entry.id,
      ],
    );
    conn.runSync(
      `UPDATE timer_states
       SET status = 'stopped', accumulated_pause_seconds = ?,
           active_pause_started_at = NULL, paused_at = NULL
       WHERE timer_id = ?;`,
      [pauseSeconds, timerId],
    );
    return mapTimer(loadTimerRow(timerId));
  },
} as const;

// ===========================================================================
// entries — time entries (doc 11 §7 nr. 6, nr. 11–13)
// ===========================================================================

function loadEntry(id: Uuid): TimeEntryRow {
  const row = db().getFirstSync<TimeEntryRow>(
    `SELECT ${ENTRY_COLS} FROM time_entries WHERE id = ?;`,
    [id],
  );
  if (!row) throw new Error(`time entry ${id} not found`);
  return row;
}

export const entries = {
  /** Entries whose start falls in [fromMs, toMs) for the account, newest first. */
  async inRange(fromMs: EpochMs, toMs: EpochMs): Promise<TimeEntry[]> {
    const rows = db().getAllSync<TimeEntryRow>(
      `SELECT ${ENTRY_COLS} FROM time_entries
       WHERE main_account_id = ? AND actual_started_at >= ? AND actual_started_at < ?
         AND deleted_at IS NULL
       ORDER BY actual_started_at DESC;`,
      [accountId(), fromMs, toMs],
    );
    return rows.map(mapEntry);
  },
  /** Create a live entry (used by the timer path). */
  async create(input: CreateEntryInput): Promise<TimeEntry> {
    const id = newId();
    const now = nowMs();
    db().runSync(
      `INSERT INTO time_entries
         (id, main_account_id, project_id, task_id, customer_id, status, timezone,
          actual_started_at, actual_duration_seconds, break_duration_seconds,
          net_work_duration_seconds, billing_duration_seconds, calculation_version,
          description, is_billable, source, is_backdated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?, 0, 0, 0, 0, ?, ?, ?, 'live_timer', 0, ?, ?);`,
      [
        id,
        accountId(),
        input.project_id ?? null,
        input.task_id ?? null,
        input.customer_id ?? null,
        input.timezone,
        input.actual_started_at,
        CALCULATION_VERSION,
        input.description ?? null,
        input.is_billable === false ? 0 : 1,
        now,
        now,
      ],
    );
    return mapEntry(loadEntry(id));
  },
  /**
   * Backdate a completed entry (manual). Runs the full core calc pipeline;
   * source = "manual_backdated", is_backdated = true.
   */
  async backdate(input: BackdateEntryInput): Promise<TimeEntry> {
    const calc = calculateEntry(
      {
        actual_started_at: input.actual_started_at,
        actual_ended_at: input.actual_ended_at,
        timezone: input.timezone,
        breaks: (input.breaks ?? []).map((b) => ({
          started_at: b.started_at,
          ended_at: b.ended_at ?? input.actual_ended_at,
        })),
      },
      DEFAULT_ROUNDING_RULE,
      DEFAULT_RATE,
    );
    const id = newId();
    const now = nowMs();
    db().runSync(
      `INSERT INTO time_entries
         (id, main_account_id, project_id, task_id, customer_id, status, timezone,
          actual_started_at, actual_ended_at, actual_duration_seconds, break_duration_seconds,
          net_work_duration_seconds, billing_duration_seconds, rounding_rule_id,
          rounding_delta_seconds, rounding_reason, calculation_version, billing_amount_snapshot,
          description, is_billable, source, backdate_reason, is_backdated, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'stopped', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual_backdated', ?, 1, ?, ?);`,
      [
        id,
        accountId(),
        input.project_id ?? null,
        input.task_id ?? null,
        input.customer_id ?? null,
        input.timezone,
        input.actual_started_at,
        input.actual_ended_at,
        calc.actual_duration_seconds,
        calc.break_duration_seconds,
        calc.net_work_duration_seconds,
        calc.billing_duration_seconds,
        calc.rounding_rule_id,
        calc.rounding_delta_seconds,
        calc.rounding_reason,
        calc.calculation_version,
        calc.billing_amount_snapshot,
        input.description ?? null,
        input.is_billable === false ? 0 : 1,
        input.backdate_reason ?? null,
        now,
        now,
      ],
    );
    return mapEntry(loadEntry(id));
  },
} as const;

// ===========================================================================
// customers / projects / tasks — master data (doc 11 §7 nr. 7, nr. 8)
// ===========================================================================

export const customers = {
  async list(): Promise<Customer[]> {
    const rows = db().getAllSync<Parameters<typeof mapCustomer>[0]>(
      `SELECT ${CUSTOMER_COLS} FROM customers WHERE main_account_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ASC;`,
      [accountId()],
    );
    return rows.map(mapCustomer);
  },
  async create(input: CustomerInput): Promise<Customer> {
    const id = newId();
    const now = nowMs();
    db().runSync(
      `INSERT INTO customers (id, main_account_id, name, company, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?);`,
      [id, accountId(), input.name, input.company ?? null, now, now],
    );
    const row = db().getFirstSync<Parameters<typeof mapCustomer>[0]>(
      `SELECT ${CUSTOMER_COLS} FROM customers WHERE id = ?;`,
      [id],
    );
    return mapCustomer(row!);
  },
} as const;

export const projects = {
  async list(): Promise<Project[]> {
    const rows = db().getAllSync<Parameters<typeof mapProject>[0]>(
      `SELECT ${PROJECT_COLS} FROM projects WHERE main_account_id = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE ASC;`,
      [accountId()],
    );
    return rows.map(mapProject);
  },
  async create(input: ProjectInput): Promise<Project> {
    const id = newId();
    const now = nowMs();
    db().runSync(
      `INSERT INTO projects (id, main_account_id, name, customer_id, billing_type, status, description_required, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?);`,
      [
        id,
        accountId(),
        input.name,
        input.customer_id ?? null,
        input.billing_type,
        input.description_required ? 1 : 0,
        now,
        now,
      ],
    );
    const row = db().getFirstSync<Parameters<typeof mapProject>[0]>(
      `SELECT ${PROJECT_COLS} FROM projects WHERE id = ?;`,
      [id],
    );
    return mapProject(row!);
  },
} as const;

export const tasks = {
  /** All tasks, or only those for `projectId` when given. */
  async list(projectId?: Uuid): Promise<Task[]> {
    const rows = projectId
      ? db().getAllSync<Parameters<typeof mapTask>[0]>(
          `SELECT ${TASK_COLS} FROM tasks WHERE main_account_id = ? AND (project_id = ? OR project_id IS NULL) AND deleted_at IS NULL ORDER BY name ASC;`,
          [accountId(), projectId],
        )
      : db().getAllSync<Parameters<typeof mapTask>[0]>(
          `SELECT ${TASK_COLS} FROM tasks WHERE main_account_id = ? AND deleted_at IS NULL ORDER BY name ASC;`,
          [accountId()],
        );
    return rows.map(mapTask);
  },
  async create(input: TaskInput): Promise<Task> {
    const id = newId();
    const now = nowMs();
    db().runSync(
      `INSERT INTO tasks (id, main_account_id, project_id, name, default_billable, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?);`,
      [
        id,
        accountId(),
        input.project_id ?? null,
        input.name,
        input.default_billable === false ? 0 : 1,
        now,
        now,
      ],
    );
    const row = db().getFirstSync<Parameters<typeof mapTask>[0]>(
      `SELECT ${TASK_COLS} FROM tasks WHERE id = ?;`,
      [id],
    );
    return mapTask(row!);
  },
} as const;

// ===========================================================================
// settings — account-scoped key/value (doc 06 settings)
// ===========================================================================

export const settings = {
  /** Read an account-scoped setting (JSON-decoded), or null if unset. */
  async get<T = unknown>(key: string): Promise<T | null> {
    const row = db().getFirstSync<{ value_json: string }>(
      `SELECT value_json FROM settings WHERE main_account_id = ? AND key = ? LIMIT 1;`,
      [accountId(), key],
    );
    if (!row) return null;
    try {
      return JSON.parse(row.value_json) as T;
    } catch {
      return null;
    }
  },
  /** Upsert an account-scoped setting (JSON-encoded into value_json). */
  async set<T = unknown>(key: string, value: T): Promise<void> {
    const now = nowMs();
    const json = JSON.stringify(value);
    const updated = db().runSync(
      `UPDATE settings SET value_json = ?, updated_at = ? WHERE main_account_id = ? AND key = ?;`,
      [json, now, accountId(), key],
    );
    if (updated.changes === 0) {
      db().runSync(
        `INSERT INTO settings (id, main_account_id, scope, key, value_json, created_at, updated_at)
         VALUES (?, ?, 'account', ?, ?, ?, ?);`,
        [newId(), accountId(), key, json, now, now],
      );
    }
  },
} as const;
