/**
 * recalc.ts — the billing writeback (doc 07 §3.1, doc 10 §4). After a timer stop
 * or a backdate the raw entry exists, but the abrechenbaren Felder must be
 * (re)derived from @ptl/core: resolve the rounding rule (Projekt > Kunde >
 * Default) and rate (task > project > customer > default), run `calculateEntry`,
 * and persist the 12 rounding/snapshot fields back into `time_entries`.
 *
 * This is the ONLY place billing numbers are computed — never in SQL, never in
 * the UI. `actual_duration_seconds` stays BRUTTO (never altered by rounding).
 */
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";
import { resolveRoundingRuleForEntry } from "./rounding";
import { resolveEntryRate } from "./rates";
import {
  calculateEntry,
  resolveDayBoundary,
  type BreakInput,
  type CalcResult,
  type EpochMs,
  type IanaTimezone,
  type Uuid,
} from "@ptl/core";

interface EntryRow {
  id: Uuid;
  project_id: Uuid | null;
  task_id: Uuid | null;
  customer_id: Uuid | null;
  timezone: IanaTimezone;
  actual_started_at: EpochMs;
  actual_ended_at: EpochMs | null;
}

interface BreakRow {
  started_at: EpochMs;
  ended_at: EpochMs | null;
}

/**
 * Recompute + persist the billing fields for one finalized entry. Returns the
 * full {@link CalcResult}. Throws if the entry is missing or still running
 * (`actual_ended_at` NULL) — a running entry has no billable duration yet.
 */
export async function recalcEntry(entryId: Uuid): Promise<CalcResult> {
  const ctx = await getContext();
  const rows = await select<EntryRow>(
    `SELECT id, project_id, task_id, customer_id, timezone,
            actual_started_at, actual_ended_at
       FROM time_entries WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
    [entryId, ctx.mainAccountId],
  );
  const entry = rows[0];
  if (!entry) throw new Error(`recalcEntry: Eintrag ${entryId} nicht gefunden`);
  if (entry.actual_ended_at == null) {
    throw new Error(`recalcEntry: Eintrag ${entryId} läuft noch (actual_ended_at = NULL)`);
  }

  const breakRows = await select<BreakRow>(
    `SELECT started_at, ended_at FROM time_entry_breaks
      WHERE time_entry_id = $1 AND deleted_at IS NULL ORDER BY started_at ASC`,
    [entryId],
  );
  const breaks: BreakInput[] = breakRows.map((b) => ({
    started_at: b.started_at,
    ended_at: b.ended_at,
  }));

  const onDate = resolveDayBoundary(entry.actual_started_at, entry.timezone);
  const rule = await resolveRoundingRuleForEntry({
    projectId: entry.project_id,
    customerId: entry.customer_id,
  });
  const rate = await resolveEntryRate({
    taskId: entry.task_id,
    projectId: entry.project_id,
    customerId: entry.customer_id,
    onDate,
  });

  const calc = calculateEntry(
    {
      actual_started_at: entry.actual_started_at,
      actual_ended_at: entry.actual_ended_at,
      timezone: entry.timezone,
      breaks,
    },
    rule,
    rate,
  );

  await execute(
    `UPDATE time_entries SET
        actual_duration_seconds = $1,
        break_duration_seconds = $2,
        net_work_duration_seconds = $3,
        billing_duration_seconds = $4,
        rounding_rule_id = $5,
        rounding_delta_seconds = $6,
        rounding_reason = $7,
        calculation_version = $8,
        rate_snapshot = $9,
        billing_amount_snapshot = $10,
        updated_at = $11
      WHERE id = $12 AND main_account_id = $13`,
    [
      calc.actual_duration_seconds,
      calc.break_duration_seconds,
      calc.net_work_duration_seconds,
      calc.billing_duration_seconds,
      // The synthetic "none" fallback rule is not a real FK row → store NULL.
      rule.id === "none" ? null : calc.rounding_rule_id,
      calc.rounding_delta_seconds,
      calc.rounding_reason,
      calc.calculation_version,
      JSON.stringify(calc.rate_snapshot),
      calc.billing_amount_snapshot,
      now(),
      entryId,
      ctx.mainAccountId,
    ],
  );

  return calc;
}
