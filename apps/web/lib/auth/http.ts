/**
 * lib/auth/http.ts — Route-Helper für NICHT-authentifizierte Auth-Endpunkte
 * (Setup, Login, Logout, Session-Check, Geräte-Pairing-Connect) + CSRF-/IP-Helfer.
 *
 * `requireAuth` (lib/api) deckt bereits die authentifizierten Routen ab. Die
 * öffentlichen Auth-Routen brauchen denselben einheitlichen Fehler-Umschlag,
 * daher `publicRoute()`. `assertSameOrigin` erfüllt doc 09 §5 Nr. 8/12
 * (SameSite + Origin-Prüfung für zustandsändernde Requests). `getClientIp`/
 * `hashIp` speisen Rate-Limiting + Session-`ip_hash` (IP nie im Klartext).
 */
import type { NextRequest } from "next/server";
import { ApiError, toErrorResponse } from "@/lib/api";
import { hashToken } from "@/lib/session";

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
 * Origin-Prüfung für zustandsändernde Requests (CSRF-Härtung, doc 09 §5 Nr. 8).
 * Erlaubt fehlenden Origin (native Apps / Bearer-Clients senden keinen), lehnt
 * aber einen VORHANDENEN, nicht passenden Origin ab. Same-Site-Cookies decken
 * den Rest ab.
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // kein Browser-Origin → programmatischer Client, ok.
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("forbidden", "Ungültiger Origin.");
  }
  const host = req.headers.get("host") ?? req.nextUrl.host;
  if (originHost !== host) {
    throw new ApiError("forbidden", "Origin nicht erlaubt (CSRF-Schutz).");
  }
}

/** Beste-Schätzung Client-IP hinter Reverse-Proxy (doc 05 §9.1). */
export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "local";
}

/** SHA-256-Hex einer IP — Speicherform für `sessions.ip_hash` (doc 09 §5 Nr.13). */
export function hashIp(ip: string): string {
  return hashToken(ip);
}
