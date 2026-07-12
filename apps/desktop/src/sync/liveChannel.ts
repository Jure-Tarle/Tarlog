/**
 * sync/liveChannel.ts — the live update channel (doc 04 §5). WebSocket primary,
 * long-poll fallback. Emits {@link LiveEvent}s so the caller can mirror the live
 * timer state (and the other 14 event types) across devices in real time.
 *
 * Cascade (doc 04 §5.1): WebSocket → (SSE, server-owned) → Polling. This client
 * implements WebSocket with automatic degradation to long-poll (`/api/sync/poll`)
 * when the socket cannot be established or repeatedly drops.
 *
 * INERT: `start()` is a no-op unless a ServerClient is provided. `stop()` fully
 * tears down (socket + poll loop + timers), so a disconnect returns the app to
 * pure local mode with zero background work.
 */
import type { ServerClient } from "../lib/serverClient";
import { ServerUnreachableError } from "../lib/serverClient";
import type { LiveChannelStatus, LiveEvent } from "./types";

export interface LiveChannelHandlers {
  /** A live event arrived — mirror it locally (timer state, entry, …). */
  onEvent(event: LiveEvent): void;
  /** Active channel changed (websocket → polling → none) for the UI badge. */
  onStatus?(status: LiveChannelStatus): void;
  /** Pull the delta after a poll wakeup returns a new server revision. */
  onWake?(serverRevision: number): void;
}

export interface LiveChannelOptions {
  /** Max reconnect backoff, ms (default 30s). */
  maxBackoffMs?: number;
  /** WebSocket failures before degrading to polling (default 3). */
  wsFailThreshold?: number;
  /** Revision the poll loop starts from. */
  sinceRevision?: number;
}

type Socket = {
  close(): void;
  onopen: ((this: unknown, ev: unknown) => unknown) | null;
  onclose: ((this: unknown, ev: unknown) => unknown) | null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null;
  onmessage: ((this: unknown, ev: { data: unknown }) => unknown) | null;
};

/** Minimal WebSocket constructor shape (avoids a hard DOM lib dependency). */
type SocketCtor = new (url: string) => Socket;

function getWebSocketCtor(): SocketCtor | null {
  const g = globalThis as { WebSocket?: SocketCtor };
  return g.WebSocket ?? null;
}

export class LiveChannel {
  private status: LiveChannelStatus = "none";
  private ws: Socket | null = null;
  private wsFailures = 0;
  private backoffMs = 1000;
  private since: number;
  private stopped = true;
  private pollAbort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly maxBackoffMs: number;
  private readonly wsFailThreshold: number;

  constructor(
    private readonly client: ServerClient | null,
    private readonly handlers: LiveChannelHandlers,
    opts: LiveChannelOptions = {},
  ) {
    this.maxBackoffMs = opts.maxBackoffMs ?? 30_000;
    this.wsFailThreshold = opts.wsFailThreshold ?? 3;
    this.since = opts.sinceRevision ?? 0;
  }

  currentStatus(): LiveChannelStatus {
    return this.status;
  }

  /** Advance the poll/pull high-water mark (call after a successful pull). */
  setRevision(revision: number): void {
    if (revision > this.since) this.since = revision;
  }

  /** Open the channel. No-op without a server client (pure local mode). */
  start(): void {
    if (!this.client) return;
    if (!this.stopped) return;
    this.stopped = false;
    this.wsFailures = 0;
    this.connect();
  }

  /** Tear everything down and return to `none`. Idempotent. */
  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.pollAbort) {
      this.pollAbort.abort();
      this.pollAbort = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.setStatus("none");
  }

  private setStatus(status: LiveChannelStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatus?.(status);
  }

  private connect(): void {
    if (this.stopped || !this.client) return;
    if (this.wsFailures >= this.wsFailThreshold) {
      this.startPolling();
      return;
    }
    const Ctor = getWebSocketCtor();
    if (!Ctor) {
      this.startPolling();
      return;
    }
    let sock: Socket;
    try {
      sock = new Ctor(this.client.webSocketUrl());
    } catch {
      this.onWsFailure();
      return;
    }
    this.ws = sock;
    sock.onopen = () => {
      this.wsFailures = 0;
      this.backoffMs = 1000;
      this.setStatus("websocket");
    };
    sock.onmessage = (ev) => this.handleMessage(ev.data);
    sock.onerror = () => {
      /* onclose handles teardown */
    };
    sock.onclose = () => {
      this.ws = null;
      if (this.stopped) return;
      this.onWsFailure();
    };
  }

  private onWsFailure(): void {
    this.wsFailures += 1;
    if (this.wsFailures >= this.wsFailThreshold) {
      this.startPolling();
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const event = parsed as LiveEvent;
    if (typeof event.type !== "string") return;
    if (typeof event.server_revision === "number") {
      this.setRevision(event.server_revision);
    }
    this.handlers.onEvent(event);
  }

  // -- Long-poll fallback (doc 04 §5.1 polling) ------------------------------

  private startPolling(): void {
    if (this.stopped || !this.client) return;
    if (this.status === "polling") return;
    this.setStatus("polling");
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped && this.client) {
      this.pollAbort = new AbortController();
      try {
        const res = await this.client.poll(this.since, this.pollAbort.signal);
        if (res.server_revision > this.since) {
          this.since = res.server_revision;
          this.handlers.onWake?.(res.server_revision);
        }
        for (const e of res.events) {
          if (e.hlc || e.entity_type) {
            this.handlers.onEvent({
              type: "sync_completed",
              entity_type: e.entity_type,
              entity_id: e.entity_id,
              payload: e.payload,
              hlc: e.hlc,
              server_revision: e.server_revision,
            });
          }
        }
        this.backoffMs = 1000;
      } catch (err) {
        if (this.stopped) break;
        if (err instanceof ServerUnreachableError) {
          await this.sleep(this.nextBackoff());
        } else {
          await this.sleep(this.nextBackoff());
        }
      }
    }
    this.pollAbort = null;
  }

  private nextBackoff(): number {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
    return delay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      // Allow abort to also cancel the wait.
      this.pollAbort?.signal.addEventListener("abort", () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
