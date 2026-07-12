/**
 * /api/tags — Liste + Anlegen (doc 06 §A.2 `tags`).
 * UNIQUE(`main_account_id`,`name`) → Duplikat ⇒ 409. Audit-Pflicht: nein.
 */
import { and, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  countRows, parseListQuery,
  mapDbError,
  orderByCreatedAt,
  pageMeta,
} from "@/lib/crud/http";
import { tagCreateSchema, tagQuerySchema } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, tagQuerySchema);
  const conds: SQL[] = [eq(schema.tags.main_account_id, auth.main_account_id)];
  if (!q.include_deleted) conds.push(isNull(schema.tags.deleted_at));
  if (q.q) conds.push(ilike(schema.tags.name, `%${q.q}%`));

  const rows = await db
    .select()
    .from(schema.tags)
    .where(and(...conds))
    .orderBy(orderByCreatedAt(schema.tags.created_at, q.order))
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.tags, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, tagCreateSchema);
  const now = Date.now();
  try {
    const [row] = await db
      .insert(schema.tags)
      .values({
        id: uuidv7(),
        main_account_id: auth.main_account_id,
        name: input.name,
        color: input.color ?? null,
        created_at: now,
        updated_at: now,
      })
      .returning();
    return json({ data: row }, { status: 201 });
  } catch (err) {
    mapDbError(err);
  }
});
