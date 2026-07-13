/**
 * POST /api/auth/login — Session-Login am eigenen Server (doc 05 §5.1).
 *
 * Prüft das Passwort gegen `main_accounts.password_hash` (Argon2id), legt eine
 * Cookie-Session an und heilt das Setup-Gate-Cookie. Rate-Limit pro IP gegen
 * Brute-Force (doc 09 §5 Nr. 15). Fehler sind bewusst generisch (keine
 * Account-Enumeration).
 */
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, json, parseJson } from "@/lib/api";
import { createSession, verifyPassword } from "@/lib/session";
import { assertSameOrigin, getClientIp, hashIp, publicRoute } from "@/lib/auth/http";
import {
  getBrowserDeviceId,
  setBrowserDeviceCookie,
  setSessionCookie,
  setSetupCookie,
} from "@/lib/auth/cookies";
import { getOrCreateActiveWebDevice, getPrimaryMainAccount } from "@/lib/auth/setup";
import { rateLimit } from "@/lib/auth/ratelimit";
import { LoginSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = publicRoute(async (req: NextRequest) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  if (!rateLimit(`login:${ip}`, 10, 5 * 60 * 1000)) {
    throw new ApiError("rate_limited", "Zu viele Anmeldeversuche. Bitte später erneut.");
  }

  const body = await parseJson(req, LoginSchema);
  const account = await getPrimaryMainAccount(body.email);

  const ok =
    account?.password_hash != null &&
    (await verifyPassword(account.password_hash, body.password));
  if (!account || !ok) {
    throw new ApiError("unauthorized", "Anmeldung fehlgeschlagen.");
  }

  const deviceId = await getOrCreateActiveWebDevice(
    account.id,
    getBrowserDeviceId(req),
  );
  const session = await createSession({
    main_account_id: account.id,
    device_id: deviceId,
    ip_hash: hashIp(ip),
    user_agent: req.headers.get("user-agent") ?? undefined,
  });

  const res = json({ ok: true, main_account_id: account.id, device_id: deviceId }) as NextResponse;
  setSessionCookie(res, session.token, session.expires_at);
  setBrowserDeviceCookie(res, deviceId);
  setSetupCookie(res);
  return res;
});
