/**
 * GET /api/sync/poll?since=&timeout= — Long-Poll (doc 04 §5.1 Fallback-Kaskade).
 * Hält die Verbindung bis ein Delta > since vorliegt oder timeout (≤25s) abläuft
 * (Polling-Fallback wenn WebSocket/SSE nicht verfügbar). Antwort wie /changes
 * plus timed_out.
 */
import type { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api";
import { pollChanges } from "@/lib/sync/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Node/Route darf bis zur Long-Poll-Obergrenze offen bleiben.
export const maxDuration = 30;

function intParam(req: NextRequest, key: string, def: number, max: number): number {
  const raw = req.nextUrl.searchParams.get(key);
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return def;
  return Math.min(n, max);
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const since = intParam(req, "since", 0, Number.MAX_SAFE_INTEGER);
  const limit = Math.max(1, intParam(req, "limit", 200, 1000));
  const timeoutMs = Math.max(1000, intParam(req, "timeout", 25000, 25000));
  const result = await pollChanges(auth, { since, limit, timeoutMs });
  return json(result);
});
