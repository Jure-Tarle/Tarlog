/**
 * GET /api/devices — verbundene Geräte des eigenen main_account listen
 * (doc 05 §5 Nr. 9 Geräteübersicht). Nur nicht-sensible Felder; keine Tokens.
 * Main-Account-Scoping erzwungen (doc 05 §5.1).
 */
import { and, desc, eq, isNull } from "drizzle-orm";
import { json, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const devices = await db
    .select({
      id: schema.devices.id,
      device_name: schema.devices.device_name,
      platform: schema.devices.platform,
      app_version: schema.devices.app_version,
      last_sync_at: schema.devices.last_sync_at,
      sync_status: schema.devices.sync_status,
      server_connected: schema.devices.server_connected,
      permission_status: schema.devices.permission_status,
      revoked: schema.devices.revoked,
      live_channel_status: schema.devices.live_channel_status,
      connected_at: schema.devices.connected_at,
      created_at: schema.devices.created_at,
      updated_at: schema.devices.updated_at,
    })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.main_account_id, auth.main_account_id),
        isNull(schema.devices.deleted_at),
      ),
    )
    .orderBy(desc(schema.devices.connected_at));

  return json({ devices });
});
