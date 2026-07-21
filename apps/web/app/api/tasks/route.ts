/**
 * /api/tasks, Liste + Anlegen (doc 06 §A.2 `tasks`, doc 10 §3).
 *
 * `project_id` NULL = globale Aufgabe. Audit-Pflicht: nein (doc 06 tasks-Meta).
 * GET  : Filter `project_id`, `status`, `q` (Name); sortiert nach `sort_order`.
 */
import { and, asc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { countRows, parseListQuery, orderByCreatedAt, pageMeta } from "@/lib/crud/http";
import { taskCreateSchema, taskQuerySchema } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, taskQuerySchema);
  const conds: SQL[] = [eq(schema.tasks.main_account_id, auth.main_account_id)];
  if (!q.include_deleted) conds.push(isNull(schema.tasks.deleted_at));
  if (q.project_id) conds.push(eq(schema.tasks.project_id, q.project_id));
  if (q.status) conds.push(eq(schema.tasks.status, q.status));
  if (q.q) conds.push(ilike(schema.tasks.name, `%${q.q}%`));

  const rows = await db
    .select()
    .from(schema.tasks)
    .where(and(...conds))
    .orderBy(
      asc(schema.tasks.sort_order),
      orderByCreatedAt(schema.tasks.created_at, q.order),
    )
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.tasks, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, taskCreateSchema);
  const now = Date.now();
  const [row] = await db
    .insert(schema.tasks)
    .values({
      id: uuidv7(),
      main_account_id: auth.main_account_id,
      project_id: input.project_id ?? null,
      name: input.name,
      description: input.description ?? null,
      default_billable: input.default_billable,
      default_hourly_rate_cents: input.default_hourly_rate_cents ?? null,
      default_day_rate_cents: input.default_day_rate_cents ?? null,
      default_description_template: input.default_description_template ?? null,
      cost_center: input.cost_center ?? null,
      color: input.color ?? null,
      status: input.status,
      sort_order: input.sort_order,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return json({ data: row }, { status: 201 });
});
