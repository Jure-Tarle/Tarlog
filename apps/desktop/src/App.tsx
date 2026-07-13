import { useEffect, useMemo, useRef, useState, type Ref } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronRight,
  CircleHelp,
  CloudCog,
  History,
  LayoutDashboard,
  ListChecks,
  MonitorCog,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  ReceiptText,
  Settings,
  ShieldCheck,
  Timer,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ROUTES, resolveRoute, type RouteDef } from "./pages/routes";
import { dbInit, dbMigrate } from "./lib/bridge";
import type { NativeSystemSymbolKey } from "./lib/bridge";
import { detectDesktopPlatform, type DesktopPlatform } from "./lib/platform";
import { AppleSystemSymbol } from "./components/AppleSystemSymbol";
import { Button } from "./components/ui";
import { DesktopOnboarding } from "./onboarding/DesktopOnboarding";
import { useDesktopOnboarding } from "./onboarding/useDesktopOnboarding";
import brandMarkUrl from "../../../assets/brand/tarlog-flow-mark.svg?url";
import {
  elapsedSeconds,
  isNavigationRequest,
  NAV_EVENT,
  TimerProvider,
  useTimer,
} from "./data/timer";
import { useTick } from "./data/hooks";
import { fmtHMS } from "./data/format";
import type { TimerStatus } from "@tarlog/core";

type BootState = { phase: "loading" | "ready" } | { phase: "error"; message: string };
type AppearancePreference = "system" | "light" | "dark";
type ResolvedTheme = Exclude<AppearancePreference, "system">;

const THEME_STORAGE_KEY = "tarlog-theme";
const SIDEBAR_HIDDEN_STORAGE_KEY = "tarlog-sidebar-hidden";
const SIDEBAR_WIDTH_STORAGE_KEY = "tarlog-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 256;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 360;
const SPRING = { type: "spring", bounce: 0, duration: 0.38 } as const;

const TIMER_STATUS_META = {
  idle: { label: "Bereit", control: "open", attention: false },
  running: { label: "Läuft", control: "pause", attention: false },
  paused: { label: "Pausiert", control: "resume", attention: false },
  stopped: { label: "Gestoppt", control: "open", attention: false },
  needs_description: { label: "Beschreibung fehlt", control: "open", attention: true },
  sync_pending: { label: "Sync ausstehend", control: "open", attention: true },
  conflict: { label: "Konflikt", control: "open", attention: true },
} satisfies Record<TimerStatus, {
  label: string;
  control: "open" | "pause" | "resume";
  attention: boolean;
}>;

const ROUTE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  timer: Timer,
  today: CalendarDays,
  week: CalendarRange,
  customers: Users,
  projects: BriefcaseBusiness,
  tasks: ListChecks,
  reports: ChartNoAxesCombined,
  invoices: ReceiptText,
  backdating: History,
  compliance: ShieldCheck,
  settings: Settings,
  sync: CloudCog,
};

const NAV_GROUPS = [
  { label: "Arbeitsbereich", ids: ["dashboard", "timer", "today", "week"] },
  { label: "Organisation", ids: ["customers", "projects", "tasks"] },
  { label: "Auswertung", ids: ["reports", "invoices", "backdating", "compliance"] },
  { label: "System", ids: ["settings", "sync"] },
] as const;

const NAV_SHORTCUTS: Partial<Record<string, { key: string; mac: string; other: string }>> = {
  dashboard: { key: "1", mac: "⌘1", other: "Ctrl 1" },
  timer: { key: "2", mac: "⌘2", other: "Ctrl 2" },
  today: { key: "3", mac: "⌘3", other: "Ctrl 3" },
  week: { key: "4", mac: "⌘4", other: "Ctrl 4" },
  reports: { key: "5", mac: "⌘5", other: "Ctrl 5" },
  settings: { key: ",", mac: "⌘,", other: "Ctrl ," },
};

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveInitialAppearance(): AppearancePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "system" || stored === "light" || stored === "dark") return stored;
  } catch {
    // A disabled Web Storage API must not block the local desktop app.
  }
  return "system";
}

