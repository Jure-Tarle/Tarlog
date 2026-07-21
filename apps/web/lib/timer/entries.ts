/**
 * lib/timer/entries.ts, Zeiteinträge CRUD + Nachtrag (doc 03 §7, doc 04 §5).
 *
 * create: Live-/Nachtrag-Eintrag (source, backdate_reason aus 11 Gründen,
 * Pausen als time_entry_breaks) → @tarlog/core calculateEntry mit aufgelöster
 * Rundung (Projekt>Kunde>Default) + Rate (Task>…>Default).
 * update: Feld-Änderung + Neuberechnung bei Zeit-/Pausenänderung; optimistische
 * Sperre über sync_version (Konfliktfall 6/7); Edit auf gelöschtem Eintrag =
 * Konfliktfall 9. delete: Soft-Delete.
 *
 * Jede Mutation: applyMutation (server_revision++, audit_logs, publishEvent).
 */
import { uuidv7 } from "uuidv7";
import {
  CALCULATION_VERSION,
  calculateEntry,
  resolveDayBoundary,
  spansMidnight,
  type BreakInput,
  type RateSnapshot,
  type RoundingRule,
} from "@tarlog/core";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import {
  applyMutation,
  insertConflictRecord,
  type MutationContext,
} from "@/lib/sync/mutation";
import {
  loadAccountDefaults,
  loadBreaksForEntry,
  loadCustomer,
  loadProject,
  loadTask,
  loadTimeEntry,
  type TimeEntryRow,
} from "./repository.js";
import { resolveEntryRate, resolveRoundingRule } from "./rates.js";
import type { TimeEntryCreateBody, TimeEntryUpdateBody } from "./schemas.js";

function actorId(auth: AuthContext): string {
  return auth.user_id ?? auth.device_id ?? auth.main_account_id;
}

function requireDevice(auth: AuthContext): string {
  if (!auth.device_id) {
    throw new ApiError(
      "bad_request",
      "Kein Gerät im Auth-Kontext (device_id erforderlich für Mutationen).",
    );
  }
  return auth.device_id;
}

interface ResolvedCalc {
  rule: RoundingRule;
  rule_id: string | null;
  rate: RateSnapshot;
}

/** Löst Rundungsregel + Rate für einen Eintrag am Leistungsdatum auf. */
async function resolveCalcContext(
  ctx: MutationContext,
  mainAccountId: string,
  e: {
    project_id: string | null;
    task_id: string | null;
    customer_id: string | null;
    timezone: string;
    actual_started_at: number;
  },
): Promise<ResolvedCalc> {
  const onDate = resolveDayBoundary(e.actual_started_at, e.timezone);
  const project = e.project_id ? await loadProject(ctx.client, e.project_id, mainAccountId) : null;
  const customerId = e.customer_id ?? project?.customer_id ?? null;
  const customer = customerId ? await loadCustomer(ctx.client, customerId, mainAccountId) : null;
  const task = e.task_id ? await loadTask(ctx.client, e.task_id, mainAccountId) : null;
  const acct = await loadAccountDefaults(ctx.client, mainAccountId);

  const rounding = await resolveRoundingRule(ctx.client, {
    mainAccountId,
    projectRoundingRuleId: project?.rounding_rule_id,
    customerRoundingRuleId: customer?.default_rounding_rule_id,
    onDate,
  });
  const rate = await resolveEntryRate(ctx.client, {
    mainAccountId,
    taskId: e.task_id,
    projectId: e.project_id,
    taskRateCents: task?.default_hourly_rate_cents,
    projectRateCents: project?.hourly_rate_cents,
    customerCurrency: customer?.default_currency,
    defaultCurrency: acct.default_currency,
    onDate,
  });
  return { rule: rounding.rule, rule_id: rounding.rule_id, rate };
}

async function insertBreakRows(
  ctx: MutationContext,
  mainAccountId: string,
  entryId: string,
  breaks: BreakInput[],
  device: string,
  localRevision: number,
): Promise<void> {
  for (const b of breaks) {
    if (b.ended_at == null) continue;
    const dur = Math.max(0, Math.floor((b.ended_at - b.started_at) / 1000));
    await ctx.client.query(
      `INSERT INTO time_entry_breaks
         (id, main_account_id, time_entry_id, started_at, ended_at, duration_seconds,
          kind, counts_as_rest, created_at, updated_at, sync_version, server_revision,
          local_revision, hlc, last_modified_by_device)
       VALUES ($1,$2,$3,$4,$5,$6,'manual',true,$7,$7,0,$8,$9,$10,$11)`,
      [
        uuidv7(),
        mainAccountId,
        entryId,
        b.started_at,
        b.ended_at,
        dur,
        ctx.now,
        ctx.rev,
        localRevision,
        ctx.hlc,
        device,
      ],
    );
  }
}

