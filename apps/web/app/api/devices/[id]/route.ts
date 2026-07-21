/**
 * DELETE /api/devices/{id}, Gerät widerrufen (doc 05 API Nr. 18, doc 09 §5
 * Nr. 14/16). Setzt `devices.revoked = true` (+ permission_status=revoked) und
 * widerruft atomar alle daran gebundenen `api_tokens` und Browser-Sessions.
 * Ein widerrufenes Gerät verliert damit API-, Sync-, Live- und Web-Rechte
 * sofort. Feuert `device.revoked` + Audit-Log. Main-Account-Scoping erzwungen.
 */
import { and, eq, isNull } from "drizzle-orm";
import { ApiError, json, requireSessionAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import { publishEvent } from "@/lib/events";
import { assertSameOrigin } from "@/lib/auth/http";
import { writeAuditLog } from "@/lib/auth/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = requireSessionAuth<{ params: Promise<{ id: string }> }>(
  async (req, ctx, auth) => {
    assertSameOrigin(req);
    const { id } = await ctx.params;
    const now = Date.now();

    const found = await db
      .select({ id: schema.devices.id, revoked: schema.devices.revoked })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.id, id),
          eq(schema.devices.main_account_id, auth.main_account_id),
        ),
      )
      .limit(1);
    if (found.length === 0) {
      throw new ApiError("not_found", "Gerät nicht gefunden.");
    }

    await db.transaction(async (tx) => {
      await tx
        .update(schema.devices)
        .set({
          revoked: true,
          permission_status: "revoked",
          server_connected: false,
          updated_at: now,
        })
        .where(
          and(
            eq(schema.devices.id, id),
            eq(schema.devices.main_account_id, auth.main_account_id),
          ),
        );
      await tx
        .update(schema.apiTokens)
        .set({ revoked_at: now })
        .where(
          and(
            eq(schema.apiTokens.device_id, id),
            eq(schema.apiTokens.main_account_id, auth.main_account_id),
            isNull(schema.apiTokens.revoked_at),
          ),
        );
      await tx
        .update(schema.sessions)
        .set({ revoked_at: now })
        .where(
          and(
            eq(schema.sessions.device_id, id),
            eq(schema.sessions.main_account_id, auth.main_account_id),
            isNull(schema.sessions.revoked_at),
          ),
        );
    });

    await writeAuditLog({
      actor_id: auth.user_id ?? auth.main_account_id,
      main_account_id: auth.main_account_id,
      device_id: auth.device_id ?? id,
      entity_type: "devices",
      entity_id: id,
      action: "device_disconnected",
      before_json: { revoked: found[0]?.revoked ?? false },
      after_json: { revoked: true },
      source: "api",
    });

    await publishEvent({
      type: "device.revoked",
      main_account_id: auth.main_account_id,
      device_id: auth.device_id ?? id,
      entity_type: "devices",
      entity_id: id,
      operation: "update",
      data: { device_id: id },
    });

    return json({ ok: true, device_id: id });
  },
);
