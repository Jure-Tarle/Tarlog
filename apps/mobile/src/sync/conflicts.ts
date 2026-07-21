/**
 * conflicts.ts, the local conflict list (doc 04 §6, §6.1 grundsatz 7).
 *
 * When the server returns a 409 the diverging change must be SURFACED, never
 * silently dropped. This is an observable in-memory registry the Sync screen
 * subscribes to; each entry is later resolved by the user via the conflict
 * dialog. Resolution itself (choose local / server / merge) is a data-layer +
 * UI concern, this store only holds and exposes the pending conflicts.
 *
 * NOTE (open point): entries are in-memory for the session. A durable
 * `conflict_records` table (as on the server) is the follow-up so conflicts
 * survive an app restart; see the module report.
 */
import type { PushConflict } from "../lib/serverClient";

/** A conflict awaiting user resolution. */
export interface LocalConflict {
  /** The client event id that conflicted (matches the outbox row id). */
  event_id: string;
  entity_type: string;
  entity_id: string;
  /** Numbered conflict case from doc 04 §6 (1..10). */
  conflict_case: number;
  message: string;
  /** The canonical server value, for the field-level diff dialog. */
  server_version?: unknown;
  /** When it was recorded locally (UTC epoch-ms). */
  detected_at: number;
}

type Listener = (conflicts: LocalConflict[]) => void;

const conflicts = new Map<string, LocalConflict>();
const listeners = new Set<Listener>();

function emit(): void {
  const snapshot = list();
  for (const l of listeners) l(snapshot);
}

/** Record conflicts returned by a push (deduped by event id). */
export function record(
  items: PushConflict[],
  lookup: (eventId: string) => { entity_type: string; entity_id: string } | undefined,
): void {
  if (items.length === 0) return;
  const now = Date.now();
  for (const c of items) {
    const ref = lookup(c.event_id);
    conflicts.set(c.event_id, {
      event_id: c.event_id,
      entity_type: ref?.entity_type ?? "",
      entity_id: ref?.entity_id ?? "",
      conflict_case: c.conflict_case,
      message: c.message,
      server_version: c.server_version,
      detected_at: now,
    });
  }
  emit();
}

/** Current conflicts, newest first. */
export function list(): LocalConflict[] {
  return [...conflicts.values()].sort((a, b) => b.detected_at - a.detected_at);
}

/** Number of unresolved conflicts (for the sync status badge). */
export function count(): number {
  return conflicts.size;
}

/** Mark a conflict resolved (remove it from the pending list). */
export function resolve(eventId: string): void {
  if (conflicts.delete(eventId)) emit();
}

/** Drop all conflicts (unpair / local wipe). */
export function clear(): void {
  if (conflicts.size > 0) {
    conflicts.clear();
    emit();
  }
}

/** Subscribe to conflict-list changes; returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(list());
  return () => {
    listeners.delete(listener);
  };
}
