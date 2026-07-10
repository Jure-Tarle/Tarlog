/**
 * lib/session.ts — Sessions + Passwort-/Token-Hashing (doc 05 §5.1, doc 09).
 *
 * Zwei Auth-Wege (doc 05 §5.1):
 *  - Browser: sichere HttpOnly-Cookie-Session (`sessions`-Tabelle).
 *  - Desktop/iOS/Integrationen: Device-/Bearer-Token (`api_tokens`-Tabelle),
 *    gebunden an eine `device_id`, widerrufbar.
 *
 * Secrets werden NIE roh gespeichert: Passwörter Argon2id, Session-/Device-
 * Tokens als SHA-256-Hash (`session_hash` / `token_hash`), nur der Klartext-
 * Token geht einmalig an den Client. Cookie: HttpOnly + Secure + SameSite=Lax.
 *
 * Dieses Modul liefert das GERÜST + die Krypto-Helper. Die konkrete Login-/
 * Setup-Flow-Logik (Passwort prüfen, 2FA) implementiert der Auth-Autor.
 *
 * VERTRAG für Modul-Autoren:
 *   import {
 *     hashPassword, verifyPassword,
 *     createSession, verifySession, destroySession,
 *     hashToken, verifyDeviceToken,
 *     SESSION_COOKIE,
 *   } from "@/lib/session";
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { uuidv7 } from "uuidv7";
import { pool } from "./db.js";

/** Name des Session-Cookies. */
export const SESSION_COOKIE = "ptl_session" as const;
/** Cookie-Lebensdauer (14 Tage) in ms. */
export const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/** Argon2id-Parameter (doc 09 — sichere Defaults, moderat für Self-Host). */
const ARGON2ID_OPTS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

// ---------------------------------------------------------------------------
// Passwort (Argon2id)
// ---------------------------------------------------------------------------

/** Argon2id-Hash eines Klartext-Passworts (doc 05 §9.3, doc 09). */
export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON2ID_OPTS);
}

