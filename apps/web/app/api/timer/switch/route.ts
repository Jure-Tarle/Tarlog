/**
 * POST /api/timer/switch — Projekt/Aufgabe des laufenden Timers wechseln
 * (doc 04 §5.2 Nr. 6/7). Aktualisiert Timer + zugehörigen Zeiteintrag
 * (Abrechenbarkeit/Pflichtbeschreibung neu aufgelöst). Compare-and-Set.
 */
import { requireAuth, json, parseJson } from "@/lib/api";
import { timerSwitchSchema } from "@/lib/timer/schemas";
import { switchTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, timerSwitchSchema);
  const result = await switchTimer(auth, body);
  return json(result);
});
