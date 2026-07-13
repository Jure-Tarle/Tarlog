/**
 * lib/timer/service.ts — Timer-State-Machine-Orchestrierung (doc 04 §3/§4).
 *
 * start (Single-Timer, 409 bei laufendem Timer via Compare-and-Set +
 * conflict_records), pause, resume (Pause → time_entry_breaks +
 * accumulated_pause_seconds), stop (Finalisierung via @tarlog/core calculateEntry
 * mit aufgelöster Rundungsregel Projekt>Kunde>Default und Rate Task>…>Default;
 * Pflichtbeschreibung fehlt → Status needs_description), switch (Projekt/Task).
 *
 * Jede Mutation läuft durch `applyMutation`: Advisory-Lock, server_revision++,
 * audit_logs, publishEvent (siehe lib/sync/mutation.ts). Compare-and-Set über
 * timer_states.server_revision (optimistisches Locking, doc 04 §4b).
 */
import { uuidv7 } from "uuidv7";
import {
  CALCULATION_VERSION,
  calculateEntry,
  resolveDayBoundary,
  spansMidnight,
  type RateSnapshot,
} from "@tarlog/core";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  applyMutation,
  insertConflictRecord,
  type ConflictReason,
  type MutationContext,
  type MutationOutput,
} from "@/lib/sync/mutation";
import {
  loadAccountDefaults,
  loadActiveTimer,
  loadBreaksForEntry,
  loadCustomer,
  loadProject,
  loadTask,
  loadTimeEntry,
  loadTimerById,
  mapEntry,
  type TimeEntryRow,
  type TimerRow,
} from "./repository.js";
import { resolveEntryRate, resolveRoundingRule } from "./rates.js";
import type {
  TimerPauseBody,
  TimerResumeBody,
  TimerStartBody,
  TimerStopBody,
  TimerSwitchBody,
} from "./schemas.js";

/** actor_id für audit_logs (NOT NULL) aus dem Auth-Kontext ableiten. */
function actorId(auth: AuthContext): string {
  return auth.user_id ?? auth.device_id ?? auth.main_account_id;
}

/** Timer-Mutationen brauchen ein Gerät (timer_states.device_started_on NOT NULL). */
function requireDevice(auth: AuthContext): string {
  if (!auth.device_id) {
    throw new ApiError(
      "bad_request",
      "Kein Gerät im Auth-Kontext (device_id erforderlich für Timer-Mutationen).",
    );
  }
  return auth.device_id;
}

interface ConflictInfo {
  conflict_case: number;
  message: string;
  conflict_id: string;
  server_version: TimerRow;
  local_version?: Record<string, unknown>;
}

interface OpResult {
  conflict?: ConflictInfo;
  timer?: TimerRow | null;
  time_entry?: TimeEntryRow | null;
  needs_description?: boolean;
}

/** Compare-and-Set: liegt eine erwartete Revision an, muss sie stimmen. */
function casMismatch(timer: TimerRow, expected: number | null | undefined): boolean {
  if (expected == null) return false;
  return (timer.server_revision ?? 0) !== expected;
}

async function casConflict(
  ctx: MutationContext,
  params: {
    mainAccountId: string;
    existing: TimerRow;
    conflict_case: number;
    reason: ConflictReason;
    message: string;
    correlationId?: string | null;
  },
): Promise<MutationOutput<OpResult>> {
  const conflictId = await insertConflictRecord(ctx, {
    main_account_id: params.mainAccountId,
    entity_type: "timer_states",
    entity_id: params.existing.timer_id,
    conflict_case: params.conflict_case,
    local_version: {},
    server_version: params.existing as unknown as Record<string, unknown>,
    reason: params.reason,
    correlation_id: params.correlationId,
  });
  return {
    result: {
      conflict: {
        conflict_case: params.conflict_case,
        message: params.message,
        conflict_id: conflictId,
        server_version: params.existing,
      },
    },
    audit: {
      action: "sync_conflict_resolved",
      entity_type: "timer_states",
      entity_id: params.existing.timer_id,
      before: params.existing as unknown as Record<string, unknown>,
      after: null,
      reason: params.reason,
    },
    event: {
      type: "sync.conflict",
      entity_type: "conflict_records",
      entity_id: conflictId,
      operation: "create",
      data: { conflict_case: params.conflict_case, timer_id: params.existing.timer_id },
    },
  };
}

