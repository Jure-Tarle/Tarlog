/**
 * timer.ts — the single source of truth for the live timer in the UI.
 *
 * Wraps the `src/lib/bridge` timer commands and the persisted `timer_states`
 * singleton (doc 06 A.1). One `useTimer` hook feeds BOTH the persistent timer
 * bar (App shell) and the Timer page, so control stays consistent everywhere
 * (doc 11 §2). It also subscribes to tray menu events emitted by Rust
 * (doc 11 §5 nr. 1/10/11/12/13) so the menu-bar buttons drive the same state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  timerGetState,
  timerStart,
  timerPause,
  timerResume,
  timerStop,
  type TimerState,
  type TimerStopResult,
} from "../lib/bridge";
import type { Uuid, EpochMs } from "@tarlog/core";

/** Tray → frontend event names (Rust `app.emit(...)` from `tray.rs`). */
export const TRAY_EVENTS = {
  start: "tray://timer/start",
  pause: "tray://timer/pause",
  resume: "tray://timer/resume",
  stop: "tray://timer/stop",
  backdate: "tray://entry/backdate",
} as const;

/** In-app navigation request (e.g. tray "Nachtrag" opens the Backdating page). */
export const NAV_EVENT = "ptl:navigate";

/** Net elapsed working seconds for a timer state at instant `nowMs`. */
export function elapsedSeconds(t: TimerState | null, nowMs: number): number {
  if (!t || t.started_at == null) return 0;
  const acc = t.accumulated_pause_seconds ?? 0;
  const ref = t.status === "running" ? nowMs : (t.paused_at ?? nowMs);
  const raw = Math.floor((ref - t.started_at) / 1000) - acc;
  return raw > 0 ? raw : 0;
}

export interface UseTimer {
  state: TimerState | null;
  loading: boolean;
  error: string | null;
  /** Is a timer currently running or paused. */
  active: boolean;
  start: (args?: { projectId?: Uuid | null; taskId?: Uuid | null; description?: string | null; startedAt?: EpochMs | null }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: (args?: { description?: string | null; at?: EpochMs | null }) => Promise<TimerStopResult | null>;
  refresh: () => Promise<void>;
}

/** Broadcast so every mounted `useTimer` re-reads the singleton after a change. */
function broadcast(): void {
  window.dispatchEvent(new CustomEvent("ptl:timer-changed"));
}

export function useTimer(pollMs = 4000): UseTimer {
  const [state, setState] = useState<TimerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const s = await timerGetState();
      setState(s);
      setError(null);
    } catch (err) {
      // Backend not ready / no timer yet — treat as idle, surface nothing loud.
      setState(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + light polling + cross-instance sync.
  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), pollMs);
    const onChanged = () => void refresh();
    window.addEventListener("ptl:timer-changed", onChanged);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("ptl:timer-changed", onChanged);
    };
  }, [refresh, pollMs]);

  const start = useCallback<UseTimer["start"]>(async (args = {}) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const s = await timerStart(args);
      setState(s);
      broadcast();
    } finally {
      busy.current = false;
    }
  }, []);

  const pause = useCallback(async () => {
    const s = await timerPause({});
    setState(s);
    broadcast();
  }, []);

  const resume = useCallback(async () => {
    const s = await timerResume({});
    setState(s);
    broadcast();
  }, []);

  const stop = useCallback<UseTimer["stop"]>(async (args = {}) => {
    const res = await timerStop(args);
    setState(res.timer);
    broadcast();
    return res;
  }, []);

  // Subscribe to tray menu events → drive the same commands.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;
    const wire = async () => {
      try {
        unlisteners.push(await listen(TRAY_EVENTS.start, () => void start()));
        unlisteners.push(await listen(TRAY_EVENTS.pause, () => void pause()));
        unlisteners.push(await listen(TRAY_EVENTS.resume, () => void resume()));
        unlisteners.push(
          await listen(TRAY_EVENTS.stop, () => {
            // Stop from the tray must open the mandatory dialog (doc 11 §5 nr. 12).
            window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { route: "timer", action: "stop" } }));
          }),
        );
        unlisteners.push(
          await listen(TRAY_EVENTS.backdate, () => {
            window.dispatchEvent(new CustomEvent(NAV_EVENT, { detail: { route: "backdating" } }));
          }),
        );
      } catch {
        // Not running under Tauri (e.g. plain vite preview) — tray is unavailable.
      }
      if (cancelled) unlisteners.forEach((u) => u());
    };
    void wire();
    return () => {
      cancelled = true;
      unlisteners.forEach((u) => u());
    };
  }, [start, pause, resume, stop]);

  const active = useMemo(
    () => state?.status === "running" || state?.status === "paused",
    [state],
  );

  return { state, loading, error, active, start, pause, resume, stop, refresh };
}
