/**
 * /api/tokens — API-Tokens verwalten (doc 05 §9.3 Schritt 4, doc 09 §5 Nr. 18).
 *
 *  GET  → Tokens des eigenen main_account listen (nie Hash/Klartext, nur Prefix).
 *  POST → neues Token erstellen; Klartext GENAU EINMAL in der Antwort.
 *
 * Tokens werden nur als SHA-256-Hash persistiert (`api_tokens.token_hash`).
 * Main-Account-Scoping erzwungen.
 */
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { ApiError, json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { generateRawToken, hashToken } from "@/lib/session";
import { assertSameOrigin } from "@/lib/auth/http";
import { TokenCreateSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const tokens = await db
    .select({
      id: schema.apiTokens.id,
      name: schema.apiTokens.name,
      token_prefix: schema.apiTokens.token_prefix,
      scopes: schema.apiTokens.scopes,
      device_id: schema.apiTokens.device_id,
      last_used_at: schema.apiTokens.last_used_at,
      expires_at: schema.apiTokens.expires_at,
      revoked_at: schema.apiTokens.revoked_at,
      created_at: schema.apiTokens.created_at,
    })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.main_account_id, auth.main_account_id))
    .orderBy(desc(schema.apiTokens.created_at));

  return json({ tokens });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  assertSameOrigin(req);
  const body = await parseJson(req, TokenCreateSchema);

  // Optionale Geräte-Bindung muss zum eigenen main_account gehören.
  if (body.device_id) {
    const dev = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, body.device_id),
          eq(schema.devices.main_account_id, auth.main_account_id),
        ),
      )
      .limit(1);
    if (dev.length === 0) {
      throw new ApiError("validation_error", "Unbekannte device_id.");
    }
  }

  const now = Date.now();
  const id = uuidv7();
  const rawToken = generateRawToken();
  const tokenPrefix = rawToken.slice(0, 8);
  const scopes = body.scopes ?? ["*"];

  await db.insert(schema.apiTokens).values({
    id,
    main_account_id: auth.main_account_id,
    name: body.name,
    token_hash: hashToken(rawToken),
    token_prefix: tokenPrefix,
    scopes,
    device_id: body.device_id ?? null,
    expires_at: body.expires_at ?? null,
    created_at: now,
  });

  const res = json(
    {
      id,
      name: body.name,
      token: rawToken,
      token_prefix: tokenPrefix,
      scopes,
      device_id: body.device_id ?? null,
      expires_at: body.expires_at ?? null,
      created_at: now,
    },
    { status: 201 },
  ) as NextResponse;
  return res;
});
