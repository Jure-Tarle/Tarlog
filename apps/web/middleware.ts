/**
 * middleware.ts, Auth-Gate für geschützte Seiten (doc 05 §5.1, doc 09).
 *
 * WICHTIG: Middleware läuft im Edge-Runtime und darf KEIN `pg`/Node-Crypto
 * importieren. Sie macht daher nur eine LEICHTE Vorprüfung:
 *  - Ist eine Setup-abgeschlossen-Markierung gesetzt? (Cookie `ptl_setup`)
 *    Wenn nein → Redirect nach /setup (Erststart-Wizard, doc 05 §9.3).
 *  - Ist ein Session-Cookie vorhanden? Wenn nein → Redirect nach /login.
 *
 * Die ECHTE Session-Validierung (DB-Lookup gegen `sessions`, `main_account`-
 * Scoping) macht der Auth-Autor serverseitig in einem Layout/Server-Component
 * via `getAuth()` (lib/api). Diese Middleware ist nur der erste Filter, damit
 * unauthentifizierte Requests gar nicht erst teure Seiten rendern.
 *
 * Der Auth-Autor kann die Cookie-Namen/Redirect-Ziele hier verfeinern.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Session-Cookie (muss zu SESSION_COOKIE in lib/session.ts passen). */
const SESSION_COOKIE = "ptl_session";
/** Markierung "Server-Setup abgeschlossen" (vom Setup-Wizard gesetzt). */
const SETUP_COOKIE = "ptl_setup";

/** Pfade ohne Auth (öffentlich). */
const PUBLIC_PREFIXES = ["/login", "/setup"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Öffentliche Pfade immer durchlassen.
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Kein abgeschlossenes Setup → zum Erststart-Wizard.
  const setupDone = req.cookies.get(SETUP_COOKIE)?.value === "1";
  if (!setupDone) {
    const url = req.nextUrl.clone();
    url.pathname = "/setup";
    return NextResponse.redirect(url);
  }

  // Setup fertig, aber keine Session → Login.
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * Gilt für alle App-Seiten, aber NICHT für API-Routen (die machen eigene
 * Auth über requireAuth), Next-Interna und statische Assets.
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|globals.css|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map)$).*)",
  ],
};