export interface EntryOpResult {
  time_entry: TimeEntryRow | null;
  server_revision: number;
  hlc: string;
}

export async function createTimeEntry(
  auth: AuthContext,
  body: TimeEntryCreateBody,
): Promise<EntryOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;
  if (body.actual_ended_at <= body.actual_started_at) {
    throw new ApiError(
      "validation_error",
      "actual_ended_at muss nach actual_started_at liegen.",
    );
  }
  const source = body.source ?? "manual_backdated";
  const isManual = source === "manual_backdated";
  const isBackdated = source !== "live_timer";

  const res = await applyMutation<TimeEntryRow | null>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const acct = await loadAccountDefaults(ctx.client, mainAccountId);
      const project = body.project_id
        ? await loadProject(ctx.client, body.project_id, mainAccountId)
        : null;
      // Nachtrag-Regeln des Projekts (doc 03 §7.2).
      if (project && isBackdated && !project.backdating_allowed) {
        throw new ApiError("forbidden", "Nachträge sind für dieses Projekt deaktiviert.");
      }
      if (
        project &&
        isBackdated &&
        project.backdating_reason_required &&
        !body.backdate_reason
      ) {
        throw new ApiError(
          "validation_error",
          "backdate_reason ist für dieses Projekt Pflicht (backdating_reason_required).",
        );
      }
      const customerId = body.customer_id ?? project?.customer_id ?? null;
      const task = body.task_id ? await loadTask(ctx.client, body.task_id, mainAccountId) : null;
      const timezone = body.timezone ?? acct.default_timezone;
      const nonBillableProject = project?.billing_type === "non_billable";
      const isBillable =
        body.is_billable ??
        (task ? task.default_billable && !nonBillableProject : !nonBillableProject);

      const breaks: BreakInput[] = (body.breaks ?? []).map((b) => ({
        started_at: b.started_at,
        ended_at: b.ended_at,
      }));
      const calcInput = {
        actual_started_at: body.actual_started_at,
        actual_ended_at: body.actual_ended_at,
        timezone,
        breaks,
      };
      const rc = await resolveCalcContext(ctx, mainAccountId, {
        project_id: body.project_id ?? null,
        task_id: body.task_id ?? null,
        customer_id: customerId,
        timezone,
        actual_started_at: body.actual_started_at,
      });
      const calc = calculateEntry(calcInput, rc.rule, rc.rate);
      const crosses = spansMidnight(calcInput);
      const entryId = uuidv7();

      await ctx.client.query(
        `INSERT INTO time_entries
           (id, main_account_id, project_id, task_id, customer_id, status, timezone,
            actual_started_at, actual_ended_at, actual_duration_seconds,
            break_duration_seconds, net_work_duration_seconds, billing_duration_seconds,
            rounding_rule_id, rounding_delta_seconds, rounding_reason, calculation_version,
            rate_snapshot, billing_amount_snapshot, description, summary, is_billable,
            client_visible, source, backdate_reason, correction_reason, is_backdated,
            crosses_midnight, clock_trust, device_started_on, server_received_at,
            created_at, updated_at, sync_version, server_revision, local_revision, hlc,
            last_modified_by_device)
         VALUES ($1,$2,$3,$4,$5,'completed',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                 $17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'trusted',$28,$29,$29,$29,0,
                 $30,$31,$32,$28)`,
        [
          entryId,
          mainAccountId,
          body.project_id ?? null,
          body.task_id ?? null,
          customerId,
          timezone,
          calc.actual_started_at,
          calc.actual_ended_at,
          calc.actual_duration_seconds,
          calc.break_duration_seconds,
          calc.net_work_duration_seconds,
          calc.billing_duration_seconds,
          rc.rule_id,
          calc.rounding_delta_seconds,
          calc.rounding_reason,
          calc.calculation_version,
          JSON.stringify(calc.rate_snapshot),
          calc.billing_amount_snapshot,
          body.description ?? null,
          body.summary ?? null,
          isBillable,
          body.client_visible ?? true,
          source,
          body.backdate_reason ?? null,
          body.correction_reason ?? null,
          isBackdated,
          crosses,
          device,
          ctx.now,
          ctx.rev,
          localRevision,
          ctx.hlc,
        ],
      );
      await insertBreakRows(ctx, mainAccountId, entryId, breaks, device, localRevision);

      const entry = await loadTimeEntry(ctx.client, entryId, mainAccountId);
      return {
        result: entry,
        audit: {
          action: isBackdated ? "entry_backdated" : "entry_updated",
          entity_type: "time_entries",
          entity_id: entryId,
          after: {
            actual_started_at: body.actual_started_at,
            actual_ended_at: body.actual_ended_at,
            source,
            backdate_reason: body.backdate_reason ?? null,
          },
          reason: body.correction_reason ?? null,
        },
        event: {
          type: isManual ? "manual_entry.created" : "time_entry.created",
          entity_type: "time_entries",
          entity_id: entryId,
          operation: "create",
          data: {
            time_entry_id: entryId,
            project_id: body.project_id ?? null,
            actual_started_at: body.actual_started_at,
            actual_ended_at: body.actual_ended_at,
            billing_duration_seconds: calc.billing_duration_seconds,
          },
        },
      };
    },
  });

  return { time_entry: res.result, server_revision: res.server_revision, hlc: res.hlc };
}

