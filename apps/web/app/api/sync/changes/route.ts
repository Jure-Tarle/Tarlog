/**
 * GET /api/sync/changes?since=&limit= — Delta-Pull (doc 04 §1 Nr. 8, §5.1
 * Polling). Liefert sync_events fremder Geräte mit server_revision > since
 * (aufsteigend) plus die aktuelle Hochwassermarke und has_more.
 */
import type { NextRequest } from "next/server";
import { requireAuth, json } from "@/lib/api";
import { pullChanges } from "@/lib/sync/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intParam(req: NextRequest, key: string, def: number, max: number): number {
  const raw = req.nextUrl.searchParams.get(key);
  const n = raw == null ? NaN : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return def;
  return Math.min(n, max);
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const since = intParam(req, "since", 0, Number.MAX_SAFE_INTEGER);
  const limit = Math.max(1, intParam(req, "limit", 200, 1000));
  const result = await pullChanges(auth, { since, limit });
  return json(result);
});
