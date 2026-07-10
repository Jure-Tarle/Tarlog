/**
 * /api/time-entries/[id] — einzelner Zeiteintrag (doc 03 §7, doc 04 §6).
 *   GET    — Eintrag lesen (Account-scoped).
 *   PATCH  — Felder ändern; bei Zeit-/Pausenänderung Neuberechnung (@ptl/core);
 *            optimistische Sperre via expected_sync_version (Konfliktfall 6/7,
 *            Edit-auf-gelöscht = Konfliktfall 9 → 409 mit lokaler+Server-Version).
 *   DELETE — Soft-Delete (deleted_at), idempotent.
 */
import { pool } from "@/lib/db";
import { requireAuth, json, apiError, parseJson } from "@/lib/api";
import { timeEntryUpdateSchema } from "@/lib/timer/schemas";
import { updateTimeEntry, deleteTimeEntry } from "@/lib/timer/entries";
import { loadTimeEntry } from "@/lib/timer/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export const GET = requireAuth<Ctx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const entry = await loadTimeEntry(pool, id, auth.main_account_id);
  if (!entry || entry.deleted_at != null) {
    return apiError("not_found", "Zeiteintrag nicht gefunden.");
  }
  return json({ time_entry: entry });
});

export const PATCH = requireAuth<Ctx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, timeEntryUpdateSchema);
  const result = await updateTimeEntry(auth, id, body);
  return json(result);
});

export const DELETE = requireAuth<Ctx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const correlationId = req.nextUrl.searchParams.get("correlation_id");
  const result = await deleteTimeEntry(auth, id, correlationId);
  return json(result);
});