/** Prüft ein Klartext-Passwort gegen einen Argon2id-Hash. */
export async function verifyPassword(
  hashStr: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argonVerify(hashStr, plain);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Token-Hashing (SHA-256, für session_hash / token_hash)
// ---------------------------------------------------------------------------

/** SHA-256-Hex eines Tokens — Speicherform in `session_hash`/`token_hash`. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Konstantzeit-Vergleich zweier Hex-Hashes. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Kryptografisch zufälliger, URL-sicherer Roh-Token (Klartext, einmalig). */
export function generateRawToken(): string {
  // uuidv7 x2 → 256 Bit Entropie, kompakt und zeitgeordnet.
  return `${uuidv7().replace(/-/g, "")}${uuidv7().replace(/-/g, "")}`;
}

// ---------------------------------------------------------------------------
// Cookie-Session-Gerüst (sessions-Tabelle)
// ---------------------------------------------------------------------------

/** Serialisierte Cookie-Attribute (HttpOnly + Secure + SameSite=Lax). */
export function sessionCookieAttributes(
  maxAgeMs: number = SESSION_TTL_MS,
): {
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
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}

/** Auth-Kontext einer verifizierten Session/eines Tokens. */
export interface AuthContext {
  main_account_id: string;
  session_id?: string;
  device_id?: string;
  user_id?: string;
}

/** Ergebnis von `createSession` — Klartext-Token für das Set-Cookie. */
export interface CreatedSession {
  session_id: string;
  /** Klartext-Token; NUR dieser geht in das Cookie, wird NIE gespeichert. */
  token: string;
  expires_at: number;
}

/**
 * Legt eine Session in `sessions` an (speichert nur den Hash) und liefert den
 * Klartext-Token für das Set-Cookie. Der Aufrufer (Auth-Autor) setzt das
 * Cookie mit `sessionCookieAttributes()`.
 */
export async function createSession(params: {
  main_account_id: string;
  device_id?: string;
  user_id?: string;
  ip_hash?: string;
  user_agent?: string;
  ttlMs?: number;
}): Promise<CreatedSession> {
  const now = Date.now();
  const ttl = params.ttlMs ?? SESSION_TTL_MS;
  const sessionId = uuidv7();
  const token = generateRawToken();
  const expiresAt = now + ttl;

  await pool.query(
    `INSERT INTO sessions
       (id, main_account_id, user_id, session_hash, device_id, ip_hash,
        user_agent, expires_at, created_at, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      sessionId,
      params.main_account_id,
      params.user_id ?? null,
      hashToken(token),
      params.device_id ?? null,
      params.ip_hash ?? null,
      params.user_agent ?? null,
      expiresAt,
      now,
      now,
    ],
  );

  return { session_id: sessionId, token, expires_at: expiresAt };
}

/**
 * Prüft einen Session-Cookie-Token gegen `sessions`. Liefert `AuthContext`
 * bei gültiger, nicht abgelaufener, nicht widerrufener Session, sonst `null`.
 * Aktualisiert `last_seen_at`.
 */
export async function verifySession(token: string): Promise<AuthContext | null> {
  if (!token) return null;
  const now = Date.now();
  const res = await pool.query<{
    id: string;
    main_account_id: string;
    user_id: string | null;
    device_id: string | null;
    session_hash: string;
    expires_at: number;
    revoked_at: number | null;
  }>(
    `SELECT id, main_account_id, user_id, device_id, session_hash,
            expires_at, revoked_at
       FROM sessions
      WHERE session_hash = $1
      LIMIT 1`,
    [hashToken(token)],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.revoked_at != null) return null;
  if (row.expires_at <= now) return null;

  await pool.query(`UPDATE sessions SET last_seen_at = $1 WHERE id = $2`, [
    now,
    row.id,
  ]);

  return {
    main_account_id: row.main_account_id,
    session_id: row.id,
    device_id: row.device_id ?? undefined,
    user_id: row.user_id ?? undefined,
  };
}

/** Widerruft eine Session (setzt `revoked_at`). */
export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await pool.query(
    `UPDATE sessions SET revoked_at = $1 WHERE session_hash = $2 AND revoked_at IS NULL`,
    [Date.now(), hashToken(token)],
  );
}

// ---------------------------------------------------------------------------
// Device-/Bearer-Token (api_tokens-Tabelle) — auch vom WS-Server genutzt
// ---------------------------------------------------------------------------

/**
 * Prüft einen Device-/Bearer-Token gegen `api_tokens`. Nur gültig, wenn nicht
 * abgelaufen, nicht widerrufen UND das gebundene Gerät nicht `revoked` ist
 * (doc 04 §2 Nr. 10 — widerrufenes Gerät darf keine Events einspielen).
 * Aktualisiert `last_used_at`. Liefert `AuthContext` oder `null`.
 *
 * Diese Funktion ist die Wahrheit für die WS-Token-Auth (doppelt in server.mjs
 * als reines SQL gespiegelt, da server.mjs kein TS importieren kann).
 */
export async function verifyDeviceToken(
  token: string,
): Promise<AuthContext | null> {
  if (!token) return null;
  const now = Date.now();
  const res = await pool.query<{
    id: string;
    main_account_id: string;
    device_id: string | null;
    device_revoked: boolean | null;
  }>(
    `SELECT t.id, t.main_account_id, t.device_id, d.revoked AS device_revoked
       FROM api_tokens t
       LEFT JOIN devices d ON d.id = t.device_id
      WHERE t.token_hash = $1
        AND t.revoked_at IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $2)
      LIMIT 1`,
    [hashToken(token), now],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.device_revoked === true) return null;

  await pool.query(`UPDATE api_tokens SET last_used_at = $1 WHERE id = $2`, [
    now,
    row.id,
  ]);

  return {
    main_account_id: row.main_account_id,
    device_id: row.device_id ?? undefined,
  };
}
