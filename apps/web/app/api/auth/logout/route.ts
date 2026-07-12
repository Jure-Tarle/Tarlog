/**
 * POST /api/auth/logout — Session serverseitig widerrufen + Cookie löschen
 * (doc 09 §5 Nr. 17 — Server-seitige Invalidierung, nicht nur Client-Löschung).
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { json } from "@/lib/api";
import { SESSION_COOKIE, destroySession } from "@/lib/session";
import { assertSameOrigin, publicRoute } from "@/lib/auth/http";
import { clearSessionCookie } from "@/lib/auth/cookies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicRoute(async (req: NextRequest) => {
  assertSameOrigin(req);
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);

  const res = json({ ok: true }) as NextResponse;
  clearSessionCookie(res);
  return res;
});
