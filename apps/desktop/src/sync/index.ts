/**
 * sync/ — the OPTIONAL server-connection module (doc 04).
 *
 * Public surface for the UI (Sync page) and the Timer author (live mirroring).
 * Everything is inert until a server is paired: `getSyncEngine()` is safe to
 * call in pure local mode and does zero network I/O until `pair()`.
 *
 *   import { getSyncEngine } from "../sync";
 *   const sync = getSyncEngine({ onLiveEvent: mirrorTimer });
 *   if (!sync.isConfigured()) { /* local mode — nothing to do *\/ }
 */
export * from "./types";
export { HlcClock, formatHlc, parseHlc } from "./hlc";
export {
  LocalStorageSyncStore,
  MemorySyncStore,
  EMPTY_SYNC_STATE,
  type SyncStore,
  type SyncState,
} from "./store";
export {
  conflictCaseLabel,
  diffVersions,
  listOpenConflicts,
  recordConflict,
  resolveConflict,
} from "./conflicts";
export {
  countPendingEvents,
  loadPendingEvents,
  toWireEvent,
} from "./outbox";
export { LiveChannel, type LiveChannelHandlers } from "./liveChannel";
export {
  SyncEngine,
  type SyncEngineOptions,
  type SyncTransport,
} from "./engine";
export {
  ServerClient,
  ServerConflictError,
  ServerHttpError,
  ServerUnreachableError,
  pairDevice,
  toWebSocketUrl,
} from "../lib/serverClient";

import { SyncEngine, type SyncEngineOptions } from "./engine";

let singleton: SyncEngine | null = null;

/**
 * App-wide sync engine singleton. First call may pass options (callbacks);
 * later calls return the same instance. Construction is side-effect free until
 * a server is paired, so calling this in local mode is harmless.
 */
export function getSyncEngine(opts?: SyncEngineOptions): SyncEngine {
  if (!singleton) singleton = new SyncEngine(opts);
  return singleton;
}

/** Reset the singleton (tests). */
export function resetSyncEngine(): void {
  singleton = null;
}
