"use client";
/**
 * lib/ui/useRealtime.ts — Live-Kanal-Hook (doc 05 §5/§7, doc 04 §5.2).
 *
 * Primär WebSocket auf `/api/ws` (server.mjs). Da der WS-Server per
 * Device-Token authentifiziert, holt der Browser zuerst einen kurzlebigen
 * Token über `GET /api/realtime/token` und verbindet damit. Bei fehlendem
 * Token/WS-Fehler → automatischer Reconnect mit Backoff, danach Polling-
 * Fallback auf `GET /api/sync/poll`. Alle Endpunkte degradieren still, falls
 * das jeweilige Modul (Auth/Sync) noch nicht bereitsteht → Status `offline`.
 *
 * Der Hook mutiert nichts; er meldet Events an `onEvent`. Seiten hängen daran
 * i. d. R. ein `router.refresh()` (siehe RealtimeRefresher).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "./api.js";

export type RealtimeStatus = "connecting" | "open" | "polling" | "offline";

/** Live-Event-Umschlag (server.mjs broadcast / sync poll). */
export interface RealtimeEvent {
  type: string;
  entity_type?: string;
  entity_id?: string;
  operation?: string;
  data?: Record<string, unknown>;
  created_at?: number;
  device_id?: string;
}

export interface UseRealtimeOptions {
  onEvent?: (ev: RealtimeEvent) => void;
  /** Nur bestimmte Event-Typen an `onEvent` durchreichen (Präfix-Match). */
  types?: string[];
  enabled?: boolean;
  pollIntervalMs?: number;
}

const MAX_BACKOFF = 15_000;

interface PollPage {
  events?: Array<RealtimeEvent & { server_revision?: number }>;
  server_revision?: number;
  has_more?: boolean;
}

/** Advance page-wise so an account high-water mark can never skip a backlog. */
export function nextRealtimePollCursor(current: number, page: PollPage): number {
  if (!page.has_more) return Math.max(current, page.server_revision ?? current);
  const pageCursor = (page.events ?? []).reduce(
    (maximum, event) => Math.max(maximum, event.server_revision ?? current),
    current,
  );
  if (pageCursor <= current) {
    throw new Error("Long-Poll meldet weitere Seiten ohne fortschreitenden Cursor.");
  }
  return pageCursor;
}

/**
 * Poll-Events (sync_events) tragen `entity_type`/`operation`, aber KEINEN
 * semantischen `type` wie der WS-Umschlag ("timer.started"). Für konsistentes
 * Filtern synthetisieren wir einen `type`-Präfix aus dem entity_type.
 */
const ENTITY_TYPE_PREFIX: Record<string, string> = {
  timer_states: "timer",
  time_entries: "time_entry",
  time_entry_breaks: "time_entry",
  invoices: "invoice",
  invoice_items: "invoice",
  exports: "export",
  export_files: "export",
  compliance_results: "compliance",
  devices: "device",
  sync_states: "sync",
  conflict_records: "sync.conflict",
};

function normalizeEvent(raw: RealtimeEvent): RealtimeEvent {
  if (raw.type) return raw;
  const prefix = raw.entity_type ? ENTITY_TYPE_PREFIX[raw.entity_type] : undefined;
  const op = raw.operation ?? "update";
  return { ...raw, type: prefix ? `${prefix}.${op}` : raw.entity_type ?? "sync.completed" };
}

