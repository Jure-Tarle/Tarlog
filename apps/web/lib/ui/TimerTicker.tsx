"use client";
/**
 * lib/ui/TimerTicker.tsx — live tickende Netto-Dauer (HH:MM:SS).
 *
 * Rechnet Brutto − Pausen aus den rohen Timer-Feldern (doc 03 §3): laufende
 * Pause zählt nicht zur Nettozeit. Puls-Punkt signalisiert NUR echten
 * `running`-Zustand (doc 11 §1, respektiert prefers-reduced-motion via globals).
 */
import { useEffect, useState } from "react";
import { secondsToHMS } from "./format.js";

export interface TickerTimer {
  status: string;
  started_at: number | null;
  accumulated_pause_seconds: number | null;
  active_pause_started_at: number | null;
}

export function elapsedNetSeconds(t: TickerTimer | null, now: number): number {
  if (!t || !t.started_at) return 0;
  if (t.status === "idle" || t.status === "stopped") return 0;
  let paused = t.accumulated_pause_seconds ?? 0;
  if (t.status === "paused" && t.active_pause_started_at) {
    paused += Math.floor((now - t.active_pause_started_at) / 1000);
  }
  const gross = Math.floor((now - t.started_at) / 1000);
  return Math.max(0, gross - paused);
}

export function TimerTicker({
  timer,
  size = 28,
  showDot = true,
}: {
  timer: TickerTimer | null;
  size?: number;
  showDot?: boolean;
}): React.ReactElement {
  const running = timer?.status === "running";
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const secs = elapsedNetSeconds(timer, now);
  const active = timer && (timer.status === "running" || timer.status === "paused");

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {showDot ? (
        <span
          aria-hidden
          className={running ? "timer-pulse" : undefined}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            flexShrink: 0,
            background: active ? "var(--color-accent)" : "var(--color-text-faint)",
          }}
        />
      ) : null}
      <span
        className="tabular"
        style={{ fontSize: size, fontWeight: 600, color: active ? "var(--color-text)" : "var(--color-text-muted)" }}
      >
        {secondsToHMS(secs)}
      </span>
    </span>
  );
}
