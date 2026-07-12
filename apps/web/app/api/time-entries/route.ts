/**
 * /api/time-entries — Zeiteinträge auflisten + anlegen/nachtragen (doc 03 §7,
 * doc 04 §5).
 *   GET  ?from=&to=&project_id=&status=&limit=  — gefilterte Liste (Account-scoped,
 *        ohne soft-gelöschte), absteigend nach actual_started_at.
 *   POST — Nachtrag/manueller Eintrag (source, backdate_reason, breaks) mit
 *        Server-Berechnung (@ptl/core calculateEntry).
 */
import type { NextRequest } from "next/server";
import { requireAuth, json, parseJson } from "@/lib/api";
import { timeEntryCreateSchema, type TimeEntryCreateBody } from "@/lib/timer/schemas";
import { createTimeEntry } from "@/lib/timer/entries";
import { listTimeEntries } from "@/lib/timer/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function intParam(req: NextRequest, key: string): number | null {
  const raw = req.nextUrl.searchParams.get(key);
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const limitRaw = intParam(req, "limit");
  const limit = Math.min(Math.max(limitRaw ?? 100, 1), 500);
  const entries = await listTimeEntries({
    mainAccountId: auth.main_account_id,
    from: intParam(req, "from"),
    to: intParam(req, "to"),
    projectId: req.nextUrl.searchParams.get("project_id"),
    status: req.nextUrl.searchParams.get("status"),
    limit,
  });
  return json({ entries, count: entries.length });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson<TimeEntryCreateBody>(req, timeEntryCreateSchema);
  const result = await createTimeEntry(auth, body);
  return json(result, { status: 201 });
});