export async function updateTimeEntry(
  auth: AuthContext,
  id: string,
  body: TimeEntryUpdateBody,
): Promise<EntryOpResult> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = body.local_revision ?? 0;

  interface UpdateResult {
    entry: TimeEntryRow | null;
    conflict?: {
      conflict_case: number;
      message: string;
      conflict_id: string;
      server_version: TimeEntryRow;
    };
  }

  const res = await applyMutation<UpdateResult>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: body.correlation_id,
    local_revision: localRevision,
    client_hlc: body.hlc,
    run: async (ctx) => {
      const current = await loadTimeEntry(ctx.client, id, mainAccountId);
      if (!current) throw new ApiError("not_found", "Zeiteintrag nicht gefunden.");

      // Konfliktfall 9, Edit auf soft-gelöschtem Eintrag.
      if (current.deleted_at != null) {
        const conflictId = await insertConflictRecord(ctx, {
          main_account_id: mainAccountId,
          entity_type: "time_entries",
          entity_id: id,
          conflict_case: 9,
          local_version: body as unknown as Record<string, unknown>,
          server_version: current as unknown as Record<string, unknown>,
          reason: "delete_vs_edit",
          correlation_id: body.correlation_id,
        });
        return {
          result: {
            entry: null,
            conflict: {
              conflict_case: 9,
              message: "Eintrag ist gelöscht (Delete-vs-Edit, Konfliktfall 9).",
              conflict_id: conflictId,
              server_version: current,
            },
          },
          audit: {
            action: "sync_conflict_resolved",
            entity_type: "time_entries",
            entity_id: id,
            reason: "delete_vs_edit",
          },
          event: {
            type: "sync.conflict",
            entity_type: "conflict_records",
            entity_id: conflictId,
            operation: "create",
            data: { conflict_case: 9, time_entry_id: id },
          },
        };
      }

      // Optimistische Sperre, Konfliktfall 6 (Feld) / 7 (Beschreibung).
      if (
        body.expected_sync_version != null &&
        current.sync_version !== body.expected_sync_version
      ) {
        const descDiverges =
          body.description != null && body.description !== (current.description ?? null);
        const conflictCase = descDiverges ? 7 : 6;
        const conflictId = await insertConflictRecord(ctx, {
          main_account_id: mainAccountId,
          entity_type: "time_entries",
          entity_id: id,
          conflict_case: conflictCase,
          local_version: body as unknown as Record<string, unknown>,
          server_version: current as unknown as Record<string, unknown>,
          reason: descDiverges ? "description_divergence" : "field_lww",
          correlation_id: body.correlation_id,
        });
        return {
          result: {
            entry: null,
            conflict: {
              conflict_case: conflictCase,
              message: descDiverges
                ? "Beschreibung divergiert (Konfliktfall 7), bitte manuell auflösen."
                : "Eintrag wurde zwischenzeitlich geändert (Konfliktfall 6).",
              conflict_id: conflictId,
              server_version: current,
            },
          },
          audit: {
            action: "sync_conflict_resolved",
            entity_type: "time_entries",
            entity_id: id,
            reason: descDiverges ? "description_divergence" : "field_lww",
          },
          event: {
            type: "sync.conflict",
            entity_type: "conflict_records",
            entity_id: conflictId,
            operation: "create",
            data: { conflict_case: conflictCase, time_entry_id: id },
          },
        };
      }

      // Effektive Zielwerte (nur gesetzte Felder überschreiben).
      const projectId = body.project_id !== undefined ? body.project_id : current.project_id;
      const taskId = body.task_id !== undefined ? body.task_id : current.task_id;
      const customerId = body.customer_id !== undefined ? body.customer_id : current.customer_id;
      const timezone = body.timezone ?? current.timezone;
      const startedAt = body.actual_started_at ?? current.actual_started_at;
      const endedAt =
        body.actual_ended_at !== undefined ? body.actual_ended_at : current.actual_ended_at;
      const description =
        body.description !== undefined ? body.description : current.description;
      const isBillable = body.is_billable ?? current.is_billable;
      const clientVisible = body.client_visible ?? current.client_visible;

      const timesChanged =
        body.actual_started_at != null ||
        body.actual_ended_at !== undefined ||
        body.breaks != null ||
        body.project_id !== undefined ||
        body.task_id !== undefined ||
        body.customer_id !== undefined;

      // Pausen ersetzen, wenn übergeben.
      let breaks: BreakInput[];
      if (body.breaks != null) {
        await ctx.client.query(
          `UPDATE time_entry_breaks SET deleted_at=$1, updated_at=$1
             WHERE time_entry_id=$2 AND deleted_at IS NULL`,
          [ctx.now, id],
        );
        breaks = body.breaks.map((b) => ({ started_at: b.started_at, ended_at: b.ended_at }));
        await insertBreakRows(ctx, mainAccountId, id, breaks, device, localRevision);
      } else {
        breaks = await loadBreaksForEntry(ctx.client, id);
      }

      // Neuberechnung nur bei abgeschlossenem Eintrag + relevanter Änderung.
      let recalced = false;
      let calcFields = {
        actual_duration_seconds: current.actual_duration_seconds,
        break_duration_seconds: current.break_duration_seconds,
        net_work_duration_seconds: current.net_work_duration_seconds,
        billing_duration_seconds: current.billing_duration_seconds,
        rounding_rule_id: current.rounding_rule_id,
        rounding_delta_seconds: current.rounding_delta_seconds,
        rounding_reason: current.rounding_reason,
        calculation_version: current.calculation_version || CALCULATION_VERSION,
        rate_snapshot: current.rate_snapshot,
        billing_amount_snapshot: current.billing_amount_snapshot,
        crosses_midnight: current.crosses_midnight,
      };
      if (endedAt != null && (timesChanged || body.breaks != null)) {
        const calcInput = {
          actual_started_at: startedAt,
          actual_ended_at: endedAt,
          timezone,
          breaks,
        };
        const rc = await resolveCalcContext(ctx, mainAccountId, {
          project_id: projectId,
          task_id: taskId,
          customer_id: customerId,
          timezone,
          actual_started_at: startedAt,
        });
        const calc = calculateEntry(calcInput, rc.rule, rc.rate);
        calcFields = {
          actual_duration_seconds: calc.actual_duration_seconds,
          break_duration_seconds: calc.break_duration_seconds,
          net_work_duration_seconds: calc.net_work_duration_seconds,
          billing_duration_seconds: calc.billing_duration_seconds,
          rounding_rule_id: rc.rule_id,
          rounding_delta_seconds: calc.rounding_delta_seconds,
          rounding_reason: calc.rounding_reason,
          calculation_version: calc.calculation_version,
          rate_snapshot: calc.rate_snapshot as unknown as Record<string, unknown>,
          billing_amount_snapshot: calc.billing_amount_snapshot,
          crosses_midnight: spansMidnight(calcInput),
        };
        recalced = true;
      }

      await ctx.client.query(
        `UPDATE time_entries
            SET project_id=$1, task_id=$2, customer_id=$3, timezone=$4,
                actual_started_at=$5, actual_ended_at=$6, actual_duration_seconds=$7,
                break_duration_seconds=$8, net_work_duration_seconds=$9,
                billing_duration_seconds=$10, rounding_rule_id=$11,
                rounding_delta_seconds=$12, rounding_reason=$13, calculation_version=$14,
                rate_snapshot=$15, billing_amount_snapshot=$16, description=$17,
                is_billable=$18, client_visible=$19, correction_reason=$20,
                crosses_midnight=$21, updated_at=$22, server_revision=$23,
                sync_version=sync_version+1, local_revision=$24, hlc=$25,
                last_modified_by_device=$26
          WHERE id=$27 AND main_account_id=$28`,
        [
          projectId,
          taskId,
          customerId,
          timezone,
          startedAt,
          endedAt,
          calcFields.actual_duration_seconds,
          calcFields.break_duration_seconds,
          calcFields.net_work_duration_seconds,
          calcFields.billing_duration_seconds,
          calcFields.rounding_rule_id,
          calcFields.rounding_delta_seconds,
          calcFields.rounding_reason,
          calcFields.calculation_version,
          calcFields.rate_snapshot != null ? JSON.stringify(calcFields.rate_snapshot) : null,
          calcFields.billing_amount_snapshot,
          description,
          isBillable,
          clientVisible,
          body.correction_reason ?? current.correction_reason,
          calcFields.crosses_midnight,
          ctx.now,
          ctx.rev,
          localRevision,
          ctx.hlc,
          device,
          id,
          mainAccountId,
        ],
      );

      const updated = await loadTimeEntry(ctx.client, id, mainAccountId);
      return {
        result: { entry: updated },
        audit: {
          action: "entry_updated",
          entity_type: "time_entries",
          entity_id: id,
          before: current as unknown as Record<string, unknown>,
          after: { recalced, is_billable: isBillable },
          reason: body.correction_reason ?? null,
        },
        event: {
          type: "time_entry.updated",
          entity_type: "time_entries",
          entity_id: id,
          operation: "update",
          data: {
            time_entry_id: id,
            billing_duration_seconds: calcFields.billing_duration_seconds,
            recalced,
          },
        },
      };
    },
  });

  if (res.result.conflict) {
    throw new ApiError("conflict", res.result.conflict.message, {
      conflict_case: res.result.conflict.conflict_case,
      conflict_id: res.result.conflict.conflict_id,
      server_version: res.result.conflict.server_version,
    });
  }
  return { time_entry: res.result.entry, server_revision: res.server_revision, hlc: res.hlc };
}

