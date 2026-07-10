/**
 * /api/rounding-rules/[id] — Detail, Ändern, Soft-Delete
 * (doc 06 §A.4 `rounding_rules`). Jede Mutation schreibt Audit
 * `rounding_rule_changed`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { notFound, resolveActor } from "@/lib/crud/http";
import {
  roundingRuleUpdateSchema,
  type RoundingRuleUpdate,
} from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type RoundingRuleSet = Partial<typeof schema.roundingRules.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.roundingRules.id, id),
    eq(schema.roundingRules.main_account_id, mainAccountId),
    isNull(schema.roundingRules.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.roundingRules)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Rundungsregel");
  return json({ data: row });
});

function buildSet(input: RoundingRuleUpdate, now: number): RoundingRuleSet {
  const set: RoundingRuleSet = { updated_at: now };
  if (input.name !== undefined) set.name = input.name;
  if (input.mode !== undefined) set.mode = input.mode;
  if (input.interval_minutes !== undefined)
    set.interval_minutes = input.interval_minutes ?? null;
  if (input.min_duration_seconds !== undefined)
    set.min_duration_seconds = input.min_duration_seconds ?? null;
  if (input.scope !== undefined) set.scope = input.scope;
  if (input.valid_from !== undefined) set.valid_from = input.valid_from;
  if (input.valid_until !== undefined)
    set.valid_until = input.valid_until ?? null;
  if (input.calculation_version !== undefined)
    set.calculation_version = input.calculation_version;
  return set;
}

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, roundingRuleUpdateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();

  const updated = await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.roundingRules)
      .where(scoped(id, auth.main_account_id))
      .limit(1);
    if (!before) throw notFound("Rundungsregel");

    const [row] = await tx
      .update(schema.roundingRules)
      .set(buildSet(input, now))
      .where(scoped(id, auth.main_account_id))
      .returning();
    if (!row) throw notFound("Rundungsregel");

    await writeAudit(tx, {
      actor_id: actor.actor_id,
      main_account_id: auth.main_account_id,
      device_id: actor.device_id,
      entity_type: "rounding_rules",
      entity_id: id,
      action: "rounding_rule_changed",
      before_json: before as Record<string, unknown>,
      after_json: row as Record<string, unknown>,
      source: "api",
    });
    return row;
  });

  return json({ data: updated });
});

export const DELETE = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const actor = resolveActor(auth);
  const now = Date.now();

  const deleted = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.roundingRules)
      .set({ deleted_at: now, updated_at: now })
      .where(scoped(id, auth.main_account_id))
      .returning();
    if (!row) throw notFound("Rundungsregel");

    await writeAudit(tx, {
      actor_id: actor.actor_id,
      main_account_id: auth.main_account_id,
      device_id: actor.device_id,
      entity_type: "rounding_rules",
      entity_id: id,
      action: "rounding_rule_changed",
      before_json: row as Record<string, unknown>,
      reason: "deleted",
      source: "api",
    });
    return row;
  });

  return json({ data: { id: deleted.id, deleted_at: now } });
});
