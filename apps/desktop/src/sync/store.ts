/**
 * sync/store.ts, small key-value persistence for the server-connection state
 * (base URL, device token, revision high-water marks, last HLC).
 *
 * This is intentionally NOT the event outbox, sync events live in the
 * `sync_events` table (see `outbox.ts`). This store only holds the handful of
 * scalar sync settings. It is injectable so a later `src/data`-backed store can
 * replace the default without touching the engine.
 *
 * Default is a `localStorage` adapter, guarded for SSR / non-DOM contexts so
 * importing this module can never throw, keeping the client inert offline.
 */
import type { ServerConfig } from "./types";

/** Persisted, non-secret + secret scalar sync state. */
export interface SyncState {
  config: ServerConfig | null;
  lastPushedRevision: number;
  lastPulledRevision: number;
  lastHlc: string | null;
  /** Set only after a complete, non-buffered push + pull round succeeds. */
  lastSuccessfulSyncAt: number | null;
}

export const EMPTY_SYNC_STATE: SyncState = {
  config: null,
  lastPushedRevision: 0,
  lastPulledRevision: 0,
  lastHlc: null,
  lastSuccessfulSyncAt: null,
};

/** Persistence port for {@link SyncState}. Implementations must not throw. */
export interface SyncStore {
  load(): SyncState;
  save(state: SyncState): void;
  clear(): void;
}

const STORAGE_KEY = "ptl.sync.state.v1";

interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function webStorage(): WebStorageLike | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis) {
      return (globalThis as { localStorage: WebStorageLike }).localStorage;
    }
  } catch {
    // Access can throw in sandboxed contexts, treat as unavailable.
  }
  return null;
}

/** `localStorage`-backed store; falls back to in-memory if unavailable. */
export class LocalStorageSyncStore implements SyncStore {
  private memory: SyncState | null = null;

  load(): SyncState {
    const ls = webStorage();
    if (!ls) return this.memory ?? { ...EMPTY_SYNC_STATE };
    try {
      const raw = ls.getItem(STORAGE_KEY);
      if (!raw) return { ...EMPTY_SYNC_STATE };
      return { ...EMPTY_SYNC_STATE, ...(JSON.parse(raw) as Partial<SyncState>) };
    } catch {
      return { ...EMPTY_SYNC_STATE };
    }
  }

  save(state: SyncState): void {
    this.memory = state;
    const ls = webStorage();
    if (!ls) return;
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota / disabled storage, memory copy still holds for this session.
    }
  }

  clear(): void {
    this.memory = null;
    const ls = webStorage();
    if (!ls) return;
    try {
      ls.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/** Pure in-memory store (tests, or when no persistence is wanted). */
export class MemorySyncStore implements SyncStore {
  private state: SyncState = { ...EMPTY_SYNC_STATE };
  load(): SyncState {
    return { ...this.state };
  }
  save(state: SyncState): void {
    this.state = { ...state };
  }
  clear(): void {
    this.state = { ...EMPTY_SYNC_STATE };
  }
}
