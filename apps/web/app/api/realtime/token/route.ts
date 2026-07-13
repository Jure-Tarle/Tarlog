/**
 * GET /api/realtime/token — kurzlebiges, gerätegebundenes WebSocket-Token.
 *
 * Der Browser authentifiziert normale Requests per HttpOnly-Session-Cookie.
 * Ein WebSocket-Upgrade kann diesen Cookie-Pfad nicht über den Next-Handler
 * validieren, deshalb erhält die angemeldete Seite ein einmalig sichtbares
 * Device-Token mit kurzer Laufzeit. Gespeichert wird ausschließlich der Hash.
 * Unter `next dev` existiert kein Custom-Upgrade-Handler; dort signalisiert 204
 * dem Client, den verlässlichen Long-Poll-Fallback zu verwenden.
 */
import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { ApiError, json, requireSessionAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { generateRawToken, hashToken } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_TTL_MS = 5 * 60 * 1000;

export const GET = requireSessionAuth(async (_req, _ctx, auth) => {
  if (process.env.TARLOG_REALTIME_WS_ENABLED !== "1") {
    return new NextResponse(null, {
      status: 204,
      headers: { "cache-control": "private, no-store" },
    });
  }
  if (!auth.device_id) {
    throw new ApiError(
      "conflict",
      "Die Browser-Sitzung ist noch keinem aktiven Gerät zugeordnet.",
    );
  }

  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;
  const rawToken = generateRawToken();
  await db
    .delete(schema.apiTokens)
    .where(
      and(
        eq(schema.apiTokens.main_account_id, auth.main_account_id),
        eq(schema.apiTokens.name, "Browser-Livekanal"),
        lt(schema.apiTokens.expires_at, now),
      ),
    );
  await db.insert(schema.apiTokens).values({
    id: uuidv7(),
    main_account_id: auth.main_account_id,
    name: "Browser-Livekanal",
    token_hash: hashToken(rawToken),
    token_prefix: rawToken.slice(0, 8),
    scopes: ["realtime"],
    device_id: auth.device_id,
    expires_at: expiresAt,
    created_at: now,
  });

  const response = json({ token: rawToken, expires_at: expiresAt }) as NextResponse;
  response.headers.set("cache-control", "private, no-store");
  return response;
});