export function useRealtime(opts: UseRealtimeOptions = {}): {
  status: RealtimeStatus;
  lastEvent: RealtimeEvent | null;
  connected: boolean;
} {
  const { onEvent, types, enabled = true, pollIntervalMs = 8000 } = opts;
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  // Stabile Refs, damit Reconnect/Poll-Closures aktuelle Werte sehen.
  const onEventRef = useRef(onEvent);
  const typesRef = useRef(types);
  onEventRef.current = onEvent;
  typesRef.current = types;

  const emit = useCallback((ev: RealtimeEvent) => {
    const filter = typesRef.current;
    if (filter && !filter.some((t) => ev.type?.startsWith(t))) return;
    setLastEvent(ev);
    onEventRef.current?.(ev);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let connectingWs = false;
    let backoff = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let polling = false;
    let pollAbort: AbortController | null = null;
    let pollCursor = 0;
    let cachedToken: { value: string; expiresAt: number } | null = null;

    const clearTimers = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      pingTimer = null;
      reconnectTimer = null;
    };

    const stopPolling = () => {
      polling = false;
      pollAbort?.abort();
      pollAbort = null;
    };

    async function pollLoop(): Promise<void> {
      while (!disposed && polling) {
        try {
          pollAbort = new AbortController();
          const url = `${API.syncPoll}?since=${pollCursor}&timeout=25000&limit=200`;
          const res = await fetch(url, {
            credentials: "same-origin",
            signal: pollAbort.signal,
          });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as PollPage;
          if (disposed || !polling) return;
          const nextCursor = nextRealtimePollCursor(pollCursor, body);
          for (const ev of body.events ?? []) emit(normalizeEvent(ev));
          pollCursor = nextCursor;
          setStatus("polling");
        } catch {
          if (disposed || !polling) return;
          setStatus("offline");
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        }
      }
    }

    function startPolling(): void {
      if (disposed || polling) return;
      polling = true;
      setStatus("polling");
      void pollLoop();
    }

    async function getRealtimeToken(): Promise<string | null> {
      if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) {
        return cachedToken.value;
      }
      try {
        const res = await fetch(API.realtimeToken, { credentials: "same-origin" });
        if (!res.ok) return null;
        const body = (await res.json()) as { token?: string; expires_at?: number };
        if (!body.token) return null;
        cachedToken = {
          value: body.token,
          expiresAt: body.expires_at ?? Date.now() + 60_000,
        };
        return body.token;
      } catch {
        return null;
      }
    }

    function scheduleReconnect(): void {
      if (disposed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, backoff);
      backoff = Math.min(MAX_BACKOFF, backoff * 2);
    }

    async function catchUpAfterOpen(socket: WebSocket): Promise<void> {
      try {
        for (let guard = 0; guard < 1000; guard += 1) {
          const res = await fetch(
            `${API.syncChanges}?since=${pollCursor}&limit=200`,
            { credentials: "same-origin" },
          );
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as PollPage;
          if (disposed || ws !== socket) return;
          for (const event of body.events ?? []) emit(normalizeEvent(event));
          pollCursor = nextRealtimePollCursor(pollCursor, body);
          if (!body.has_more) break;
          if (guard === 999) throw new Error("Realtime-Catch-up überschreitet das Seitenlimit.");
        }
      } catch {
        if (!disposed && ws === socket) socket.close();
        return;
      }
      if (disposed || ws !== socket) return;
      backoff = 1000;
      stopPolling();
      setStatus("open");
      pingTimer = setInterval(() => {
        try {
          socket.send(JSON.stringify({ kind: "ping" }));
        } catch {
          /* ignore */
        }
      }, 25_000);
    }

    async function connect(): Promise<void> {
      if (disposed || connectingWs || ws) return;
      connectingWs = true;
      if (!polling) setStatus("connecting");
      const token = await getRealtimeToken();
      connectingWs = false;
      if (disposed) return;
      if (!token) {
        startPolling();
        return;
      }
      let socket: WebSocket;
      let socketOpened = false;
      try {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        socket = new WebSocket(
          `${proto}//${location.host}/api/ws?token=${encodeURIComponent(token)}`,
        );
        ws = socket;
      } catch {
        startPolling();
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        if (disposed || ws !== socket) return;
        socketOpened = true;
        void catchUpAfterOpen(socket);
      };
      socket.onmessage = (msg) => {
        try {
          const data = JSON.parse(typeof msg.data === "string" ? msg.data : "");
          if (data?.kind === "event") emit(data as RealtimeEvent);
        } catch {
          /* nicht-JSON ignorieren */
        }
      };
      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (disposed) return;
        if (socketOpened) cachedToken = null;
        if (ws === socket) ws = null;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        startPolling();
        scheduleReconnect();
      };
    }

    // Start at revision zero. The socket is already registered when the
    // on-open catch-up runs, so events between SSR and WS registration are
    // either drained here or arrive live — never silently skipped.
    void connect();

    return () => {
      disposed = true;
      clearTimers();
      stopPolling();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, pollIntervalMs, emit]);

  return { status, lastEvent, connected: status === "open" };
}
