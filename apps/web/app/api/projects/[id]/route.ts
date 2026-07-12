/**
 * /api/projects/[id] — Detail, Ändern (mit Audit), Soft-Delete
 * (doc 06 §A.2 `projects`).
 *
 * PATCH schreibt Audit `rate_changed` bei Änderung von
 * hourly/day/fixed-Sätzen bzw. `rounding_rule_changed` bei Änderung der
 * `rounding_rule_id` (doc 06 projects-Meta: "Satz-/Rundungsregel-Änderung").
 * Update + Audit atomar in einer Transaktion.
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  mapDbError,
  notFound,
  numericToString,
  resolveActor,
} from "@/lib/crud/http";
import { projectUpdateSchema, type ProjectUpdate } from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type ProjectRow = typeof schema.projects.$inferSelect;
type ProjectSet = Partial<typeof schema.projects.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.projects.id, id),
    eq(schema.projects.main_account_id, mainAccountId),
    isNull(schema.projects.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.projects)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Projekt");
  return json({ data: row });
});

function buildSet(input: ProjectUpdate, now: number): ProjectSet {
  const set: ProjectSet = { updated_at: now };
  if (input.name !== undefined) set.name = input.name;
  if (input.customer_id !== undefined)
    set.customer_id = input.customer_id ?? null;
  if (input.description !== undefined)
    set.description = input.description ?? null;
  if (input.status !== undefined) set.status = input.status;
  if (input.project_code !== undefined)
    set.project_code = input.project_code ?? null;
  if (input.color !== undefined) set.color = input.color ?? null;
  if (input.start_date !== undefined)
    set.start_date = input.start_date ?? null;
  if (input.end_date !== undefined) set.end_date = input.end_date ?? null;
  if (input.billing_type !== undefined) set.billing_type = input.billing_type;
  if (input.hourly_rate_cents !== undefined)
    set.hourly_rate_cents = input.hourly_rate_cents ?? null;
  if (input.day_rate_cents !== undefined)
    set.day_rate_cents = input.day_rate_cents ?? null;
  if (input.fixed_fee_cents !== undefined)
    set.fixed_fee_cents = input.fixed_fee_cents ?? null;
  if (input.retainer_id !== undefined)
    set.retainer_id = input.retainer_id ?? null;
  if (input.budget_hours !== undefined)
    set.budget_hours = numericToString(input.budget_hours);
  if (input.budget_money_cents !== undefined)
    set.budget_money_cents = input.budget_money_cents ?? null;
  if (input.budget_warn_thresholds !== undefined)
    set.budget_warn_thresholds = input.budget_warn_thresholds ?? null;
  if (input.planned_hours !== undefined)
    set.planned_hours = numericToString(input.planned_hours);
  if (input.rounding_rule_id !== undefined)
    set.rounding_rule_id = input.rounding_rule_id ?? null;
  if (input.default_task_id !== undefined)
    set.default_task_id = input.default_task_id ?? null;
  if (input.allowed_task_ids !== undefined)
    set.allowed_task_ids = input.allowed_task_ids ?? null;
  if (input.mandatory_tags !== undefined)
    set.mandatory_tags = input.mandatory_tags ?? null;
  if (input.description_required !== undefined)
    set.description_required = input.description_required;
  if (input.backdating_allowed !== undefined)
    set.backdating_allowed = input.backdating_allowed;
  if (input.backdating_reason_required !== undefined)
    set.backdating_reason_required = input.backdating_reason_required;
  if (input.max_retroactive_edit_days !== undefined)
    set.max_retroactive_edit_days = input.max_retroactive_edit_days ?? null;
  if (input.internal_notes !== undefined)
    set.internal_notes = input.internal_notes ?? null;
  if (input.external_description !== undefined)
    set.external_description = input.external_description ?? null;
  return set;
}

function rateChanged(input: ProjectUpdate, before: ProjectRow): boolean {
  if (
    input.hourly_rate_cents !== undefined &&
    (input.hourly_rate_cents ?? null) !== before.hourly_rate_cents
  )
    return true;
  if (
    input.day_rate_cents !== undefined &&
    (input.day_rate_cents ?? null) !== before.day_rate_cents
  )
    return true;
  if (
    input.fixed_fee_cents !== undefined &&
    (input.fixed_fee_cents ?? null) !== before.fixed_fee_cents
  )
    return true;
  return false;
}

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, projectUpdateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();

  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.projects)
        .where(scoped(id, auth.main_account_id))
        .limit(1);
      if (!before) throw notFound("Projekt");

      const doRate = rateChanged(input, before);
      const doRounding =
        input.rounding_rule_id !== undefined &&
        (input.rounding_rule_id ?? null) !== before.rounding_rule_id;

      const [row] = await tx
        .update(schema.projects)
        .set(buildSet(input, now))
        .where(scoped(id, auth.main_account_id))
        .returning();
      if (!row) throw notFound("Projekt");

      if (doRate)
        await writeAudit(tx, {
          actor_id: actor.actor_id,
          main_account_id: auth.main_account_id,
          device_id: actor.device_id,
          entity_type: "projects",
          entity_id: id,
          action: "rate_changed",
          before_json: before as Record<string, unknown>,
          after_json: row as Record<string, unknown>,
          source: "api",
        });
      if (doRounding)
        await writeAudit(tx, {
          actor_id: actor.actor_id,
          main_account_id: auth.main_account_id,
          device_id: actor.device_id,
          entity_type: "projects",
          entity_id: id,
          action: "rounding_rule_changed",
          before_json: before as Record<string, unknown>,
          after_json: row as Record<string, unknown>,
          source: "api",
        });
      return row;
    });
    return json({ data: updated });
  } catch (err) {
    mapDbError(err);
  }
});

export const DELETE = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const now = Date.now();
  const [row] = await db
    .update(schema.projects)
    .set({ deleted_at: now, updated_at: now })
    .where(scoped(id, auth.main_account_id))
    .returning();
  if (!row) throw notFound("Projekt");
  return json({ data: { id, deleted_at: now } });
});