export async function deleteTimeEntry(
  auth: AuthContext,
  id: string,
  correlationId?: string | null,
  localRevisionRaw?: number | null,
): Promise<{ deleted: boolean; server_revision: number }> {
  const device = requireDevice(auth);
  const mainAccountId = auth.main_account_id;
  const localRevision = localRevisionRaw ?? 0;

  const res = await applyMutation<{ deleted: boolean }>({
    main_account_id: mainAccountId,
    device_id: device,
    actor_id: actorId(auth),
    correlation_id: correlationId,
    local_revision: localRevision,
    run: async (ctx) => {
      const current = await loadTimeEntry(ctx.client, id, mainAccountId);
      if (!current) throw new ApiError("not_found", "Zeiteintrag nicht gefunden.");
      if (current.deleted_at != null) {
        // Idempotent, bereits gelöscht.
        return {
          result: { deleted: true },
          audit: {
            action: "entry_deleted",
            entity_type: "time_entries",
            entity_id: id,
            reason: "already_deleted",
          },
          event: {
            type: "time_entry.deleted",
            entity_type: "time_entries",
            entity_id: id,
            operation: "delete",
            data: { time_entry_id: id },
          },
        };
      }
      await ctx.client.query(
        `UPDATE time_entries
            SET deleted_at=$1, updated_at=$1, server_revision=$2,
                sync_version=sync_version+1, local_revision=$3, hlc=$4,
                last_modified_by_device=$5
          WHERE id=$6 AND main_account_id=$7`,
        [ctx.now, ctx.rev, localRevision, ctx.hlc, device, id, mainAccountId],
      );
      return {
        result: { deleted: true },
        audit: {
          action: "entry_deleted",
          entity_type: "time_entries",
          entity_id: id,
          before: current as unknown as Record<string, unknown>,
        },
        event: {
          type: "time_entry.deleted",
          entity_type: "time_entries",
          entity_id: id,
          operation: "delete",
          data: { time_entry_id: id },
        },
      };
    },
  });

  return { deleted: res.result.deleted, server_revision: res.server_revision };
}
