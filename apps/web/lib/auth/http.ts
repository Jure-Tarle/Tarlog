/**
 * lib/auth/http.ts, Route-Helper für NICHT-authentifizierte Auth-Endpunkte
 * (Setup, Login, Logout, Session-Check, Geräte-Pairing-Connect) + CSRF-/IP-Helfer.
 *
 * `requireAuth` (lib/api) deckt bereits die authentifizierten Routen ab. Die
 * öffentlichen Auth-Routen brauchen denselben einheitlichen Fehler-Umschlag,
 * daher `publicRoute()`. `assertSameOrigin` erfüllt doc 09 §5 Nr. 8/12
 * (SameSite + Origin-Prüfung für zustandsändernde Requests). `getClientIp`/
 * `hashIp` speisen Rate-Limiting + Session-`ip_hash` (IP nie im Klartext).
 */
import type { NextRequest } from "next/server";
import { assertSameOrigin, toErrorResponse } from "@/lib/api";
import { hashToken } from "@/lib/session";

export { assertSameOrigin };

/** Wrappt einen öffentlichen Route-Handler: fängt ApiError/Fehler einheitlich. */
export function publicRoute<Ctx = unknown>(
  handler: (req: NextRequest, ctx: Ctx) => Promise<Response> | Response,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/**
 * Vom Custom Server gesetzte, nicht vom externen Request übernommene IP.
 * Unter `next dev` existiert dieser Header nicht; dort genügt der lokale Key.
 */
export function getClientIp(req: NextRequest): string {
  return req.headers.get("x-tarlog-client-ip") ?? "local";
}

/** SHA-256-Hex einer IP, Speicherform für `sessions.ip_hash` (doc 09 §5 Nr.13). */
export function hashIp(ip: string): string {
  return hashToken(ip);
}