function throwIfConflict(result: OpResult): void {
  if (result.conflict) {
    throw new ApiError("conflict", result.conflict.message, {
      conflict_case: result.conflict.conflict_case,
      conflict_id: result.conflict.conflict_id,
      server_version: result.conflict.server_version,
    });
  }
}

interface StartContext {
  project_id: string | null;
  task_id: string | null;
  customer_id: string | null;
  timezone: string;
  description_required: boolean;
  is_billable: boolean;
}

async function resolveStartContext(
  ctx: MutationContext,
  mainAccountId: string,
  projectId: string | null | undefined,
  taskId: string | null | undefined,
): Promise<StartContext> {
  const acct = await loadAccountDefaults(ctx.client, mainAccountId);
  const task = taskId ? await loadTask(ctx.client, taskId, mainAccountId) : null;
  const effProjectId = projectId ?? task?.project_id ?? null;
  const project = effProjectId
    ? await loadProject(ctx.client, effProjectId, mainAccountId)
    : null;
  const nonBillableProject = project?.billing_type === "non_billable";
  const isBillable = task
    ? task.default_billable && !nonBillableProject
    : !nonBillableProject;
  return {
    project_id: effProjectId,
    task_id: task?.id ?? null,
    customer_id: project?.customer_id ?? null,
    timezone: acct.default_timezone,
    description_required: project?.description_required ?? false,
    is_billable: isBillable,
  };
}

async function insertRunningEntry(
  ctx: MutationContext,
  p: {
    id: string;
    mainAccountId: string;
    project_id: string | null;
    task_id: string | null;
    customer_id: string | null;
    timezone: string;
    startedAt: number;
    isBillable: boolean;
    device: string;
    description: string | null;
    localRevision: number;
  },
): Promise<void> {
  await ctx.client.query(
    `INSERT INTO time_entries
       (id, main_account_id, project_id, task_id, customer_id, status, timezone,
        actual_started_at, actual_ended_at, actual_duration_seconds,
        break_duration_seconds, net_work_duration_seconds, billing_duration_seconds,
        calculation_version, description, is_billable, client_visible, source,
        is_backdated, crosses_midnight, clock_trust, device_started_on,
        created_at, updated_at, sync_version, server_revision, local_revision,
        hlc, last_modified_by_device)
     VALUES ($1,$2,$3,$4,$5,'running',$6,$7,NULL,0,0,0,0,$8,$9,$10,true,'live_timer',
             false,false,'trusted',$11,$12,$12,0,$13,$14,$15,$11)`,
    [
      p.id,
      p.mainAccountId,
      p.project_id,
      p.task_id,
      p.customer_id,
      p.timezone,
      p.startedAt,
      CALCULATION_VERSION,
      p.description,
      p.isBillable,
      p.device,
      ctx.now,
      ctx.rev,
      p.localRevision,
      ctx.hlc,
    ],
  );
}

async function insertTimerRow(
  ctx: MutationContext,
  p: {
    timerId: string;
    mainAccountId: string;
    entryId: string;
    project_id: string | null;
    task_id: string | null;
    startedAt: number;
    device: string;
    descriptionRequired: boolean;
    billingStatus: "billable" | "non_billable" | "undecided";
    localRevision: number;
  },
): Promise<void> {
  await ctx.client.query(
    `INSERT INTO timer_states
       (timer_id, main_account_id, current_time_entry_id, status, project_id,
        task_id, started_at, accumulated_pause_seconds, device_started_on,
        last_modified_by_device, sync_version, server_revision, local_revision,
        description_required, billing_status)
     VALUES ($1,$2,$3,'running',$4,$5,$6,0,$7,$7,0,$8,$9,$10,$11)`,
    [
      p.timerId,
      p.mainAccountId,
      p.entryId,
      p.project_id,
      p.task_id,
      p.startedAt,
      p.device,
      ctx.rev,
      p.localRevision,
      p.descriptionRequired,
      p.billingStatus,
    ],
  );
}

