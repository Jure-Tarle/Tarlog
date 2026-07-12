/**
 * /api/projects — Liste + Anlegen (doc 06 §A.2 `projects`, doc 10 §2).
 *
 * GET  : paginierte, gescopte Liste; Filter `customer_id`, `status`,
 *        `billing_type`, `q` (Name), `include_deleted`.
 * POST : legt ein Projekt an. `billing_type` ist Pflicht (doc 06). Kein Audit
 *        bei Anlage (nur bei Satz-/Rundungsregel-ÄNDERUNG, siehe [id]/route.ts).
 */
import { and, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  countRows, parseListQuery,
  mapDbError,
  numericToString,
  orderByCreatedAt,
  pageMeta,
} from "@/lib/crud/http";
import { projectCreateSchema, projectQuerySchema } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, projectQuerySchema);
  const conds: SQL[] = [
    eq(schema.projects.main_account_id, auth.main_account_id),
  ];
  if (!q.include_deleted) conds.push(isNull(schema.projects.deleted_at));
  if (q.customer_id) conds.push(eq(schema.projects.customer_id, q.customer_id));
  if (q.status) conds.push(eq(schema.projects.status, q.status));
  if (q.billing_type)
    conds.push(eq(schema.projects.billing_type, q.billing_type));
  if (q.q) conds.push(ilike(schema.projects.name, `%${q.q}%`));

  const rows = await db
    .select()
    .from(schema.projects)
    .where(and(...conds))
    .orderBy(orderByCreatedAt(schema.projects.created_at, q.order))
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.projects, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, projectCreateSchema);
  const now = Date.now();
  try {
    const [row] = await db
      .insert(schema.projects)
      .values({
        id: uuidv7(),
        main_account_id: auth.main_account_id,
        name: input.name,
        customer_id: input.customer_id ?? null,
        description: input.description ?? null,
        status: input.status,
        project_code: input.project_code ?? null,
        color: input.color ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        billing_type: input.billing_type,
        hourly_rate_cents: input.hourly_rate_cents ?? null,
        day_rate_cents: input.day_rate_cents ?? null,
        fixed_fee_cents: input.fixed_fee_cents ?? null,
        retainer_id: input.retainer_id ?? null,
        budget_hours: numericToString(input.budget_hours),
        budget_money_cents: input.budget_money_cents ?? null,
        budget_warn_thresholds: input.budget_warn_thresholds ?? null,
        planned_hours: numericToString(input.planned_hours),
        rounding_rule_id: input.rounding_rule_id ?? null,
        default_task_id: input.default_task_id ?? null,
        allowed_task_ids: input.allowed_task_ids ?? null,
        mandatory_tags: input.mandatory_tags ?? null,
        description_required: input.description_required,
        backdating_allowed: input.backdating_allowed,
        backdating_reason_required: input.backdating_reason_required,
        max_retroactive_edit_days: input.max_retroactive_edit_days ?? null,
        internal_notes: input.internal_notes ?? null,
        external_description: input.external_description ?? null,
        created_at: now,
        updated_at: now,
      })
      .returning();
    return json({ data: row }, { status: 201 });
  } catch (err) {
    mapDbError(err);
  }
});
