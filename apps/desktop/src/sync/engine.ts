/**
 * sync/engine.ts, orchestrates the optional server sync (doc 04).
 *
 * Responsibilities:
 *   - Pairing + connection lifecycle (delegates HTTP to {@link ServerClient}).
 *   - Push the local outbox (`sync_events`) and pull the server delta.
 *   - Turn a 409 into `conflict_records` + a UI structure, NEVER silent loss
 *     (doc 04 §6).
 *   - Offline queue: when the server is unreachable, existing outbox events
 *     stay pending and are flushed on reconnect.
 *   - Live channel wiring for real-time timer mirroring (doc 04 §5).
 *
 * TRANSPORT: `direct` uses {@link ServerClient} (fetch); `bridge` delegates to
 * the Rust `sync_push` / `sync_pull` commands via `src/lib/bridge.ts`. Both
 * satisfy doc 04, choose per deployment.
 *
 * INERT WITHOUT A SERVER: with no persisted `ServerConfig` every operation
 * returns `{ buffered: true }` and does no network I/O, so the local-first mode
 * is completely unaffected.
 */
import { bridge } from "../lib/bridge";
import {
  pairDevice,
  normalizeServerBaseUrl,
  ServerClient,
  ServerConflictError,
  ServerUnreachableError,
} from "../lib/serverClient";
import { listOpenConflicts, recordConflict } from "./conflicts";
import { LiveChannel, type LiveChannelHandlers } from "./liveChannel";
import {
  loadPendingEvents,
  markIncomingEventsApplied,
  markEventsPushed,
  stageIncomingEvent,
  toWireEvent,
} from "./outbox";
import {
  EMPTY_SYNC_STATE,
  LocalStorageSyncStore,
  type SyncState,
  type SyncStore,
} from "./store";
import type {
  ConflictView,
  LiveChannelStatus,
  LiveEvent,
  PairingInput,
  ServerConfig,
  SyncOutcome,
  WireEvent,
} from "./types";

export type SyncTransport = "direct" | "bridge";

export interface SyncEngineOptions {
  /** Persistence for connection state (default: localStorage). */
  store?: SyncStore;
  /** `direct` = fetch client, `bridge` = Rust commands. Default `direct`. */
  transport?: SyncTransport;
  /** Injected clock (tests). */
  now?: () => number;
  /**
   * Merge staged server changes into entity tables. Must resolve only after a
   * durable, idempotent merge; then the engine acknowledges the raw events.
   */
  onChanges?: (events: WireEvent[]) => void | Promise<void>;
  /** New conflicts detected this round (already persisted) → open the dialog. */
  onConflicts?: (conflicts: ConflictView[]) => void;
  /** Background pull failure from a live-channel wake-up. */
  onSyncError?: (error: unknown) => void;
  /** A live event to mirror (timer state, etc.). */
  onLiveEvent?: (event: LiveEvent) => void;
  /** Live-channel status changed (for the connection badge). */
  onChannelStatus?: (status: LiveChannelStatus) => void;
}

const OFFLINE: Omit<SyncOutcome, "serverRevision"> = {
  ok: true,
  count: 0,
  conflicts: 0,
  rejected: 0,
  buffered: true,
};

/** Incoming rows are staged, but no entity-table merge adapter is installed. */
export class SyncMergeRequiredError extends Error {
  constructor(readonly eventCount: number) {
    super(
      `${eventCount} Serveränderung${eventCount === 1 ? " wurde" : "en wurden"} sicher vorgemerkt, aber noch nicht in die lokalen Fachdaten übernommen.`,
    );
    this.name = "SyncMergeRequiredError";
  }
}

/** The installed entity-table merge adapter rejected or failed. */
export class SyncMergeFailedError extends Error {
  constructor(
    readonly eventCount: number,
    override readonly cause: unknown,
  ) {
    super(
      `${eventCount} vorgemerkte Serveränderung${eventCount === 1 ? " konnte" : "en konnten"} nicht in die lokalen Fachdaten übernommen werden.`,
    );
    this.name = "SyncMergeFailedError";
  }
}

