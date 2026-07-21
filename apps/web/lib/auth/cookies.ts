/**
 * lib/auth/cookies.ts, Set-Cookie-Helfer für Session, Browser-Gerät + Setup-Gate.
 *
 * Session-Cookie (`ptl_session`): HttpOnly + Secure + SameSite=Lax über
 * `sessionCookieAttributes()` (lib/session). Setup-Gate-Cookie (`ptl_setup`):
 * die leichte Markierung, die die Edge-`middleware.ts` liest, um vor
 * abgeschlossenem Setup nach /setup umzuleiten (doc 05 §9.3). Das langlebige
 * Browser-Geräte-Cookie enthält nur die nicht geheime `device_id`; HttpOnly
 * verhindert trotzdem, dass Anwendungs-JavaScript sie manipuliert/ausliest.
 */
import type { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieAttributes } from "@/lib/session";

/** Muss zu SETUP_COOKIE in middleware.ts passen. */
export const SETUP_COOKIE = "ptl_setup";
/** Stabile, browserindividuelle Bindung an `devices.id`. */
export const BROWSER_DEVICE_COOKIE = "ptl_web_device_id";
const SETUP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr.
const BROWSER_DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 Jahr.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validiert das nicht vertrauenswürdige Cookie und normalisiert es für SQL. */
export function parseBrowserDeviceId(value: string | undefined): string | null {
  const candidate = value?.trim();
  return candidate && UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : null;
}

/** Liest ausschließlich eine syntaktisch gültige Geräte-ID aus dem Request. */
export function getBrowserDeviceId(
  req: Pick<NextRequest, "cookies">,
): string | null {
  return parseBrowserDeviceId(req.cookies.get(BROWSER_DEVICE_COOKIE)?.value);
}

/** Sichere Attribute der langlebigen Browser-Gerätebindung. */
export function browserDeviceCookieAttributes(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BROWSER_DEVICE_COOKIE_MAX_AGE,
  };
}

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

/**
 * Bindet diesen Browser dauerhaft an sein Web-Gerät. Das Cookie wird beim
 * Logout bewusst nicht gelöscht, damit der nächste Login dasselbe Gerät nutzt.
 */
export function setBrowserDeviceCookie(
  res: NextResponse,
  deviceId: string,
): void {
  const normalized = parseBrowserDeviceId(deviceId);
  if (!normalized) throw new Error("Ungültige Browser-Geräte-ID.");
  res.cookies.set(
    BROWSER_DEVICE_COOKIE,
    normalized,
    browserDeviceCookieAttributes(),
  );
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
