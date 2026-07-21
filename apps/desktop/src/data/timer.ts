/**
 * timer.ts, the single source of truth for the live timer in the UI.
 *
 * Wraps the `src/lib/bridge` timer commands and the persisted `timer_states`
 * singleton (doc 06 A.1). One `TimerProvider` feeds the persistent timer bar
 * and every page, so polling and tray listeners exist exactly once while
 * control stays consistent everywhere (doc 11 §2). It subscribes to tray menu events emitted by Rust
 * (doc 11 §5 nr. 1/10/11/12/13) so the menu-bar buttons drive the same state.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  timerGetState,
  nativeTimerCommandsUpdate,
  nativeTimerStatusUpdate,
  revealMainWindow,
  timerStart,
  timerPause,
  timerResume,
  timerStop,
  type TimerState,
  type TimerStopResult,
} from "../lib/bridge";
import type { Uuid, EpochMs, TimerStatus } from "@tarlog/core";
import { getProject } from "./projects";
import {
  loadTrackingShortcuts,
  registerTrackingShortcuts,
  TRACKING_SHORTCUT_EVENT,
  type TrackingShortcut,
} from "./trackingShortcuts";
import {
  clearTimerDescriptionDraft,
  saveTimerDescriptionDraft,
} from "./timerDescriptionDraft";
import { recalcEntry } from "./recalc";
import { notifyChange } from "./backup";
import { t } from "../i18n";

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

export interface NavigationRequest {
  route: string;
  action?: "stop";
}

let pendingTimerStop = false;

/** Runtime guard for navigation events emitted outside React. */
export function isNavigationRequest(value: unknown): value is NavigationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as { route?: unknown; action?: unknown };
  return typeof request.route === "string" &&
    (request.action === undefined || request.action === "stop");
}

/** Preserve a tray stop request until the Timer page is mounted and ready. */
export function queueNavigationRequest(request: NavigationRequest): void {
  if (request.route === "timer" && request.action === "stop") pendingTimerStop = true;
}

/** Queue first, then notify the shell and any already-mounted destination page. */
export function dispatchNavigationRequest(request: NavigationRequest): void {
  queueNavigationRequest(request);
  window.dispatchEvent(new CustomEvent<NavigationRequest>(NAV_EVENT, { detail: request }));
}

/** Consume exactly one pending stop-dialog request. */
export function consumePendingTimerStop(): boolean {
  const pending = pendingTimerStop;
  pendingTimerStop = false;
  return pending;
}

export const TIMER_STATUS_LABELS = {
  idle: "Bereit",
  running: "Läuft",
  paused: "Pausiert",
  stopped: "Gestoppt",
  needs_description: "Beschreibung fehlt",
  sync_pending: "Sync ausstehend",
  conflict: "Konflikt",
} satisfies Record<TimerStatus, string>;

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
  pending: boolean;
  pendingAction: TimerMutation | null;
  /** Is a timer currently running or paused. */
  active: boolean;
  start: (args?: { projectId?: Uuid | null; taskId?: Uuid | null; description?: string | null; startedAt?: EpochMs | null }) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  stop: (args?: { description?: string | null; at?: EpochMs | null }) => Promise<TimerStopResult | null>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export type TimerMutation = "start" | "pause" | "resume" | "stop";

/** Notify other local integrations after a timer mutation. */
function broadcast(): void {
  window.dispatchEvent(new CustomEvent("ptl:timer-changed"));
}