/**
 * The API returns the account-wide high-water mark even when a page has more
 * rows. While `has_more` is true, advance only to the last delivered event or
 * the next request would skip the remaining page(s).
 */
export function nextPullCursor(
  current: number,
  response: import("./types").ChangesResponse,
): number {
  if (!response.has_more) return Math.max(current, response.server_revision);
  const pageCursor = response.events.reduce(
    (max, event) => Math.max(max, event.server_revision ?? current),
    current,
  );
  if (pageCursor <= current) {
    throw new Error("Server meldet weitere Sync-Seiten, aber keinen fortschreitenden Cursor.");
  }
  return pageCursor;
}

/** The sync engine. One instance per app; safe to construct in pure local mode. */
export class SyncEngine {
  private readonly store: SyncStore;
  private readonly transport: SyncTransport;
  private readonly now: () => number;
  private state: SyncState;
  private client: ServerClient | null = null;
  private live: LiveChannel | null = null;

  constructor(private readonly opts: SyncEngineOptions = {}) {
    this.store = opts.store ?? new LocalStorageSyncStore();
    this.transport = opts.transport ?? "direct";
    this.now = opts.now ?? (() => Date.now());
    this.state = this.store.load();
    if (this.state.config) {
      this.client = new ServerClient(this.state.config);
    }
  }

  /** True once a server is paired (doc 04 §1, server is optional). */
  isConfigured(): boolean {
    return this.state.config !== null;
  }

  get config(): ServerConfig | null {
    return this.state.config;
  }

  get channelStatus(): LiveChannelStatus {
    return this.live?.currentStatus() ?? "none";
  }

  /** Timestamp of the last fully successful (not merely configured) round. */
  get lastSuccessfulSyncAt(): number | null {
    return this.state.lastSuccessfulSyncAt;
  }

  private persist(): void {
    this.store.save(this.state);
  }

  // -- Pairing / connection --------------------------------------------------

  /**
   * Pair with a server (doc 04 §2): exchange the code for a device token, store
   * the config and open the live channel. Throws on pairing failure (bad code /
   * unreachable) so the UI can show it.
   */
  async pair(input: PairingInput): Promise<ServerConfig> {
    const res = await pairDevice(input);
    const config: ServerConfig = {
      baseUrl: normalizeServerBaseUrl(input.baseUrl),
      deviceToken: res.device_token,
      deviceId: res.device_id,
      mainAccountId: res.main_account_id,
    };
    this.state = {
      ...this.state,
      config,
      lastPulledRevision: Math.max(
        this.state.lastPulledRevision,
        res.server_revision,
      ),
    };
    this.persist();
    this.client = new ServerClient(config);
    this.connectLive();
    return config;
  }

  /** Open the live channel for an already-paired server (e.g. on app start). */
  connect(): void {
    if (!this.client) return;
    this.connectLive();
  }

  /**
   * Disconnect: tear down the live channel and forget the server config. The
   * local DB and outbox are untouched, the app returns to pure local mode.
   */
  disconnect(): void {
    this.live?.stop();
    this.live = null;
    this.client = null;
    this.state = { ...EMPTY_SYNC_STATE };
    this.store.clear();
  }

  private connectLive(): void {
    if (!this.client) return;
    this.live?.stop();
    const handlers: LiveChannelHandlers = {
      onEvent: (e) => this.opts.onLiveEvent?.(e),
      onStatus: (s) => this.opts.onChannelStatus?.(s),
      onWake: () => {
        // Without an entity merge adapter, an automatic pull could only stage
        // rows and fail. Leave that explicit action to the Sync page instead.
        if (!this.opts.onChanges) return;
        void this.pull().catch((error: unknown) => this.opts.onSyncError?.(error));
      },
    };
    this.live = new LiveChannel(this.client, handlers, {
      sinceRevision: this.state.lastPulledRevision,
    });
    this.live.start();
  }

