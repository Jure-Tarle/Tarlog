/**
 * POST /api/devices/pairing — kurzlebigen Geräte-Pairing-Code erzeugen
 * (doc 05 §9.3 Schritt 3). Authentifiziert (Admin im Browser). Der Code wird
 * NUR jetzt im Klartext zurückgegeben; das neue Gerät löst ihn an
 * `POST /api/devices/connect` ein.
 */
import { json, parseJson, requireAuth } from "@/lib/api";
import { assertSameOrigin } from "@/lib/auth/http";
import { createPairingCode } from "@/lib/auth/pairing";
import { PairingCreateSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  assertSameOrigin(req);
  const body = await parseJson(req, PairingCreateSchema);
  const pairing = createPairingCode(auth.main_account_id, {
    deviceName: body.device_name,
    ttlSeconds: body.ttl_seconds,
  });
  return json(pairing);
});