async function insertBreakRow(
  ctx: MutationContext,
  p: {
    mainAccountId: string;
    entryId: string;
    startedAt: number;
    endedAt: number;
    device: string;
    localRevision: number;
  },
): Promise<number> {
  const dur = Math.max(0, Math.floor((p.endedAt - p.startedAt) / 1000));
  await ctx.client.query(
    `INSERT INTO time_entry_breaks
       (id, main_account_id, time_entry_id, started_at, ended_at, duration_seconds,
        kind, counts_as_rest, created_at, updated_at, sync_version, server_revision,
        local_revision, hlc, last_modified_by_device)
     VALUES ($1,$2,$3,$4,$5,$6,'manual',true,$7,$7,0,$8,$9,$10,$11)`,
    [
      uuidv7(),
      p.mainAccountId,
      p.entryId,
      p.startedAt,
      p.endedAt,
      dur,
      ctx.now,
      ctx.rev,
      p.localRevision,
      ctx.hlc,
      p.device,
    ],
  );
  return dur;
}

// ===========================================================================
// Öffentliche Operationen
// ===========================================================================

export interface TimerOpResult {
  timer: TimerRow | null;
  time_entry?: TimeEntryRow | null;
  needs_description?: boolean;
  server_revision: number;
  hlc: string;
}

/** GET-Helfer: aktueller/zuletzt geänderter Timer (ohne Mutation). */
export { loadCurrentTimer } from "./repository.js";

export async function startTimer(
  auth: AuthContext,
  body: TimerStartBody,
): Promise<TimerOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const startedAt = body.started_at ?? Date.now();
  const localRevision = body.local_revision ?? 0;

  const res = await applyMutation<OpResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const existing = await loadActiveTimer(ctx.client, mainAccountId);
      if (existing) {
        const conflictId = await insertConflictRecord(ctx, {
          main_account_id: mainAccountId,
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          conflict_case: 1,
          local_version: {
            project_id: body.project_id ?? null,
            task_id: body.task_id ?? null,
            started_at: startedAt,
            device_started_on: device,
          },
          server_version: existing as unknown as Record<string, unknown>,
          reason: "single_timer_violation",
          correlation_id: body.correlation_id,
        });
        return {
          result: {
            conflict: {
              conflict_case: 1,
              message: "Es läuft bereits ein aktiver Timer (Single-Timer-Regel).",
              conflict_id: conflictId,
              server_version: existing,
            },
          },
          audit: {
            action: "sync_conflict_resolved",
            entity_type: "timer_states",
            entity_id: existing.timer_id,
            before: existing as unknown as Record<string, unknown>,
            after: null,
            reason: "single_timer_violation",
          },
          event: {
            type: "sync.conflict",
            entity_type: "conflict_records",
            entity_id: conflictId,
            operation: "create",
            data: { conflict_case: 1, timer_id: existing.timer_id },
          },
        };
      }

      const sc = await resolveStartContext(ctx, mainAccountId, body.project_id, body.task_id);
      const timezone = body.timezone ?? sc.timezone;
      const entryId = uuidv7();
      const timerId = uuidv7();
      const billingStatus: "billable" | "non_billable" = sc.is_billable
        ? "billable"
        : "non_billable";

      await insertRunningEntry(ctx, {
        id: entryId,
        mainAccountId,
        project_id: sc.project_id,
        task_id: sc.task_id,
        customer_id: sc.customer_id,
        timezone,
        startedAt,
        isBillable: sc.is_billable,
        device,
        description: body.description ?? null,
        localRevision,
      });
      await insertTimerRow(ctx, {
        timerId,
        mainAccountId,
        entryId,
        project_id: sc.project_id,
        task_id: sc.task_id,
        startedAt,
        device,
        descriptionRequired: sc.description_required,
        billingStatus,
        localRevision,
      });
      const timer = await loadTimerById(ctx.client, timerId, mainAccountId);
      return {
        result: { timer },
        audit: {
          action: "timer_started",
          entity_type: "timer_states",
          entity_id: timerId,
          after: {
            project_id: sc.project_id,
            task_id: sc.task_id,
            started_at: startedAt,
            time_entry_id: entryId,
          },
        },
        event: {
          type: "timer.started",
          entity_type: "timer_states",
          entity_id: timerId,
          operation: "update",
          data: {
            timer_id: timerId,
            time_entry_id: entryId,
            project_id: sc.project_id,
            task_id: sc.task_id,
            started_at: startedAt,
            status: "running",
          },
        },
      };
    },
  });

  throwIfConflict(res.result);
  return { timer: res.result.timer ?? null, server_revision: res.server_revision, hlc: res.hlc };
}