  // -- Push / pull -----------------------------------------------------------

  /** Push + pull in one call (doc 04 §1). */
  async sync(): Promise<{ push: SyncOutcome; pull: SyncOutcome }> {
    const push = await this.push();
    const pull = await this.pull();
    if (
      push.ok && pull.ok &&
      !push.buffered && !pull.buffered &&
      push.conflicts === 0 && pull.conflicts === 0 &&
      push.rejected === 0 && pull.rejected === 0
    ) {
      this.state = { ...this.state, lastSuccessfulSyncAt: this.now() };
      this.persist();
    }
    return { push, pull };
  }

  /**
   * Push the local outbox (doc 04 §1.4). Offline / unconfigured ⇒ buffered
   * no-op (existing outbox rows remain pending). A 409 conflict is
   * persisted and reported, never dropped.
   */
  async push(): Promise<SyncOutcome> {
    const config = this.state.config;
    if (!config || !this.client) {
      return { ...OFFLINE, serverRevision: this.state.lastPushedRevision };
    }

    if (this.transport === "bridge") {
      return this.pushViaBridge();
    }

    const pending = await loadPendingEvents(config.mainAccountId);
    if (pending.length === 0) {
      return {
        ok: true,
        count: 0,
        serverRevision: this.state.lastPushedRevision,
        conflicts: 0,
        rejected: 0,
        buffered: false,
      };
    }

    const localRevision = pending.reduce(
      (max, e) => Math.max(max, e.local_revision),
      0,
    );
    const events: WireEvent[] = pending.map(toWireEvent);

    try {
      const res = await this.client.pushEvents({
        device_id: config.deviceId,
        local_revision: localRevision,
        events,
      });
      await markEventsPushed(
        res.accepted_event_ids ?? [],
        res.server_revision,
      );
      const conflictCount = await this.persistConflicts(
        res.conflicts ?? [],
      );
      const rejectedCount = res.rejected.length;
      this.state = {
        ...this.state,
        lastPushedRevision: Math.max(
          this.state.lastPushedRevision,
          res.server_revision,
        ),
      };
      this.persist();
      return {
        ok: rejectedCount === 0 && conflictCount === 0,
        count: res.accepted_event_ids?.length ?? 0,
        serverRevision: res.server_revision,
        conflicts: conflictCount,
        rejected: rejectedCount,
        buffered: false,
      };
    } catch (err) {
      if (err instanceof ServerUnreachableError) {
        // Offline: events remain pending, flushed on reconnect.
        return { ...OFFLINE, serverRevision: this.state.lastPushedRevision };
      }
      if (err instanceof ServerConflictError) {
        await markEventsPushed(err.acceptedEventIds, err.serverRevision);
        const conflictCount = await this.persistConflicts(err.conflicts);
        if (err.serverRevision > 0) {
          this.state = {
            ...this.state,
            lastPushedRevision: Math.max(
              this.state.lastPushedRevision,
              err.serverRevision,
            ),
          };
          this.persist();
        }
        return {
          ok: false,
          count: err.acceptedEventIds.length,
          serverRevision: err.serverRevision,
          conflicts: conflictCount,
          rejected: err.rejected.length,
          buffered: false,
        };
      }
      throw err;
    }
  }

