/**
 * /api/rates/[id] — Detail, Ändern, Soft-Delete eines Stundensatzes
 * (doc 06 §A.4 `billing_rates`). Jede Mutation schreibt Audit `rate_changed`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { mapDbError, notFound, resolveActor } from "@/lib/crud/http";
import { rateUpdateSchema, type RateUpdate } from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type RateSet = Partial<typeof schema.billingRates.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.billingRates.id, id),
    eq(schema.billingRates.main_account_id, mainAccountId),
    isNull(schema.billingRates.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.billingRates)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Stundensatz");
  return json({ data: row });
});

function buildSet(input: RateUpdate, now: number): RateSet {
  const set: RateSet = { updated_at: now };
  if (input.scope !== undefined) set.scope = input.scope;
  if (input.customer_id !== undefined)
    set.customer_id = input.customer_id ?? null;
  if (input.project_id !== undefined) set.project_id = input.project_id ?? null;
  if (input.task_id !== undefined) set.task_id = input.task_id ?? null;
  if (input.hourly_rate_cents !== undefined)
    set.hourly_rate_cents = input.hourly_rate_cents;
  if (input.currency !== undefined) set.currency = input.currency;
  if (input.valid_from !== undefined) set.valid_from = input.valid_from;
  if (input.valid_until !== undefined)
    set.valid_until = input.valid_until ?? null;
  return set;
}

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, rateUpdateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();

  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.billingRates)
        .where(scoped(id, auth.main_account_id))
        .limit(1);
      if (!before) throw notFound("Stundensatz");

      const [row] = await tx
        .update(schema.billingRates)
        .set(buildSet(input, now))
        .where(scoped(id, auth.main_account_id))
        .returning();
      if (!row) throw notFound("Stundensatz");

      await writeAudit(tx, {
        actor_id: actor.actor_id,
        main_account_id: auth.main_account_id,
        device_id: actor.device_id,
        entity_type: "billing_rates",
        entity_id: id,
        action: "rate_changed",
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
  const actor = resolveActor(auth);
  const now = Date.now();

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.billingRates)
      .set({ deleted_at: now, updated_at: now })
      .where(scoped(id, auth.main_account_id))
      .returning();
    if (!row) throw notFound("Stundensatz");

    await writeAudit(tx, {
      actor_id: actor.actor_id,
      main_account_id: auth.main_account_id,
      device_id: actor.device_id,
      entity_type: "billing_rates",
      entity_id: id,
      action: "rate_changed",
      before_json: row as Record<string, unknown>,
      reason: "deleted",
      source: "api",
    });
    return row;
  });

  return json({ data: { id: deleted.id, deleted_at: now } });
});
