import type { SyncOutcome } from "./types";

export type SyncUiPhase =
  | "local"
  | "configured"
  | "pairing"
  | "syncing"
  | "synced"
  | "offline"
  | "buffered"
  | "conflict"
  | "error";

export interface SyncRound {
  push: SyncOutcome;
  pull: SyncOutcome;
}

/** Reduce one real engine round to an honest, user-facing state. */
export function classifySyncRound(round: SyncRound): SyncUiPhase {
  const conflicts = round.push.conflicts + round.pull.conflicts;
  if (conflicts > 0) return "conflict";

  const rejected = round.push.rejected + round.pull.rejected;
  if (!round.push.ok || !round.pull.ok || rejected > 0) return "error";

  if (round.push.buffered || round.pull.buffered) return "buffered";
  return "synced";
}
