/**
 * /api/rates — Liste + Anlegen historisierter Stundensätze
 * (doc 06 §A.4 `billing_rates`, doc 10 §4.0/§4.1).
 *
 * Sätze sind über `valid_from`/`valid_until` historisiert (doc 06). Beim Anlegen
 * schließt `supersede` (default true) automatisch den vorherigen offenen Satz
 * desselben Scopes (setzt dessen `valid_until = neues valid_from`), sodass die
 * Historie lückenlos bleibt. Jede Mutation schreibt Audit `rate_changed`
 * (doc 06 billing_rates-Meta, doc 10 §4.0).
 */
import { and, eq, isNull, lt, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  countRows, parseListQuery,
  mapDbError,
  matchNullable,
  orderByCreatedAt,
  pageMeta,
  resolveActor,
} from "@/lib/crud/http";
import { rateCreateSchema, rateQuerySchema } from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, rateQuerySchema);
  const conds: SQL[] = [
    eq(schema.billingRates.main_account_id, auth.main_account_id),
  ];
  if (!q.include_deleted) conds.push(isNull(schema.billingRates.deleted_at));
  if (q.scope) conds.push(eq(schema.billingRates.scope, q.scope));
  if (q.customer_id)
    conds.push(eq(schema.billingRates.customer_id, q.customer_id));
  if (q.project_id)
    conds.push(eq(schema.billingRates.project_id, q.project_id));
  if (q.task_id) conds.push(eq(schema.billingRates.task_id, q.task_id));

  const rows = await db
    .select()
    .from(schema.billingRates)
    .where(and(...conds))
    .orderBy(orderByCreatedAt(schema.billingRates.created_at, q.order))
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.billingRates, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, rateCreateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();
  const mid = auth.main_account_id;

  try {
    const result = await db.transaction(async (tx) => {
      // Vorherige offene Sätze desselben Scope-Tupels schließen.
      let supersededIds: string[] = [];
      if (input.supersede) {
        const superseded = await tx
          .update(schema.billingRates)
          .set({ valid_until: input.valid_from, updated_at: now })
          .where(
            and(
              eq(schema.billingRates.main_account_id, mid),
              eq(schema.billingRates.scope, input.scope),
              matchNullable(
                schema.billingRates.customer_id,
                input.customer_id ?? null,
              ),
              matchNullable(
                schema.billingRates.project_id,
                input.project_id ?? null,
              ),
              matchNullable(
                schema.billingRates.task_id,
                input.task_id ?? null,
              ),
              isNull(schema.billingRates.deleted_at),
              isNull(schema.billingRates.valid_until),
              lt(schema.billingRates.valid_from, input.valid_from),
            ),
          )
          .returning();
        supersededIds = superseded.map((r) => r.id);
      }

      const newId = uuidv7();
      const [row] = await tx
        .insert(schema.billingRates)
        .values({
          id: newId,
          main_account_id: mid,
          scope: input.scope,
          customer_id: input.customer_id ?? null,
          project_id: input.project_id ?? null,
          task_id: input.task_id ?? null,
          hourly_rate_cents: input.hourly_rate_cents,
          currency: input.currency,
          valid_from: input.valid_from,
          valid_until: input.valid_until ?? null,
          created_at: now,
          updated_at: now,
        })
        .returning();
      if (!row) throw new Error("insert billing_rate returned no row");

      await writeAudit(tx, {
        actor_id: actor.actor_id,
        main_account_id: mid,
        device_id: actor.device_id,
        entity_type: "billing_rates",
        entity_id: newId,
        action: "rate_changed",
        after_json: row as Record<string, unknown>,
        reason:
          supersededIds.length > 0
            ? `supersedes:${supersededIds.join(",")}`
            : null,
        source: "api",
      });

      return { row, superseded: supersededIds };
    });

    return json(
      { data: result.row, superseded: result.superseded },
      { status: 201 },
    );
  } catch (err) {
    mapDbError(err);
  }
});
