/**
 * lib/api.ts — Route-Handler-Helper (doc 05 §5 Design-Regeln).
 *
 * Einheitliches JSON-/Fehler-Format, Auth-Wrapper und Zod-Parse-Helper für alle
 * REST-Route-Handlers unter app/api/**. Fehlerobjekt-Form ist `{ error: { code,
 * message, details } }` (doc 05 §5 "einheitliches Fehlerobjekt"). Validierungs-
 * fehler kommen direkt aus Zod (`details` = `issues`).
 *
 * VERTRAG für Modul-Autoren:
 *   import { json, apiError, requireAuth, parseJson, parseQuery } from "@/lib/api";
 *
 *   export const POST = requireAuth(async (req, ctx, auth) => {
 *     const body = await parseJson(req, TimerStartSchema); // wirft ApiError bei Fehler
 *     …
 *     return json({ ok: true });
 *   });
 */
import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { ZodType, ZodError } from "zod";
import {
  SESSION_COOKIE,
  verifySession,
  verifyDeviceToken,
  type AuthContext,
} from "./session.js";

/** Standard-Fehlercodes (stabil; für Clients maschinenlesbar). */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "internal_error"
  | "bad_request";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
  bad_request: 400,
};

/**
 * Typisierter API-Fehler. In Route-Handlers werfbar; `requireAuth`/der Route-
 * Autor fängt ihn über `toErrorResponse` in eine JSON-Antwort.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;
  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

/** JSON-Erfolgsantwort mit optionalem Status (default 200). */
export function json<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** JSON-Fehlerantwort im einheitlichen Format (doc 05 §5). */
export function apiError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details !== undefined ? { details } : {}) } },
    { status: STATUS_BY_CODE[code] },
  );
}

/** Wandelt einen beliebigen Fehler in die einheitliche JSON-Fehlerantwort. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return apiError(err.code, err.message, err.details);
  }
  // Interne Fehler nie im Detail an den Client (doc 09).
  return apiError("internal_error", "Interner Serverfehler.");
}

// ---------------------------------------------------------------------------
// Zod-Parse-Helper — werfen ApiError("validation_error") mit Zod-issues
// ---------------------------------------------------------------------------

function zodDetails(err: ZodError): unknown {
  return err.issues;
}

/** Parst + validiert den JSON-Body gegen ein Zod-Schema (aus @tarlog/core). */
export async function parseJson<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError("bad_request", "Ungültiger JSON-Body.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      "validation_error",
      "Eingabe-Validierung fehlgeschlagen.",
      zodDetails(result.error),
    );
  }
  return result.data;
}

/** Parst + validiert die URL-Query gegen ein Zod-Schema. */
export function parseQuery<T>(req: NextRequest, schema: ZodType<T>): T {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ApiError(
      "validation_error",
      "Query-Validierung fehlgeschlagen.",
      zodDetails(result.error),
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Auth-Wrapper
// ---------------------------------------------------------------------------

/**
 * Ermittelt den Auth-Kontext aus (a) Bearer-Token (Authorization-Header) oder
 * (b) Session-Cookie. Liefert `null` wenn keiner gültig ist. Reine Leseoperation
 * — kann in Route-Handlers und Server-Components genutzt werden.
 */
export async function getAuth(): Promise<AuthContext | null> {
  const hdrs = await headers();
  const authz = hdrs.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const token = authz.slice("Bearer ".length).trim();
    const ctx = await verifyDeviceToken(token);
    if (ctx) return ctx;
  }
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE)?.value;
  if (cookieToken) {
    const ctx = await verifySession(cookieToken);
    if (ctx) return ctx;
  }
  return null;
}

/** Signatur eines authentifizierten Route-Handlers. */
export type AuthedHandler<Ctx = unknown> = (
  req: NextRequest,
  ctx: Ctx,
  auth: AuthContext,
) => Promise<Response> | Response;

/**
 * Wrappt einen Route-Handler: erzwingt gültige Auth (401 sonst), fängt
 * `ApiError`/Fehler und formatiert sie einheitlich. Der Handler bekommt den
 * `AuthContext` als drittes Argument.
 *
 *   export const POST = requireAuth(async (req, _ctx, auth) => { … });
 */
export function requireAuth<Ctx = unknown>(
  handler: AuthedHandler<Ctx>,
): (req: NextRequest, ctx: Ctx) => Promise<Response> {
  return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
    try {
      const auth = await getAuth();
      if (!auth) {
        return apiError("unauthorized", "Authentifizierung erforderlich.");
      }
      return await handler(req, ctx, auth);
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}
