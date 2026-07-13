/**
 * DELETE /api/tokens/{id} — API-Token widerrufen (doc 09 §5 Nr. 18). Setzt
 * `revoked_at`; ab dann lehnt verifyDeviceToken (+ server.mjs) das Token ab.
 * Idempotent-freundlich: bereits widerrufene/fremde Tokens → 404.
 * Main-Account-Scoping erzwungen.
 */
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, json, requireSessionAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { assertSameOrigin } from "@/lib/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = requireSessionAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx, auth) => {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const now = Date.now();

    const revoked = await db
      .update(schema.apiTokens)
      .set({ revoked_at: now })
      .where(
        and(
          eq(schema.apiTokens.id, id),
          eq(schema.apiTokens.main_account_id, auth.main_account_id),
          isNull(schema.apiTokens.revoked_at),
        ),
      )
      .returning({ id: schema.apiTokens.id });

    if (revoked.length === 0) {
      throw new ApiError("not_found", "Token nicht gefunden oder bereits widerrufen.");
    }

    return json({ ok: true, id });
  },
);
