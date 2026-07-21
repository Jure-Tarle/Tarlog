/**
 * POST /api/devices/connect, neues Gerät verbindet sich per Pairing-Code
 * (doc 05 API Nr. 17, doc 05 §9.3). ÖFFENTLICH (das neue Gerät hat noch kein
 * Token), aber durch den kurzlebigen, einmalig gültigen Code gesichert +
 * Rate-Limit pro IP.
 *
 * Legt eine `devices`-Row + eine `api_tokens`-Row (nur token_hash) an und gibt
 * das Device-Token GENAU EINMAL im Klartext zurück. Feuert `device.connected`
 * (Live-Kanal + sync_events) und schreibt einen Audit-Log-Eintrag.
 */
import { NextResponse, type NextRequest } from "next/server";
import { uuidv7 } from "uuidv7";
import { ApiError, json, parseJson } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { generateRawToken, hashToken } from "@/lib/session";
import { publishEvent } from "@/lib/events";
import { getClientIp, publicRoute } from "@/lib/auth/http";
import { rateLimit } from "@/lib/auth/ratelimit";
import { consumePairingCode } from "@/lib/auth/pairing";
import { writeAuditLog } from "@/lib/auth/audit";
import { DeviceConnectSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Default-Scopes eines gepairten Geräts (Sync + Timer + Zeiteinträge). */
const DEVICE_TOKEN_SCOPES = ["sync", "timer", "time_entries", "devices_read"] as const;

export const POST = publicRoute(async (req: NextRequest) => {
  const ip = getClientIp(req);
  if (!rateLimit(`connect:${ip}`, 20, 60 * 1000)) {
    throw new ApiError("rate_limited", "Zu viele Verbindungsversuche. Bitte später erneut.");
  }

  const body = await parseJson(req, DeviceConnectSchema);
  const entry = consumePairingCode(body.code);
  if (!entry) {
    throw new ApiError("unauthorized", "Ungültiger oder abgelaufener Pairing-Code.");
  }

  const now = Date.now();
  const deviceId = uuidv7();
  const tokenId = uuidv7();
  const rawToken = generateRawToken();
  const tokenPrefix = rawToken.slice(0, 8);

  await db.transaction(async (tx) => {
    await tx.insert(schema.devices).values({
      id: deviceId,
      main_account_id: entry.main_account_id,
      device_name: body.device_name,
      platform: body.platform,
      app_version: body.app_version,
      local_db_version: body.local_db_version ?? 1,
      sync_status: "pending",
      server_connected: true,
      permission_status: "active",
      revoked: false,
      connected_at: now,
      created_at: now,
      updated_at: now,
    });
    await tx.insert(schema.apiTokens).values({
      id: tokenId,
      main_account_id: entry.main_account_id,
      name: `Gerät: ${body.device_name}`,
      token_hash: hashToken(rawToken),
      token_prefix: tokenPrefix,
      scopes: [...DEVICE_TOKEN_SCOPES],
      device_id: deviceId,
      created_at: now,
    });
  });

  await writeAuditLog({
    actor_id: entry.main_account_id,
    main_account_id: entry.main_account_id,
    device_id: deviceId,
    entity_type: "devices",
    entity_id: deviceId,
    action: "device_connected",
    after_json: { device_name: body.device_name, platform: body.platform },
    source: "api",
  });

  await publishEvent({
    type: "device.connected",
    main_account_id: entry.main_account_id,
    device_id: deviceId,
    entity_type: "devices",
    entity_id: deviceId,
    operation: "create",
    data: { device_id: deviceId, device_name: body.device_name, platform: body.platform },
  });

  const res = json(
    {
      device_id: deviceId,
      main_account_id: entry.main_account_id,
      device_token: rawToken,
      token_prefix: tokenPrefix,
      scopes: [...DEVICE_TOKEN_SCOPES],
    },
    { status: 201 },
  ) as NextResponse;
  return res;
});
