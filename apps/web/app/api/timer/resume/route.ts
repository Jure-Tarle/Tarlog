/**
 * POST /api/timer/resume — pausierten Timer fortsetzen (doc 04 §3). Schließt die
 * laufende Pause als time_entry_breaks-Block ab und erhöht
 * accumulated_pause_seconds. Compare-and-Set über server_revision.
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { timerResumeSchema } from "@/lib/timer/schemas";
import { resumeTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, timerResumeSchema);
  const result = await resumeTimer(auth, body);
  return json(result);
});