async function loadOpTimer(
  ctx: MutationContext,
  mainAccountId: string,
  timerId: string | null | undefined,
): Promise<TimerRow | null> {
  return timerId
    ? loadTimerById(ctx.client, timerId, mainAccountId)
    : loadActiveTimer(ctx.client, mainAccountId);
}

export async function pauseTimer(
  auth: AuthContext,
  body: TimerPauseBody,
): Promise<TimerOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;

  const res = await applyMutation<OpResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const existing = await loadOpTimer(ctx, mainAccountId, body.timer_id);
      if (!existing) throw new ApiError("not_found", "Kein aktiver Timer gefunden.");
      if (existing.status !== "running") {
        throw new ApiError("conflict", "Timer ist nicht im Zustand 'running'.", {
          server_version: existing,
        });
      }
      if (casMismatch(existing, body.expected_server_revision)) {
        return casConflict(ctx, {
          mainAccountId,
          existing,
          conflict_case: 2,
          reason: "field_lww",
          message: "Timer wurde zwischenzeitlich serverseitig geändert (Compare-and-Set).",
          correlationId: body.correlation_id,
        });
      }
      await ctx.client.query(
        `UPDATE timer_states
            SET status='paused', paused_at=$1, active_pause_started_at=$1,
                server_revision=$2, sync_version=sync_version+1, local_revision=$3,
                last_modified_by_device=$4
          WHERE timer_id=$5`,
        [ctx.now, ctx.rev, localRevision, device, existing.timer_id],
      );
      const timer = await loadTimerById(ctx.client, existing.timer_id, mainAccountId);
      return {
        result: { timer },
        audit: {
          action: "timer_paused",
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          before: existing as unknown as Record<string, unknown>,
          after: { status: "paused", paused_at: ctx.now },
        },
        event: {
          type: "timer.paused",
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          operation: "update",
          data: { timer_id: existing.timer_id, status: "paused", paused_at: ctx.now },
        },
      };
    },
  });

  throwIfConflict(res.result);
  return { timer: res.result.timer ?? null, server_revision: res.server_revision, hlc: res.hlc };
}

