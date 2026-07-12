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
    let backoff = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollCursor: string | null = null;

    const clearTimers = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      pingTimer = pollTimer = null;
      reconnectTimer = null;
    };

    async function startPolling(): Promise<void> {
      if (disposed) return;
      if (!disposed) setStatus("polling");
      const tick = async () => {
        try {
          const url = pollCursor
            ? `${API.syncPoll}?since=${encodeURIComponent(pollCursor)}`
            : API.syncPoll;
          const res = await fetch(url, { credentials: "same-origin" });
          if (!res.ok) throw new Error(String(res.status));
          // /api/sync/poll → { events: ChangeEvent[], server_revision, has_more }
          const body = (await res.json()) as {
            events?: RealtimeEvent[];
            server_revision?: number;
            cursor?: string;
          };
          if (disposed) return;
          const next =
            body.server_revision != null ? String(body.server_revision) : body.cursor ?? pollCursor;
          const prime = pollCursor == null; // erster Aufruf setzt nur die Basislinie
          if (next != null) pollCursor = next;
          if (!prime) {
            for (const ev of body.events ?? []) emit(normalizeEvent(ev));
          }
          setStatus("polling");
        } catch {
          if (!disposed) setStatus("offline");
        }
      };
      pollTimer = setInterval(tick, pollIntervalMs);
      void tick();
    }

    async function connect(): Promise<void> {
      if (disposed) return;
      setStatus("connecting");
      let token: string | null = null;
      try {
        const res = await fetch(API.realtimeToken, { credentials: "same-origin" });
        if (res.ok) {
          const body = (await res.json()) as { token?: string };
          token = body.token ?? null;
        }
      } catch {
        token = null;
      }
      if (disposed) return;
      if (!token) {
        // Kein WS-Token verfügbar → Polling-Fallback.
        void startPolling();
        return;
      }
      try {
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${proto}//${location.host}/api/ws?token=${encodeURIComponent(token)}`);
      } catch {
        void startPolling();
        return;
      }

      ws.onopen = () => {
        if (disposed) return;
        backoff = 1000;
        setStatus("open");
        pingTimer = setInterval(() => {
          try {
            ws?.send(JSON.stringify({ kind: "ping" }));
          } catch {
            /* ignore */
          }
        }, 25_000);
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(typeof msg.data === "string" ? msg.data : "");
          if (data?.kind === "event") emit(data as RealtimeEvent);
        } catch {
          /* nicht-JSON ignorieren */
        }
      };
      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        if (pingTimer) clearInterval(pingTimer);
        pingTimer = null;
        setStatus("offline");
        // Backoff-Reconnect; fällt bei erneutem Fehlschlag auf Polling zurück.
        reconnectTimer = setTimeout(() => void connect(), backoff);
        backoff = Math.min(MAX_BACKOFF, backoff * 2);
      };
    }

    void connect();

    return () => {
      disposed = true;
      clearTimers();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, pollIntervalMs, emit]);

  return { status, lastEvent, connected: status === "open" };
}
