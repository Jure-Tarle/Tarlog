/**
 * rates.ts — resolve the effective hourly {@link RateSnapshot} for an entry by
 * precedence task > project > customer > default (doc 07 §5, doc 10 §4.0) using
 * the @tarlog/core `resolveRate`. Sources, in order per level:
 *   1. historised `billing_rates` (scope + id, newest `valid_from` ≤ entry day),
 *   2. the entity's own `default_hourly_rate_cents` column,
 *   3. account default from `settings["billing.default_hourly_rate_cents"]` (0
 *      when unset — non-billable/zero-rate entries never crash the writeback).
 */
import { select } from "../lib/db";
import { getContext } from "./context";
import { getSetting } from "./settings";
import { resolveRate, type RateSnapshot, type Uuid } from "@tarlog/core";

/** Owning entities of an entry, used to resolve its rate. */
export interface RateContext {
  taskId?: Uuid | null;
  projectId?: Uuid | null;
  customerId?: Uuid | null;
  /** Local calendar day "YYYY-MM-DD" of the entry (for rate historisation). */
  onDate: string;
}

type Scope = "task" | "project" | "customer" | "default";

interface BillingRateRow {
  hourly_rate_cents: number;
  currency: string;
  valid_from: string;
}

/** Newest historised billing rate for a scope+id valid on/before `onDate`. */
async function historisedRate(
  scope: Scope,
  idColumn: "task_id" | "project_id" | "customer_id" | null,
  id: Uuid | null,
  onDate: string,
): Promise<RateSnapshot | null> {
  const ctx = await getContext();
  const scoped = idColumn && id;
  const sql = scoped
    ? `SELECT hourly_rate_cents, currency, valid_from FROM billing_rates
        WHERE main_account_id = $1 AND scope = $2 AND ${idColumn} = $3
          AND valid_from <= $4 AND (valid_until IS NULL OR valid_until >= $4)
          AND deleted_at IS NULL
        ORDER BY valid_from DESC LIMIT 1`
    : `SELECT hourly_rate_cents, currency, valid_from FROM billing_rates
        WHERE main_account_id = $1 AND scope = $2
          AND valid_from <= $3 AND (valid_until IS NULL OR valid_until >= $3)
          AND deleted_at IS NULL
        ORDER BY valid_from DESC LIMIT 1`;
  const rows = await select<BillingRateRow>(
    sql,
    scoped ? [ctx.mainAccountId, scope, id, onDate] : [ctx.mainAccountId, scope, onDate],
  );
  const row = rows[0];
  return row
    ? { amount_cents: row.hourly_rate_cents, currency: row.currency, source: scope }
    : null;
}

/** Entity `default_hourly_rate_cents` fallback for task/project/customer. */
async function entityDefaultRate(
  table: "tasks" | "projects" | "customers",
  column: "default_hourly_rate_cents" | "hourly_rate_cents",
  id: Uuid,
  scope: Scope,
  currency: string,
): Promise<RateSnapshot | null> {
  const ctx = await getContext();
  const rows = await select<{ cents: number | null }>(
    `SELECT ${column} AS cents FROM ${table} WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
    [id, ctx.mainAccountId],
  );
  const cents = rows[0]?.cents;
  return cents != null ? { amount_cents: cents, currency, source: scope } : null;
}

/**
 * Resolve the frozen rate snapshot for an entry. Never throws: an account with
 * no configured rate yields a 0-cent default snapshot.
 */
export async function resolveEntryRate(rc: RateContext): Promise<RateSnapshot> {
  const ctx = await getContext();
  const currency = ctx.defaultCurrency;

  const task = rc.taskId
    ? (await historisedRate("task", "task_id", rc.taskId, rc.onDate)) ??
      (await entityDefaultRate("tasks", "default_hourly_rate_cents", rc.taskId, "task", currency))
    : undefined;

  const project = rc.projectId
    ? (await historisedRate("project", "project_id", rc.projectId, rc.onDate)) ??
      (await entityDefaultRate("projects", "hourly_rate_cents", rc.projectId, "project", currency))
    : undefined;

  const customer = rc.customerId
    ? (await historisedRate("customer", "customer_id", rc.customerId, rc.onDate)) ??
      (await entityDefaultRate("customers", "default_hourly_rate_cents", rc.customerId, "customer", currency))
    : undefined;

  const accountDefaultCents = (await getSetting<number>("billing.default_hourly_rate_cents")) ?? 0;
  const fallback =
    (await historisedRate("default", null, null, rc.onDate)) ??
    ({ amount_cents: accountDefaultCents, currency, source: "default" } as RateSnapshot);

  return resolveRate({
    task: task ?? undefined,
    project: project ?? undefined,
    customer: customer ?? undefined,
    default: fallback,
  });
}
