/**
 * POST /api/auth/setup — Erststart-Wizard: legt GENAU EINEN main_account +
 * Setup-Gerät + local_profile an und meldet den Admin sofort an (doc 05 §9.3,
 * doc 02 §4). Danach gesperrt: ein zweiter Aufruf liefert 409.
 *
 * Atomar über eine Transaktion mit `pg_advisory_xact_lock`, damit zwei parallele
 * Erststarts nicht zwei Accounts erzeugen (race-safe Single-Account-Invariante).
 */
import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { createOnboardingProgress } from "@tarlog/core";
import { ApiError, json, parseJson } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/session";
import { assertSameOrigin, getClientIp, hashIp, publicRoute } from "@/lib/auth/http";
import {
  setBrowserDeviceCookie,
  setSessionCookie,
  setSetupCookie,
} from "@/lib/auth/cookies";
import { writeAuditLog } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/ratelimit";
import { SetupSchema } from "@/lib/auth/schemas";
import { APP_VERSION } from "@/lib/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Konstanter Lock-Key für den Erststart-Kritischen-Abschnitt. */
const SETUP_LOCK_KEY = 918_273_645;

export const POST = publicRoute(async (req: NextRequest) => {
  assertSameOrigin(req);
  const ip = getClientIp(req);
  if (!rateLimit(`setup:${ip}`, 5, 60 * 60 * 1000)) {
    throw new ApiError("rate_limited", "Zu viele Setup-Versuche. Bitte später erneut.");
  }
  // Cheap fail-fast before JSON parsing and the deliberately expensive Argon2
  // hash. The advisory-lock check below remains the race-safe authority.
  const configured = await db
    .select({ id: schema.mainAccounts.id })
    .from(schema.mainAccounts)
    .limit(1);
  if (configured.length > 0) {
    throw new ApiError("conflict", "Setup ist bereits abgeschlossen.");
  }
  const body = await parseJson(req, SetupSchema);

  const password_hash = await hashPassword(body.password);
  const now = Date.now();
  const mainAccountId = uuidv7();
  const deviceId = uuidv7();

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`);
    const existing = await tx
      .select({ id: schema.mainAccounts.id })
      .from(schema.mainAccounts)
      .limit(1);
    if (existing.length > 0) {
      throw new ApiError("conflict", "Setup ist bereits abgeschlossen.");
    }

    await tx.insert(schema.mainAccounts).values({
      id: mainAccountId,
      display_name: body.display_name,
      mode: "server",
      email: body.email ?? null,
      company_name: body.company_name ?? null,
      default_currency: body.default_currency ?? "EUR",
      default_locale: body.default_locale ?? "de-DE",
      default_timezone: body.default_timezone ?? "Europe/Berlin",
      password_hash,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(schema.devices).values({
      id: deviceId,
      main_account_id: mainAccountId,
      device_name: body.device_name ?? "Setup-Browser",
      platform: "web",
      app_version: APP_VERSION,
      local_db_version: 1,
      sync_status: "synced",
      server_connected: true,
      permission_status: "active",
      revoked: false,
      connected_at: now,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(schema.localProfiles).values({
      id: uuidv7(),
      main_account_id: mainAccountId,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    });

    await tx.insert(schema.settings).values({
      id: uuidv7(),
      main_account_id: mainAccountId,
      scope: "account",
      device_id: null,
      key: "onboarding_v1",
      value_json: createOnboardingProgress() as unknown as Record<string, unknown>,
      created_at: now,
      updated_at: now,
    });

    // Standard-Rundungsregel: je angefangenes 15-Minuten-Intervall aufrunden
    // (doc 07/14, AC18). Ohne diese globale Default-Regel bliebe die Abrechnung
    // Pass-Through (billing = net). Projekte/Kunden können sie überschreiben.
    await tx.insert(schema.roundingRules).values({
      id: uuidv7(),
      main_account_id: mainAccountId,
      name: "Standard — 15 Minuten aufrunden",
      mode: "ceil_started_interval",
      interval_minutes: 15,
      scope: "global",
      valid_from: "1970-01-01",
      calculation_version: 1,
      created_at: now,
      updated_at: now,
    });
  });

  // Audit: das Setup-Gerät ist die erste Geräteverbindung.
  await writeAuditLog({
    actor_id: mainAccountId,
    main_account_id: mainAccountId,
    device_id: deviceId,
    entity_type: "devices",
    entity_id: deviceId,
    action: "device_connected",
    after_json: { device_name: body.device_name ?? "Setup-Browser", platform: "web", source: "setup" },
    source: "ui",
  });

  const ua = req.headers.get("user-agent") ?? undefined;
  const session = await createSession({
    main_account_id: mainAccountId,
    device_id: deviceId,
    ip_hash: hashIp(ip),
    user_agent: ua,
  });

  const res = json(
    { ok: true, main_account_id: mainAccountId, device_id: deviceId },
    { status: 201 },
  ) as NextResponse;
  setSessionCookie(res, session.token, session.expires_at);
  setBrowserDeviceCookie(res, deviceId);
  setSetupCookie(res);
  return res;
});
