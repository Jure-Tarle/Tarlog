/**
 * POST /api/sync/events, Client-Events hochladen (doc 04 §1, §5).
 * Idempotent (Dedup über event_id/correlation_id), HLC + local_revision je
 * Event. Konflikt → conflict_records + Antwort 409 mit lokaler + Server-Version;
 * sonst 200 mit accepted-Liste und aktueller server_revision-Hochwassermarke.
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { syncPushSchema, type SyncPushBody } from "@/lib/sync/schemas";
import { pushEvents } from "@/lib/sync/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson<SyncPushBody>(req, syncPushSchema);
  const result = await pushEvents(auth, body.events);
  return json(result, { status: result.conflicts.length > 0 ? 409 : 200 });
});