function useAppearance(platform: DesktopPlatform) {
  const [preference, setPreference] = useState<AppearancePreference>(() => {
    const initial = resolveInitialAppearance();
    document.documentElement.dataset.appearance = initial;
    document.documentElement.dataset.theme = initial === "system" ? systemTheme() : initial;
    return initial;
  });
  const [system, setSystem] = useState<ResolvedTheme>(() => systemTheme());

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const sync = (event: MediaQueryListEvent | MediaQueryList) => setSystem(event.matches ? "dark" : "light");
    sync(query);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const resolved: ResolvedTheme = preference === "system" ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.appearance = preference;
    document.documentElement.dataset.theme = resolved;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Theme remains active for this session when persistence is unavailable.
    }

    if (platform === "macos" && isTauri()) {
      void getCurrentWindow().setTheme(preference === "system" ? null : preference).catch(() => {
        // The web theme remains usable when native window theming is unavailable.
      });
    }
  }, [platform, preference, resolved]);

  return { preference, resolved, setPreference };
}

function useWindowActivity(platform: DesktopPlatform) {
  useEffect(() => {
    const setActive = (active: boolean) => {
      document.documentElement.dataset.windowActive = String(active);
    };
    setActive(document.hasFocus());

    const onFocus = () => setActive(true);
    const onBlur = () => setActive(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    if (platform === "macos" && isTauri()) {
      void getCurrentWindow().onFocusChanged(({ payload }) => setActive(payload))
        .then((stopListening) => {
          if (disposed) stopListening();
          else unlisten = stopListening;
        })
        .catch(() => {
          // Browser focus events remain a reliable fallback.
        });
    }

    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, [platform]);
}

function useDbBoot(): BootState {
  const [state, setState] = useState<BootState>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await dbInit();
        await dbMigrate();
        if (alive) setState({ phase: "ready" });
      } catch (error) {
        console.error("Tarlog database boot failed", error);
        if (alive) {
          setState({
            phase: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

function useHashRoute(): RouteDef {
  const [route, setRoute] = useState<RouteDef>(() => resolveRoute(window.location.hash));
  useEffect(() => {
    const onHashChange = () => setRoute(resolveRoute(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
}

function navigateTo(id: string) {
  window.location.hash = `#/${id}`;
}

function useNavigationRequests() {
  useEffect(() => {
    const onNavigate = (event: Event) => {
      const request = (event as CustomEvent<unknown>).detail;
      if (!isNavigationRequest(request)) return;
      if (!ROUTES.some((route) => route.id === request.route)) return;
      navigateTo(request.route);
    };
    window.addEventListener(NAV_EVENT, onNavigate);
    return () => window.removeEventListener(NAV_EVENT, onNavigate);
  }, []);
}

function useNativeMenuNavigation(platform: DesktopPlatform) {
  useEffect(() => {
    if (platform !== "macos" || !isTauri()) return;

    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen("menu://navigate/settings", () => navigateTo("settings"))
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => {
        // Keyboard navigation remains available if the native menu is absent.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [platform]);

}

function useAppShortcuts(platform: DesktopPlatform) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = platform === "macos" ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey || event.shiftKey) return;

      const routeId = Object.keys(NAV_SHORTCUTS).find((id) => NAV_SHORTCUTS[id]?.key === event.key);
      if (!routeId) return;

      event.preventDefault();
      navigateTo(routeId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);
}

function storedBoolean(key: string, fallback: boolean) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

function storedSidebarWidth() {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed));
    }
  } catch {
    // Fall through to the AppKit-like default width.
  }
  return DEFAULT_SIDEBAR_WIDTH;
}

function useSidebar(platform: DesktopPlatform) {
  const [hidden, setHidden] = useState(() => storedBoolean(SIDEBAR_HIDDEN_STORAGE_KEY, false));
  const [width, setWidth] = useState(storedSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const toggle = () => setHidden((current) => !current);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_HIDDEN_STORAGE_KEY, String(hidden));
    } catch {
      // The sidebar still works for this session without persistence.
    }
  }, [hidden]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width));
    } catch {
      // The sidebar still resizes for this session without persistence.
    }
  }, [width]);

  useEffect(() => {
    if (platform !== "macos" || !isTauri()) return;
    let disposed = false;
    let unlisten: UnlistenFn | undefined;
    void listen("menu://toggle-sidebar", toggle)
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch(() => {
        // The toolbar control remains available when native menu events fail.
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [platform]);

  useEffect(() => {
    if (platform === "macos") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      setHidden((current) => !current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [platform]);

  return {
    hidden,
    width,
    resizing,
    toggle,
    startResize: () => setResizing(true),
    stopResize: () => setResizing(false),
    resetWidth: () => setWidth(DEFAULT_SIDEBAR_WIDTH),
    resizeTo: (next: number) => setWidth(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, next))),
  };
}

function Sidebar({
  activeId,
  platform,
  hidden,
  width,
  onResize,
  onResizeStart,
  onResizeEnd,
  onResetWidth,
  onIntroduction,
  introductionButtonRef,
}: {
  activeId: string;
  platform: DesktopPlatform;
  hidden: boolean;
  width: number;
  onResize: (width: number) => void;
  onResizeStart: () => void;
  onResizeEnd: () => void;
  onResetWidth: () => void;
  onIntroduction: () => void;
  introductionButtonRef: Ref<HTMLButtonElement>;
}) {
  const routeMap = useMemo(() => new Map(ROUTES.map((route) => [route.id, route])), []);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);

  const stopResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resizeStart.current = null;
    onResizeEnd();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <aside className="sidebar" aria-label="Tarlog Navigation" aria-hidden={hidden || undefined} inert={hidden}>
      <div className="sidebar__window-chrome" data-tauri-drag-region aria-hidden="true" />
      <a className="sidebar__brand" href="#/dashboard" aria-label="Tarlog Flow – Dashboard">
        <motion.span className="sidebar__mark" whileTap={{ scale: 0.92 }} transition={SPRING} aria-hidden>
          <img className="brand-mark__image" src={brandMarkUrl} alt="" />
        </motion.span>
        <span className="sidebar__brandcopy">
          <strong>Tarlog</strong>
          <small>Flow</small>
        </span>
      </a>

      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {NAV_GROUPS.map((group) => (
          <section className="nav-group" key={group.label} aria-label={group.label}>
            <p className="nav-group__label">{group.label}</p>
            <div className="nav-group__items">
              {group.ids.map((id) => {
                const route = routeMap.get(id);
                if (!route) return null;
                const Icon = ROUTE_ICONS[id] ?? ChevronRight;
                const active = route.id === activeId;
                const shortcut = NAV_SHORTCUTS[route.id];
                const shortcutLabel = shortcut
                  ? platform === "macos" ? shortcut.mac : shortcut.other
                  : undefined;
                return (
                  <a
                    key={route.id}
                    className="nav-item"
                    href={`#/${route.id}`}
                    aria-current={active ? "page" : undefined}
                    title={shortcutLabel ? `${route.label} (${shortcutLabel})` : route.label}
                    aria-keyshortcuts={shortcut ? `${platform === "macos" ? "Meta" : "Control"}+${shortcut.key}` : undefined}
                  >
                    {active ? (
                      <motion.span
                        className="nav-item__active"
                        layoutId="desktop-active-route"
                        transition={SPRING}
                        aria-hidden
                      />
                    ) : null}
                    <AppleSystemSymbol
                      name={route.id as NativeSystemSymbolKey}
                      className="nav-item__icon apple-system-symbol"
                      size={16}
                      fallback={<Icon className="nav-item__icon" size={17} strokeWidth={1.9} aria-hidden />}
                    />
                    <span className="nav-item__label">{route.label}</span>
                    {shortcutLabel ? <span className="nav-item__shortcut" aria-hidden>{shortcutLabel}</span> : null}
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <button
        ref={introductionButtonRef}
        className="sidebar__introduction"
        type="button"
        onClick={onIntroduction}
        title="Einführung erneut öffnen"
      >
        <AppleSystemSymbol
          name="onboarding"
          className="apple-system-symbol"
          size={16}
          fallback={<CircleHelp size={16} strokeWidth={1.9} aria-hidden />}
        />
        <span>Einführung</span>
      </button>

      <div className="sidebar__foot">
        <span className="sidebar__privacy-icon" aria-hidden>
          <ShieldCheck size={15} />
        </span>
        <span className="sidebar__footcopy">
          <strong>Local first</strong>
          <small>Deine Zeit bleibt bei dir.</small>
        </span>
      </div>
      {platform === "macos" ? (
        <div
          className="sidebar__resize-handle"
          role="separator"
          aria-label="Breite der Seitenleiste ändern"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(width)}
          tabIndex={hidden ? -1 : 0}
          onDoubleClick={onResetWidth}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            resizeStart.current = { x: event.clientX, width };
            onResizeStart();
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!resizeStart.current) return;
            onResize(resizeStart.current.width + event.clientX - resizeStart.current.x);
          }}
          onPointerUp={stopResize}
          onPointerCancel={stopResize}
          onLostPointerCapture={() => {
            resizeStart.current = null;
            onResizeEnd();
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            onResize(width + (event.key === "ArrowRight" ? 8 : -8));
          }}
        />
      ) : null}
    </aside>
  );
}

function PersistentTimer() {
  const timer = useTimer();
  const ticking = timer.state?.status === "running";
  const now = useTick(ticking);
  const elapsed = elapsedSeconds(timer.state, now);
  const status: TimerStatus = timer.state?.status ?? "idle";
  const meta = TIMER_STATUS_META[status];
  const statusLabel = timer.error
    ? "Aktion fehlgeschlagen"
    : timer.pending
      ? "Wird aktualisiert"
      : meta.label;

  const runControl = () => {
    if (meta.control === "pause") {
      void timer.pause();
    } else if (meta.control === "resume") {
      void timer.resume();
    } else {
      navigateTo("timer");
    }
  };

  return (
    <div
      className={`top-timer top-timer--${status} ${meta.attention ? "top-timer--attention" : ""} ${timer.error ? "top-timer--error" : ""}`}
      aria-label={`Timer ${statusLabel}`}
      aria-busy={timer.pending}
      title={timer.error ?? undefined}
    >
      <button className="top-timer__summary" type="button" onClick={() => navigateTo("timer")}>
        <span className="top-timer__state" aria-hidden />
        <span className="top-timer__copy">
          <span className="top-timer__label">{statusLabel}</span>
          <span className="top-timer__time num">{fmtHMS(elapsed)}</span>
        </span>
      </button>
      <button
        className="icon-btn top-timer__action"
        type="button"
        onClick={runControl}
        disabled={timer.pending}
        aria-label={meta.control === "pause" ? "Timer pausieren" : meta.control === "resume" ? "Timer fortsetzen" : "Timer öffnen"}
        title={meta.control === "pause" ? "Pausieren" : meta.control === "resume" ? "Fortsetzen" : "Timer öffnen"}
      >
        {meta.control === "pause" ? (
          <AppleSystemSymbol
            name="timerPause"
            size={15}
            className="apple-system-symbol"
            fallback={<Pause size={15} fill="currentColor" />}
          />
        ) : meta.control === "resume" || status === "idle" || status === "stopped" ? (
          <AppleSystemSymbol
            name="timerPlay"
            size={15}
            className="apple-system-symbol"
            fallback={<Play size={15} fill="currentColor" />}
          />
        ) : (
          <ChevronRight size={15} />
        )}
      </button>
    </div>
  );
}

function AppearancePicker({
  value,
  onChange,
}: {
  value: AppearancePreference;
  onChange: (value: AppearancePreference) => void;
}) {
  return (
    <label className="appearance-picker" title="Darstellung">
      <AppleSystemSymbol
        name="themeSystem"
        className="appearance-picker__icon apple-system-symbol"
        size={15}
        fallback={<MonitorCog className="appearance-picker__icon" size={15} aria-hidden />}
      />
      <span className="sr-only">Darstellung</span>
      <select
        className="appearance-picker__select"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as AppearancePreference)}
        aria-label="Darstellung"
      >
        <option value="system">System</option>
        <option value="light">Hell</option>
        <option value="dark">Dunkel</option>
      </select>
    </label>
  );
}

function Topbar({
  route,
  platform,
  sidebarHidden,
  onSidebarToggle,
  appearance,
  onAppearanceChange,
}: {
  route: RouteDef;
  platform: DesktopPlatform;
  sidebarHidden: boolean;
  onSidebarToggle: () => void;
  appearance: AppearancePreference;
  onAppearanceChange: (value: AppearancePreference) => void;
}) {
  const group = NAV_GROUPS.find((candidate) => candidate.ids.some((id) => id === route.id));
  return (
    <header
      className="topbar"
      style={platform === "macos" ? { paddingLeft: sidebarHidden ? "5.25rem" : "0.75rem" } : undefined}
    >
      <div className="topbar__leading">
        <button
          className="toolbar-icon-button sidebar-toggle icon-btn"
          type="button"
          onClick={onSidebarToggle}
          aria-label={sidebarHidden ? "Seitenleiste einblenden" : "Seitenleiste ausblenden"}
          title={`${sidebarHidden ? "Seitenleiste einblenden" : "Seitenleiste ausblenden"} (${platform === "macos" ? "⌥⌘S" : "Ctrl+Alt+S"})`}
        >
          <AppleSystemSymbol
            name="sidebarToggle"
            className="apple-system-symbol"
            size={16}
            fallback={sidebarHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          />
        </button>
        <div className="topbar__current" data-tauri-drag-region>
          <span className="topbar__eyebrow" data-tauri-drag-region>{group?.label ?? "Tarlog"}</span>
          <strong className="topbar__title" id="current-route-title" data-tauri-drag-region>{route.label}</strong>
        </div>
      </div>
      <div className="topbar__actions">
        <PersistentTimer />
        <AppearancePicker value={appearance} onChange={onAppearanceChange} />
      </div>
    </header>
  );
}

function BootScreen({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return (
    <div className="app-shell app-shell--boot">
      <motion.div
        className={`boot ${error ? "boot--error" : ""}`}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
      >
        <span className="boot__mark" aria-hidden>
          <img className="brand-mark__image" src={brandMarkUrl} alt="" />
        </span>
        {children}
      </motion.div>
    </div>
  );
}

function AppContent() {
  const [platform] = useState<DesktopPlatform>(() => {
    const detected = detectDesktopPlatform();
    document.documentElement.dataset.platform = detected;
    return detected;
  });
  const boot = useDbBoot();
  const route = useHashRoute();
  useNavigationRequests();
  useNativeMenuNavigation(platform);
  useAppShortcuts(platform);
  useWindowActivity(platform);
  const { preference, setPreference } = useAppearance(platform);
  const sidebar = useSidebar(platform);
  const onboarding = useDesktopOnboarding(boot.phase === "ready");
  const reduceMotion = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(route.id);
  const introductionButtonRef = useRef<HTMLButtonElement>(null);
  const restoreIntroductionFocus = useRef(false);
  const previousOnboardingOpen = useRef(onboarding.open);

  useEffect(() => {
    if (previousRoute.current === route.id) return;
    previousRoute.current = route.id;
    const frame = window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [route.id]);

  useEffect(() => {
    const wasOpen = previousOnboardingOpen.current;
    previousOnboardingOpen.current = onboarding.open;
    if (!wasOpen || onboarding.open || !restoreIntroductionFocus.current) return;

    restoreIntroductionFocus.current = false;
    const frame = window.requestAnimationFrame(() => {
      introductionButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [onboarding.open]);

  if (boot.phase === "loading") {
    return (
      <BootScreen>
        <span className="boot__spinner" aria-hidden />
        <div>
          <p className="boot__title">Tarlog wird vorbereitet</p>
          <p className="boot__copy">Lokale Datenbank und Arbeitsbereich werden geladen …</p>
        </div>
      </BootScreen>
    );
  }

  if (boot.phase === "error") {
    return (
      <BootScreen error>
        <div>
          <p className="boot__title boot__error">Tarlog konnte nicht gestartet werden</p>
          <p className="boot__copy">
            Die lokale Datenbank ist momentan nicht verfügbar. Beende Tarlog vollständig
            und versuche es erneut; deine vorhandenen Daten wurden nicht verändert.
          </p>
          <div className="boot__actions">
            <Button variant="primary" onClick={() => window.location.reload()}>Erneut versuchen</Button>
          </div>
        </div>
      </BootScreen>
    );
  }

  if (onboarding.phase === "idle" || onboarding.phase === "loading") {
    return (
      <BootScreen>
        <span className="boot__spinner" aria-hidden />
        <div>
          <p className="boot__title">Arbeitsbereich wird geprüft</p>
          <p className="boot__copy">Tarlog lädt deine lokale Einrichtung …</p>
        </div>
      </BootScreen>
    );
  }

  if (onboarding.phase === "error") {
    return (
      <BootScreen error>
        <div>
          <p className="boot__title boot__error">Einrichtung konnte nicht geladen werden</p>
          <p className="boot__copy">Dein lokaler Arbeitsbereich wurde nicht verändert.</p>
          <div className="boot__actions">
            <Button variant="primary" onClick={onboarding.retry}>Erneut versuchen</Button>
          </div>
        </div>
      </BootScreen>
    );
  }

  if (onboarding.open) {
    return (
      <DesktopOnboarding
        progress={onboarding.progress}
        required={onboarding.required}
        toolbar={<AppearancePicker value={preference} onChange={setPreference} />}
        onCheckpoint={onboarding.checkpoint}
        onDismiss={onboarding.dismissReplay}
        onFinish={async (progress, destination) => {
          await onboarding.complete(progress);
          restoreIntroductionFocus.current = false;
          navigateTo(destination);
        }}
      />
    );
  }

  const PageComponent = route.Component;
  return (
    <TimerProvider>
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <div
        className={`app-shell app-shell--${platform} ${sidebar.hidden ? "is-sidebar-hidden" : ""} ${sidebar.resizing ? "is-sidebar-resizing" : ""}`}
        style={{ "--sidebar-user-w": `${sidebar.width}px` } as React.CSSProperties}
      >
        <Sidebar
          activeId={route.id}
          platform={platform}
          hidden={sidebar.hidden}
          width={sidebar.width}
          onResize={sidebar.resizeTo}
          onResizeStart={sidebar.startResize}
          onResizeEnd={sidebar.stopResize}
          onResetWidth={sidebar.resetWidth}
          onIntroduction={() => {
            restoreIntroductionFocus.current = true;
            onboarding.openReplay();
          }}
          introductionButtonRef={introductionButtonRef}
        />
        <div className="main">
          <Topbar
            route={route}
            platform={platform}
            sidebarHidden={sidebar.hidden}
            onSidebarToggle={sidebar.toggle}
            appearance={preference}
            onAppearanceChange={setPreference}
          />
          <main
            className="content"
            id="main-content"
            ref={mainRef}
            tabIndex={-1}
            aria-labelledby="current-route-title"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                className="route-stage"
                key={route.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.08 : 0.16, ease: "easeOut" }}
              >
                <PageComponent />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </TimerProvider>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <AppContent />
    </MotionConfig>
  );
}

export default App;
