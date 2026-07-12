/**
 * /api/rounding-rules — Liste + Anlegen (doc 06 §A.4 `rounding_rules`, doc 07 §3).
 *
 * 9 Modi / 6 Intervalle, historisiert über `valid_from`/`valid_until`. Jede
 * Mutation schreibt Audit `rounding_rule_changed` (doc 06 rounding_rules-Meta).
 * GET: Filter `scope`, `mode`, `q` (Name).
 */
import { and, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { CALCULATION_VERSION } from "@ptl/core";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  countRows, parseListQuery,
  orderByCreatedAt,
  pageMeta,
  resolveActor,
} from "@/lib/crud/http";
import {
  roundingRuleCreateSchema,
  roundingRuleQuerySchema,
} from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, roundingRuleQuerySchema);
  const conds: SQL[] = [
    eq(schema.roundingRules.main_account_id, auth.main_account_id),
  ];
  if (!q.include_deleted) conds.push(isNull(schema.roundingRules.deleted_at));
  if (q.scope) conds.push(eq(schema.roundingRules.scope, q.scope));
  if (q.mode) conds.push(eq(schema.roundingRules.mode, q.mode));
  if (q.q) conds.push(ilike(schema.roundingRules.name, `%${q.q}%`));

  const rows = await db
    .select()
    .from(schema.roundingRules)
    .where(and(...conds))
    .orderBy(orderByCreatedAt(schema.roundingRules.created_at, q.order))
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.roundingRules, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, roundingRuleCreateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();
  const mid = auth.main_account_id;

  const created = await db.transaction(async (tx) => {
    const newId = uuidv7();
    const [row] = await tx
      .insert(schema.roundingRules)
      .values({
        id: newId,
        main_account_id: mid,
        name: input.name,
        mode: input.mode,
        interval_minutes: input.interval_minutes ?? null,
        min_duration_seconds: input.min_duration_seconds ?? null,
        scope: input.scope,
        valid_from: input.valid_from,
        valid_until: input.valid_until ?? null,
        calculation_version: input.calculation_version ?? CALCULATION_VERSION,
        created_at: now,
        updated_at: now,
      })
      .returning();
    if (!row) throw new Error("insert rounding_rule returned no row");

    await writeAudit(tx, {
      actor_id: actor.actor_id,
      main_account_id: mid,
      device_id: actor.device_id,
      entity_type: "rounding_rules",
      entity_id: newId,
      action: "rounding_rule_changed",
      after_json: row as Record<string, unknown>,
      source: "api",
    });
    return row;
  });

  return json({ data: created }, { status: 201 });
});
