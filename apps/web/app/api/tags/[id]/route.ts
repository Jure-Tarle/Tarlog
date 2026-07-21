/**
 * /api/tags/[id], Detail, Ändern, Soft-Delete (doc 06 §A.2 `tags`).
 * Namensänderung kann UNIQUE verletzen ⇒ 409. Audit-Pflicht: nein.
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { mapDbError, notFound } from "@/lib/crud/http";
import { tagUpdateSchema, type TagUpdate } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type TagSet = Partial<typeof schema.tags.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.tags.id, id),
    eq(schema.tags.main_account_id, mainAccountId),
    isNull(schema.tags.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.tags)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Tag");
  return json({ data: row });
});

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, tagUpdateSchema);
  const now = Date.now();
  const set: TagSet = { updated_at: now };
  if (input.name !== undefined) set.name = input.name;
  if (input.color !== undefined) set.color = input.color ?? null;

  try {
    const [row] = await db
      .update(schema.tags)
      .set(set)
      .where(scoped(id, auth.main_account_id))
      .returning();
    if (!row) throw notFound("Tag");
    return json({ data: row });
  } catch (err) {
    mapDbError(err);
  }
});

export const DELETE = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const now = Date.now();
  const [row] = await db
    .update(schema.tags)
    .set({ deleted_at: now, updated_at: now })
    .where(scoped(id, auth.main_account_id))
    .returning();
  if (!row) throw notFound("Tag");
  return json({ data: { id, deleted_at: now } });
});
