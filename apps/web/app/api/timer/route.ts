/**
 * GET /api/timer, aktueller Timer-Zustand des Main Accounts (doc 04 §3).
 * Liefert den aktiven (running|paused) bzw. zuletzt geänderten Timer oder null
 * (= idle). Für die persistente Timer-Kopfleiste (layout.tsx Slot).
 */
import { requireAuth, json } from "@/lib/api";
import { loadCurrentTimer } from "@/lib/timer/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const timer = await loadCurrentTimer(auth.main_account_id);
  return json({ timer });
});