export async function resumeTimer(
  auth: AuthContext,
  body: TimerResumeBody,
): Promise<TimerOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;

  const res = await applyMutation<OpResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const existing = await loadOpTimer(ctx, mainAccountId, body.timer_id);
      if (!existing) throw new ApiError("not_found", "Kein aktiver Timer gefunden.");
      if (existing.status !== "paused") {
        throw new ApiError("conflict", "Timer ist nicht im Zustand 'paused'.", {
          server_version: existing,
        });
      }
      if (casMismatch(existing, body.expected_server_revision)) {
        return casConflict(ctx, {
          mainAccountId,
          existing,
          conflict_case: 2,
          reason: "field_lww",
          message: "Timer wurde zwischenzeitlich serverseitig geändert (Compare-and-Set).",
          correlationId: body.correlation_id,
        });
      }
      const pauseStart = existing.active_pause_started_at;
      let addSeconds = 0;
      if (pauseStart != null && existing.current_time_entry_id) {
        addSeconds = await insertBreakRow(ctx, {
          mainAccountId,
          entryId: existing.current_time_entry_id,
          startedAt: pauseStart,
          endedAt: ctx.now,
          device,
          localRevision,
        });
      }
      await ctx.client.query(
        `UPDATE timer_states
            SET status='running', active_pause_started_at=NULL,
                accumulated_pause_seconds=accumulated_pause_seconds+$1,
                server_revision=$2, sync_version=sync_version+1, local_revision=$3,
                last_modified_by_device=$4
          WHERE timer_id=$5`,
        [addSeconds, ctx.rev, localRevision, device, existing.timer_id],
      );
      const timer = await loadTimerById(ctx.client, existing.timer_id, mainAccountId);
      return {
        result: { timer },
        audit: {
          action: "timer_resumed",
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          before: existing as unknown as Record<string, unknown>,
          after: { status: "running", added_pause_seconds: addSeconds },
        },
        event: {
          type: "timer.resumed",
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          operation: "update",
          data: {
            timer_id: existing.timer_id,
            status: "running",
            accumulated_pause_seconds: existing.accumulated_pause_seconds + addSeconds,
          },
        },
      };
    },
  });

  throwIfConflict(res.result);
  return { timer: res.result.timer ?? null, server_revision: res.server_revision, hlc: res.hlc };
}