function useTimerController(pollMs = 4000): UseTimer {
  const [state, setState] = useState<TimerState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TimerMutation | null>(null);
  const pendingRef = useRef(false);
  const stateRef = useRef<TimerState | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Native menu/tray mutations are disabled during boot and every in-flight
  // mutation. Unknown/transitional statuses remain disabled in Rust.
  useEffect(() => {
    void nativeTimerCommandsUpdate({
      status: state?.status ?? null,
      pending: pendingAction !== null,
      ready: !loading,
    }).catch(() => {
      // Plain Vite previews and web-only tests have no native command surface.
    });
  }, [loading, pendingAction, state?.status]);

  // Never leave stale commands enabled when the provider unmounts (for
  // example while returning to onboarding or during app shutdown).
  useEffect(() => () => {
    void nativeTimerCommandsUpdate({ status: null, pending: true, ready: false }).catch(() => {
      // The Tauri runtime can already be gone during teardown.
    });
  }, []);

  // Resolve the project label only when the active project changes. The native
  // status update below can then tick once per second without querying SQLite.
  useEffect(() => {
    let cancelled = false;
    const projectId = state?.project_id;
    if (!projectId) {
      setActiveProjectName(null);
      return;
    }
    void getProject(projectId)
      .then((project) => { if (!cancelled) setActiveProjectName(project?.name ?? t("Projekt")); })
      .catch(() => { if (!cancelled) setActiveProjectName(t("Projekt")); });
    return () => { cancelled = true; };
  }, [state?.project_id]);

  // Keep the macOS menu-bar title and the native tray menu synchronized with
  // the durable timer. Plain browser previews simply do not expose this call.
  useEffect(() => {
    const syncStatus = () => void nativeTimerStatusUpdate({
      projectName: activeProjectName,
      status: state?.status ?? null,
      elapsedSeconds: elapsedSeconds(state, Date.now()),
    }).catch(() => {});
    syncStatus();
    const interval = state?.status === "running" ? window.setInterval(syncStatus, 1000) : null;
    return () => { if (interval != null) window.clearInterval(interval); };
  }, [activeProjectName, state]);

  useEffect(() => () => {
    void nativeTimerStatusUpdate({ projectName: null, status: null, elapsedSeconds: 0 }).catch(() => {});
  }, []);

  const clearError = useCallback(() => {
    setRefreshError(null);
    setMutationError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (pendingRef.current) return;
    try {
      const s = await timerGetState();
      setState(s);
      setRefreshError(null);
    } catch (err) {
      // Backend not ready / no timer yet, treat as idle, surface nothing loud.
      setState(null);
      setRefreshError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + light polling + local integration refresh.
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

  const runMutation = useCallback(async <T,>(
    action: TimerMutation,
    operation: () => Promise<T>,
    apply: (result: T) => void,
  ): Promise<T | null> => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setPendingAction(action);
    setMutationError(null);
    try {
      const result = await operation();
      apply(result);
      broadcast();
      return result;
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      pendingRef.current = false;
      setPendingAction(null);
    }
  }, []);

  const start = useCallback<UseTimer["start"]>(async (args = {}) => {
    const result = await runMutation("start", () => timerStart(args), setState);
    if (result) {
      await saveTimerDescriptionDraft(result.started_at, args.description).catch(() => {
        // The timer itself is already durable; a missing optional draft must
        // never make a successful start look like a failure.
      });
    }
    return result !== null;
  }, [runMutation]);

  const pause = useCallback<UseTimer["pause"]>(async () => {
    const result = await runMutation("pause", () => timerPause({}), setState);
    return result !== null;
  }, [runMutation]);

  const resume = useCallback<UseTimer["resume"]>(async () => {
    const result = await runMutation("resume", () => timerResume({}), setState);
    return result !== null;
  }, [runMutation]);

  const stop = useCallback<UseTimer["stop"]>(async (args = {}) => {
    const result = await runMutation("stop", () => timerStop(args), (value) => setState(value.timer));
    if (result) {
      // Freeze the effective rate (part-project > project > customer) and all
      // rounding fields immediately after the native timer creates the entry.
      await recalcEntry(result.entry.id);
      await notifyChange();
      await clearTimerDescriptionDraft().catch(() => {});
    }
    return result;
  }, [runMutation]);

  // Load per-device global shortcuts once and route presses through this same
  // controller. Stopping always opens the mandatory description dialog.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];
    let cancelled = false;
    const wire = async () => {
      try {
        const bindings = await loadTrackingShortcuts();
        await registerTrackingShortcuts(bindings);
        unlisteners.push(await listen<TrackingShortcut>(TRACKING_SHORTCUT_EVENT, (event) => {
          const binding = event.payload;
          const current = stateRef.current;
          const active = current?.status === "running" || current?.status === "paused";
          const sameProject = current?.project_id === binding.projectId;

          if (binding.action === "start" || (binding.action === "toggle" && !active)) {
            if (active) {
              setMutationError(sameProject
                ? t("Dieses Projekt wird bereits erfasst.")
                : t("Beende zuerst den aktuell laufenden Timer."));
              return;
            }
            void start({ projectId: binding.projectId });
            return;
          }

          if (!active) {
            setMutationError(t("Es läuft derzeit kein Timer."));
            return;
          }
          if (!sameProject) {
            setMutationError(t("Der Kurzbefehl gehört nicht zum aktuell laufenden Projekt."));
            return;
          }
          void revealMainWindow()
            .catch(() => {})
            .finally(() => dispatchNavigationRequest({ route: "timer", action: "stop" }));
        }));
      } catch (error) {
        // Browser previews have no global shortcut plugin. In Tauri, surface
        // actual registration conflicts to the existing timer error UI.
        if ("__TAURI_INTERNALS__" in window) {
          setMutationError(error instanceof Error ? error.message : String(error));
        }
      }
      if (cancelled) unlisteners.forEach((unlisten) => unlisten());
    };
    void wire();
    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [start]);

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
            dispatchNavigationRequest({ route: "timer", action: "stop" });
          }),
        );
        unlisteners.push(
          await listen(TRAY_EVENTS.backdate, () => {
            dispatchNavigationRequest({ route: "backdating" });
          }),
        );
      } catch {
        // Not running under Tauri (e.g. plain vite preview), tray is unavailable.
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

  return {
    state,
    loading,
    error: mutationError ?? refreshError,
    pending: pendingAction !== null,
    pendingAction,
    active,
    start,
    pause,
    resume,
    stop,
    refresh,
    clearError,
  };
}

const TimerContext = createContext<UseTimer | null>(null);

/**
 * Own the single desktop timer controller. This keeps polling, tray listeners,
 * and command serialization centralized even when several pages display the
 * same timer state.
 */
export function TimerProvider({
  children,
  pollMs = 4000,
}: {
  children: ReactNode;
  pollMs?: number;
}) {
  const timer = useTimerController(pollMs);
  return createElement(TimerContext.Provider, { value: timer }, children);
}

/** Read the timer controller shared by the desktop shell and all pages. */
export function useTimer(): UseTimer {
  const timer = useContext(TimerContext);
  if (!timer) throw new Error("useTimer must be used within TimerProvider");
  return timer;
}
