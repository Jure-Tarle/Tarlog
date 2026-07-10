/**
 * POST /api/timer/pause — laufenden Timer pausieren (doc 04 §3). Compare-and-Set
 * über timer_states.server_revision (409 conflict bei Divergenz).
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { timerPauseSchema } from "@/lib/timer/schemas";
import { pauseTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, timerPauseSchema);
  const result = await pauseTimer(auth, body);
  return json(result);
});