export async function stopTimer(
  auth: AuthContext,
  body: TimerStopBody,
): Promise<TimerOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;

  const res = await applyMutation<OpResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const existing = await loadOpTimer(ctx, mainAccountId, body.timer_id);
      if (!existing) throw new ApiError("not_found", "Kein aktiver Timer gefunden.");
      if (existing.status !== "running" && existing.status !== "paused") {
        throw new ApiError("conflict", "Timer ist nicht aktiv (running/paused).", {
          server_version: existing,
        });
      }
      if (casMismatch(existing, body.expected_server_revision)) {
        return casConflict(ctx, {
          mainAccountId,
          existing,
          conflict_case: 2,
          reason: "timer_stopped_remote",
          message: "Timer wurde zwischenzeitlich serverseitig geändert (Compare-and-Set).",
          correlationId: body.correlation_id,
        });
      }

      const entryId = existing.current_time_entry_id;
      const entry = entryId ? await loadTimeEntry(ctx.client, entryId, mainAccountId) : null;
      if (!entry || !entryId) {
        throw new ApiError("not_found", "Zum Timer gehört kein Zeiteintrag.");
      }
      const endAt = body.ended_at ?? ctx.now;
      const description =
        body.description != null && body.description.trim() !== ""
          ? body.description
          : entry.description;

      // Pflichtbeschreibung fehlt → needs_description, NICHT finalisieren.
      if (existing.description_required && (!description || description.trim() === "")) {
        await ctx.client.query(
          `UPDATE timer_states
              SET status='needs_description', server_revision=$1,
                  sync_version=sync_version+1, local_revision=$2,
                  last_modified_by_device=$3
            WHERE timer_id=$4`,
          [ctx.rev, localRevision, device, existing.timer_id],
        );
        const timer = await loadTimerById(ctx.client, existing.timer_id, mainAccountId);
        return {
          result: { timer, needs_description: true },
          audit: {
            action: "timer_stopped",
            entity_type: "timer_states",
            entity_id: existing.timer_id,
            before: existing as unknown as Record<string, unknown>,
            after: { status: "needs_description" },
            reason: "needs_description",
          },
          event: {
            type: "timer.stopped",
            entity_type: "timer_states",
            entity_id: existing.timer_id,
            operation: "update",
            data: {
              timer_id: existing.timer_id,
              status: "needs_description",
              requires_description: true,
            },
          },
        };
      }

      // Laufende Pause bei Stop aus 'paused' abschließen.
      if (existing.status === "paused" && existing.active_pause_started_at != null) {
        await insertBreakRow(ctx, {
          mainAccountId,
          entryId,
          startedAt: existing.active_pause_started_at,
          endedAt: endAt,
          device,
          localRevision,
        });
      }

      const breaks = await loadBreaksForEntry(ctx.client, entryId);
      const onDate = resolveDayBoundary(entry.actual_started_at, entry.timezone);
      const project = entry.project_id
        ? await loadProject(ctx.client, entry.project_id, mainAccountId)
        : null;
      const customer = entry.customer_id
        ? await loadCustomer(ctx.client, entry.customer_id, mainAccountId)
        : project?.customer_id
          ? await loadCustomer(ctx.client, project.customer_id, mainAccountId)
          : null;
      const task = entry.task_id ? await loadTask(ctx.client, entry.task_id, mainAccountId) : null;
      const acct = await loadAccountDefaults(ctx.client, mainAccountId);

      const rounding = await resolveRoundingRule(ctx.client, {
        mainAccountId,
        projectRoundingRuleId: project?.rounding_rule_id,
        customerRoundingRuleId: customer?.default_rounding_rule_id,
        onDate,
      });
      const rate: RateSnapshot = await resolveEntryRate(ctx.client, {
        mainAccountId,
        taskId: entry.task_id,
        projectId: entry.project_id,
        customerId: customer?.id ?? entry.customer_id,
        taskRateCents: task?.default_hourly_rate_cents,
        projectRateCents: project?.hourly_rate_cents,
        customerRateCents: customer?.default_hourly_rate_cents,
        customerCurrency: customer?.default_currency,
        defaultCurrency: acct.default_currency,
        onDate,
      });

      const calcInput = {
        actual_started_at: entry.actual_started_at,
        actual_ended_at: endAt,
        timezone: entry.timezone,
        breaks,
      };
      const calc = calculateEntry(calcInput, rounding.rule, rate);
      const crosses = spansMidnight(calcInput);
      const isBillable = body.is_billable ?? entry.is_billable;

      await ctx.client.query(
        `UPDATE time_entries
            SET status='completed', actual_ended_at=$1, actual_duration_seconds=$2,
                break_duration_seconds=$3, net_work_duration_seconds=$4,
                billing_duration_seconds=$5, rounding_rule_id=$6,
                rounding_delta_seconds=$7, rounding_reason=$8, calculation_version=$9,
                rate_snapshot=$10, billing_amount_snapshot=$11, description=$12,
                is_billable=$13, crosses_midnight=$14, server_received_at=$15,
                updated_at=$15, server_revision=$16, sync_version=sync_version+1,
                local_revision=$17, hlc=$18, last_modified_by_device=$19
          WHERE id=$20 AND main_account_id=$21`,
        [
          endAt,
          calc.actual_duration_seconds,
          calc.break_duration_seconds,
          calc.net_work_duration_seconds,
          calc.billing_duration_seconds,
          rounding.rule_id,
          calc.rounding_delta_seconds,
          calc.rounding_reason,
          calc.calculation_version,
          JSON.stringify(calc.rate_snapshot),
          calc.billing_amount_snapshot,
          description,
          isBillable,
          crosses,
          ctx.now,
          ctx.rev,
          localRevision,
          ctx.hlc,
          device,
          entryId,
          mainAccountId,
        ],
      );
      await ctx.client.query(
        `UPDATE timer_states
            SET status='stopped', server_revision=$1, sync_version=sync_version+1,
                local_revision=$2, last_modified_by_device=$3
          WHERE timer_id=$4`,
        [ctx.rev, localRevision, device, existing.timer_id],
      );

      const timer = await loadTimerById(ctx.client, existing.timer_id, mainAccountId);
      const finalized = await loadTimeEntry(ctx.client, entryId, mainAccountId);
      return {
        result: { timer, time_entry: finalized },
        audit: {
          action: "timer_stopped",
          entity_type: "time_entries",
          entity_id: entryId,
          before: entry as unknown as Record<string, unknown>,
          after: {
            status: "completed",
            billing_duration_seconds: calc.billing_duration_seconds,
            billing_amount_snapshot: calc.billing_amount_snapshot,
          },
        },
        event: {
          type: "timer.stopped",
          entity_type: "time_entries",
          entity_id: entryId,
          operation: "update",
          data: {
            timer_id: existing.timer_id,
            time_entry_id: entryId,
            status: "completed",
            billing_duration_seconds: calc.billing_duration_seconds,
            net_work_duration_seconds: calc.net_work_duration_seconds,
          },
        },
      };
    },
  });

  throwIfConflict(res.result);
  return {
    timer: res.result.timer ?? null,
    time_entry: res.result.time_entry ?? null,
    needs_description: res.result.needs_description ?? false,
    server_revision: res.server_revision,
    hlc: res.hlc,
  };
}

