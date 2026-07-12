/**
 * lib/auth/cookies.ts — Set-Cookie-Helfer für Session + Setup-Gate.
 *
 * Session-Cookie (`ptl_session`): HttpOnly + Secure + SameSite=Lax über
 * `sessionCookieAttributes()` (lib/session). Setup-Gate-Cookie (`ptl_setup`):
 * die leichte Markierung, die die Edge-`middleware.ts` liest, um vor
 * abgeschlossenem Setup nach /setup umzuleiten (doc 05 §9.3).
 */
import type { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieAttributes } from "@/lib/session";

/** Muss zu SETUP_COOKIE in middleware.ts passen. */
export const SETUP_COOKIE = "ptl_setup";
const SETUP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr.

/** Setzt das Session-Cookie (Ablauf = Session-Ablauf). */
export function setSessionCookie(
  res: NextResponse,
  token: string,
  expiresAtMs: number,
): void {
  const maxAgeMs = Math.max(0, expiresAtMs - Date.now());
  res.cookies.set(SESSION_COOKIE, token, sessionCookieAttributes(maxAgeMs));
}

/** Löscht das Session-Cookie (Logout). */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieAttributes(0),
    maxAge: 0,
  });
}

/** Setzt die "Setup abgeschlossen"-Markierung für die Middleware. */
export function setSetupCookie(res: NextResponse): void {
  res.cookies.set(SETUP_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SETUP_COOKIE_MAX_AGE,
  });
}
