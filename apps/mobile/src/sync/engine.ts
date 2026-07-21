/**
 * engine.ts, the sync orchestrator (doc 04 §1 flow, §5 live cascade).
 *
 * Ties the transport client to the durable outbox, the high-water cursor, the
 * conflict list and a pluggable local applier. It is the single entry point the
 * Sync screen and background tasks drive:
 *   - `flush()`, push queued outbox events; 409 → conflict list, never lost.
 *   - `pull()`, fetch the foreign-device delta and apply it locally.
 *   - `sync()`, flush then pull (one round trip pair).
 *   - `startLiveMirror()`, long-poll loop to mirror a running timer live.
 *
 * INERT GUARANTEE: with no server paired (or while offline) every method
 * returns an outcome and mutates nothing remote, the local-first app is
 * unaffected. Applying incoming changes to local tables is delegated to a
 * `RemoteApplier` provided by the data layer (it owns `src/data` + row shapes);
 * the engine itself writes no entity rows and runs no business logic.
 */
import type { SQLiteDatabase } from "expo-sqlite";
import { getDb } from "../lib/db";
import {
  AuthError,
  ConflictError,
  NetworkError,
  ServerNotConfiguredError,
  getChanges,
  getServerConfig,
  poll,
  pushEvents,
  type ChangeEvent,
} from "../lib/serverClient";
import * as conflicts from "./conflicts";
import { getHighWater, setHighWater } from "./cursor";
import { markAccepted, pending, toEventInput } from "./outbox";

/**
 * Applies a change pulled from another device into the local DB. Implemented by
 * the data layer (which owns the table row shapes + field-level LWW merge). The
 * engine calls this once per incoming event, in `server_revision` order.
 */
export interface RemoteApplier {
  apply(event: ChangeEvent, db: SQLiteDatabase): Promise<void>;
}

/** No-op applier: advances the cursor only. Used until the data layer wires in. */
export const noopApplier: RemoteApplier = {
  async apply() {
    /* intentionally empty, high-water still advances in pull() */
  },
};

/** Why a sync step did nothing / what it did. */
export type SyncStatus =
  | "ok"
  | "local" // no server paired, local-only mode
  | "offline" // paired but transport failed; stays queued
  | "conflict" // server returned conflicts (surfaced to the list)
  | "auth"; // token rejected, re-pairing required

export interface FlushOutcome {
  status: SyncStatus;
  pushed: number;
  conflicts: number;
  rejected: number;
  serverRevision: number;
}

export interface PullOutcome {
  status: SyncStatus;
  applied: number;
  serverRevision: number;
}

/** Push all queued outbox events. Never throws for offline/local/conflict. */
export async function flush(db: SQLiteDatabase = getDb()): Promise<FlushOutcome> {
  const cfg = await getServerConfig();
  if (!cfg) return { status: "local", pushed: 0, conflicts: 0, rejected: 0, serverRevision: 0 };

  const rows = pending(db);
  if (rows.length === 0) {
    return { status: "ok", pushed: 0, conflicts: 0, rejected: 0, serverRevision: 0 };
  }
  const events = rows.map((r) => toEventInput(r));

  try {
    const result = await pushEvents(events);
    markAccepted(db, result.accepted, result.server_revision);
    await setHighWater(result.server_revision);
    return {
      status: "ok",
      pushed: result.accepted.length,
      conflicts: 0,
      rejected: result.rejected.length,
      serverRevision: result.server_revision,
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      const byId = new Map(rows.map((r) => [r.id, r] as const));
      // Accepted-in-part events still clear from the queue.
      markAccepted(db, err.result.accepted, err.result.server_revision);
      conflicts.record(err.result.conflicts, (id) => {
        const r = byId.get(id);
        return r ? { entity_type: r.entity_type, entity_id: r.entity_id } : undefined;
      });
      await setHighWater(err.result.server_revision);
      return {
        status: "conflict",
        pushed: err.result.accepted.length,
        conflicts: err.result.conflicts.length,
        rejected: err.result.rejected.length,
        serverRevision: err.result.server_revision,
      };
    }
    if (err instanceof AuthError) {
      return { status: "auth", pushed: 0, conflicts: 0, rejected: 0, serverRevision: 0 };
    }
    if (err instanceof NetworkError || err instanceof ServerNotConfiguredError) {
      // Offline / unpaired mid-flight → keep everything queued, retry later.
      return { status: "offline", pushed: 0, conflicts: 0, rejected: 0, serverRevision: 0 };
    }
    throw err; // unexpected ServerError, let the caller see it
  }
}

/** Pull + apply the foreign-device delta since the local high-water mark. */
export async function pull(
  applier: RemoteApplier = noopApplier,
  db: SQLiteDatabase = getDb(),
): Promise<PullOutcome> {
  const cfg = await getServerConfig();
  if (!cfg) return { status: "local", applied: 0, serverRevision: 0 };

  let applied = 0;
  let serverRevision = 0;
  try {
    // Drain in pages while the server reports more.
    for (;;) {
      const since = await getHighWater();
      const res = await getChanges(since);
      for (const ev of res.events) {
        await applier.apply(ev, db);
        await setHighWater(ev.server_revision);
        applied += 1;
      }
      serverRevision = res.server_revision;
      if (!res.has_more || res.events.length === 0) break;
    }
    await setHighWater(serverRevision);
    return { status: "ok", applied, serverRevision };
  } catch (err) {
    if (err instanceof AuthError) return { status: "auth", applied, serverRevision };
    if (err instanceof NetworkError || err instanceof ServerNotConfiguredError) {
      return { status: "offline", applied, serverRevision };
    }
    throw err;
  }
}

/** Flush local events then pull remote changes. */
export async function sync(
  applier: RemoteApplier = noopApplier,
  db: SQLiteDatabase = getDb(),
): Promise<{ flush: FlushOutcome; pull: PullOutcome }> {
  const flushOut = await flush(db);
  const pullOut = await pull(applier, db);
  return { flush: flushOut, pull: pullOut };
}

/** Handle to stop a running live-mirror loop. */
export interface LiveMirrorHandle {
  stop(): void;
}

/**
 * Start a long-poll loop that mirrors live changes (e.g. a running timer, doc
 * 04 §5) into the local DB via `applier`. Inert without a paired server. On
 * network failure it backs off and retries; on auth failure it stops. Call the
 * returned handle's `stop()` to end the loop (e.g. on screen unmount).
 */
export function startLiveMirror(
  applier: RemoteApplier = noopApplier,
  db: SQLiteDatabase = getDb(),
  backoffMs = 5_000,
): LiveMirrorHandle {
  let stopped = false;

  const run = async (): Promise<void> => {
    while (!stopped) {
      const cfg = await getServerConfig();
      if (!cfg) return; // unpaired → nothing to mirror

      try {
        const since = await getHighWater();
        const res = await poll(since);
        if (stopped) return;
        for (const ev of res.events) {
          await applier.apply(ev, db);
          await setHighWater(ev.server_revision);
        }
      } catch (err) {
        if (err instanceof AuthError || err instanceof ServerNotConfiguredError) return;
        if (err instanceof NetworkError) {
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }
    }
  };

  void run();
  return {
    stop() {
      stopped = true;
    },
  };
}