export async function switchTimer(
  auth: AuthContext,
  body: TimerSwitchBody,
): Promise<TimerOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;

  const res = await applyMutation<OpResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const existing = await loadOpTimer(ctx, mainAccountId, body.timer_id);
      if (!existing) throw new ApiError("not_found", "Kein aktiver Timer gefunden.");
      if (existing.status !== "running" && existing.status !== "paused") {
        throw new ApiError("conflict", "Timer ist nicht aktiv (running/paused).", {
          server_version: existing,
        });
      }
      if (casMismatch(existing, body.expected_server_revision)) {
        return casConflict(ctx, {
          mainAccountId,
          existing,
          conflict_case: 2,
          reason: "field_lww",
          message: "Timer wurde zwischenzeitlich serverseitig geändert (Compare-and-Set).",
          correlationId: body.correlation_id,
        });
      }
      const sc = await resolveStartContext(ctx, mainAccountId, body.project_id, body.task_id);
      const billingStatus: "billable" | "non_billable" = sc.is_billable
        ? "billable"
        : "non_billable";
      const projectChanged = (existing.project_id ?? null) !== sc.project_id;
      const taskChanged = (existing.task_id ?? null) !== sc.task_id;

      await ctx.client.query(
        `UPDATE timer_states
            SET project_id=$1, task_id=$2, description_required=$3, billing_status=$4,
                server_revision=$5, sync_version=sync_version+1, local_revision=$6,
                last_modified_by_device=$7
          WHERE timer_id=$8`,
        [
          sc.project_id,
          sc.task_id,
          sc.description_required,
          billingStatus,
          ctx.rev,
          localRevision,
          device,
          existing.timer_id,
        ],
      );
      if (existing.current_time_entry_id) {
        await ctx.client.query(
          `UPDATE time_entries
              SET project_id=$1, task_id=$2, customer_id=$3, is_billable=$4,
                  updated_at=$5, server_revision=$6, sync_version=sync_version+1,
                  local_revision=$7, hlc=$8, last_modified_by_device=$9
            WHERE id=$10 AND main_account_id=$11`,
          [
            sc.project_id,
            sc.task_id,
            sc.customer_id,
            sc.is_billable,
            ctx.now,
            ctx.rev,
            localRevision,
            ctx.hlc,
            device,
            existing.current_time_entry_id,
            mainAccountId,
          ],
        );
      }
      const timer = await loadTimerById(ctx.client, existing.timer_id, mainAccountId);
      const audits = [];
      if (projectChanged) {
        audits.push({
          action: "project_changed" as const,
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          before: { project_id: existing.project_id },
          after: { project_id: sc.project_id },
        });
      }
      if (taskChanged || audits.length === 0) {
        audits.push({
          action: "task_changed" as const,
          entity_type: "timer_states",
          entity_id: existing.timer_id,
          before: { task_id: existing.task_id },
          after: { task_id: sc.task_id },
        });
      }
      return {
        result: { timer },
        audit: audits,
        event: {
          type: "time_entry.updated",
          entity_type: "time_entries",
          entity_id: existing.current_time_entry_id ?? existing.timer_id,
          operation: "update",
          data: {
            timer_id: existing.timer_id,
            project_id: sc.project_id,
            task_id: sc.task_id,
          },
        },
      };
    },
  });

  throwIfConflict(res.result);
  return { timer: res.result.timer ?? null, server_revision: res.server_revision, hlc: res.hlc };
}

export { mapEntry };
