/**
 * POST /api/timer/stop — Timer stoppen und Zeiteintrag finalisieren (doc 04 §3,
 * doc 07). Berechnung via @tarlog/core calculateEntry (aufgelöste Rundungsregel
 * Projekt>Kunde>Default + Rate Task>…>Default). Fehlt eine projektweise
 * Pflichtbeschreibung, geht der Timer in Status needs_description (kein Finalize)
 * und die Antwort trägt needs_description=true.
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { timerStopSchema } from "@/lib/timer/schemas";
import { stopTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, timerStopSchema);
  const result = await stopTimer(auth, body);
  return json(result);
});
