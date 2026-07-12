"use client";
/**
 * lib/ui/RealtimeRefresher.tsx — verbindet den Live-Kanal mit dem Server-Render.
 *
 * In eine Server-Seite eingehängt, ruft er bei relevanten Live-Events
 * `router.refresh()` auf, sodass serverseitig gelesene Listen/Kacheln aktuell
 * bleiben (doc 11 §3: „Zahlen aktualisieren sich live"). Optional zeigt er einen
 * dezenten Verbindungs-Indikator (Offline-Hinweis, doc 11 §3).
 */
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { useRealtime, type RealtimeStatus } from "./useRealtime.js";

const LABEL: Record<RealtimeStatus, string> = {
  connecting: "verbinde…",
  open: "live",
  polling: "live (Polling)",
  offline: "offline",
};

export function RealtimeRefresher({
  types,
  showIndicator = false,
  minIntervalMs = 1200,
}: {
  types?: string[];
  showIndicator?: boolean;
  minIntervalMs?: number;
}): React.ReactElement | null {
  const router = useRouter();
  const lastRefresh = useRef(0);

  const { status } = useRealtime({
    types,
    onEvent: () => {
      const now = Date.now();
      if (now - lastRefresh.current < minIntervalMs) return;
      lastRefresh.current = now;
      router.refresh();
    },
  });

  if (!showIndicator) return null;
  const live = status === "open" || status === "polling";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: live ? "var(--color-text-muted)" : "var(--color-warn)",
      }}
    >
      <span
        aria-hidden
        className={status === "open" ? "timer-pulse" : undefined}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: live ? "var(--color-accent)" : "var(--color-warn)",
        }}
      />
      {LABEL[status]}
    </span>
  );
}