  /**
   * Pull the server delta since the last revision (doc 04 §1 step 8), looping
   * while `has_more`. Every incoming event is first staged with `applied=0`.
   * The cursor advances only after an awaited entity merge and a durable
   * `applied=1` acknowledgement. Missing/failing merge adapters are explicit
   * errors; staged rows remain retryable. Offline ⇒ buffered no-op.
   */
  async pull(): Promise<SyncOutcome> {
    const config = this.state.config;
    if (!config || !this.client) {
      return { ...OFFLINE, serverRevision: this.state.lastPulledRevision };
    }

    if (this.transport === "bridge") {
      return this.pullViaBridge();
    }

    let since = this.state.lastPulledRevision;
    let total = 0;
    let drained = false;
    try {
      for (let guard = 0; guard < 1000; guard += 1) {
        const res = await this.client.getChanges(since);
        const pendingMerge: WireEvent[] = [];
        for (const e of res.events) {
          const needsMerge = await stageIncomingEvent(
            config.mainAccountId,
            config.deviceId,
            e,
            this.now(),
          );
          if (needsMerge) pendingMerge.push(e);
        }
        if (pendingMerge.length > 0) {
          const merge = this.opts.onChanges;
          if (!merge) throw new SyncMergeRequiredError(pendingMerge.length);
          try {
            await merge(pendingMerge);
          } catch (cause) {
            throw new SyncMergeFailedError(pendingMerge.length, cause);
          }
          await markIncomingEventsApplied(
            pendingMerge.map((event) => event.event_id),
          );
        }
        total += res.events.length;
        since = nextPullCursor(since, res);
        if (!res.has_more) {
          drained = true;
          break;
        }
      }
      if (!drained) throw new Error("Sync-Delta überschreitet das sichere Seitenlimit.");
      this.state = { ...this.state, lastPulledRevision: since };
      this.persist();
      this.live?.setRevision(since);
      return {
        ok: true,
        count: total,
        serverRevision: since,
        conflicts: 0,
        rejected: 0,
        buffered: false,
      };
    } catch (err) {
      if (err instanceof ServerUnreachableError) {
        return { ...OFFLINE, serverRevision: this.state.lastPulledRevision };
      }
      throw err;
    }
  }

  /** Reconnect flush (doc 04 §1 step 4): drain the offline outbox, then pull. */
  async flush(): Promise<{ push: SyncOutcome; pull: SyncOutcome }> {
    return this.sync();
  }

  /** Open conflicts for the dialog (doc 04 §6.1). Empty in pure local mode. */
  async openConflicts(): Promise<ConflictView[]> {
    if (!this.state.config) return [];
    return listOpenConflicts(this.state.config.mainAccountId);
  }

  // -- Bridge transport (Rust commands) -------------------------------------

  private async pushViaBridge(): Promise<SyncOutcome> {
    try {
      const r = await bridge.syncPush({
        sinceRevision: this.state.lastPushedRevision,
      });
      this.state = {
        ...this.state,
        lastPushedRevision: Math.max(
          this.state.lastPushedRevision,
          r.serverRevision,
        ),
      };
      this.persist();
      return {
        ok: r.ok,
        count: r.count,
        serverRevision: r.serverRevision,
        conflicts: r.conflicts,
        rejected: 0,
        buffered: false,
      };
    } catch {
      return { ...OFFLINE, serverRevision: this.state.lastPushedRevision };
    }
  }

  private async pullViaBridge(): Promise<SyncOutcome> {
    try {
      const r = await bridge.syncPull({
        sinceRevision: this.state.lastPulledRevision,
      });
      this.state = {
        ...this.state,
        lastPulledRevision: Math.max(
          this.state.lastPulledRevision,
          r.serverRevision,
        ),
      };
      this.persist();
      this.live?.setRevision(r.serverRevision);
      return {
        ok: r.ok,
        count: r.count,
        serverRevision: r.serverRevision,
        conflicts: r.conflicts,
        rejected: 0,
        buffered: false,
      };
    } catch {
      return { ...OFFLINE, serverRevision: this.state.lastPulledRevision };
    }
  }

  private async persistConflicts(
    conflicts: readonly import("./types").ConflictPayload[],
  ): Promise<number> {
    const config = this.state.config;
    if (!config || conflicts.length === 0) return 0;
    for (const c of conflicts) {
      await recordConflict(config.mainAccountId, config.deviceId, c, this.now());
    }
    const views = await listOpenConflicts(config.mainAccountId);
    this.opts.onConflicts?.(views);
    return conflicts.length;
  }
}
