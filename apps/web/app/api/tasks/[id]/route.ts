/**
 * /api/tasks/[id] — Detail, Ändern, Soft-Delete (doc 06 §A.2 `tasks`).
 * Audit-Pflicht: nein.
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { notFound } from "@/lib/crud/http";
import { taskUpdateSchema, type TaskUpdate } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type TaskSet = Partial<typeof schema.tasks.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.tasks.id, id),
    eq(schema.tasks.main_account_id, mainAccountId),
    isNull(schema.tasks.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.tasks)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Aufgabe");
  return json({ data: row });
});

function buildSet(input: TaskUpdate, now: number): TaskSet {
  const set: TaskSet = { updated_at: now };
  if (input.project_id !== undefined) set.project_id = input.project_id ?? null;
  if (input.name !== undefined) set.name = input.name;
  if (input.description !== undefined)
    set.description = input.description ?? null;
  if (input.default_billable !== undefined)
    set.default_billable = input.default_billable;
  if (input.default_hourly_rate_cents !== undefined)
    set.default_hourly_rate_cents = input.default_hourly_rate_cents ?? null;
  if (input.default_day_rate_cents !== undefined)
    set.default_day_rate_cents = input.default_day_rate_cents ?? null;
  if (input.default_description_template !== undefined)
    set.default_description_template =
      input.default_description_template ?? null;
  if (input.cost_center !== undefined)
    set.cost_center = input.cost_center ?? null;
  if (input.color !== undefined) set.color = input.color ?? null;
  if (input.status !== undefined) set.status = input.status;
  if (input.sort_order !== undefined) set.sort_order = input.sort_order;
  return set;
}

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, taskUpdateSchema);
  const now = Date.now();
  const [row] = await db
    .update(schema.tasks)
    .set(buildSet(input, now))
    .where(scoped(id, auth.main_account_id))
    .returning();
  if (!row) throw notFound("Aufgabe");
  return json({ data: row });
});

export const DELETE = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const now = Date.now();
  const [row] = await db
    .update(schema.tasks)
    .set({ deleted_at: now, updated_at: now })
    .where(scoped(id, auth.main_account_id))
    .returning();
  if (!row) throw notFound("Aufgabe");
  return json({ data: { id, deleted_at: now } });
});
