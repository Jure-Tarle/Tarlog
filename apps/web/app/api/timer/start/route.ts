/**
 * POST /api/timer/start, Timer starten (doc 04 §3, §4). Single-Timer: läuft
 * bereits einer (running|paused), antwortet 409 conflict mit der Server-Version
 * (Konfliktfall 1) + conflict_records-Eintrag.
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { timerStartSchema } from "@/lib/timer/schemas";
import { startTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, timerStartSchema);
  const result = await startTimer(auth, body);
  return json(result);
});
