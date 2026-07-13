import { useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  ChevronRight,
  CloudCog,
  History,
  LayoutDashboard,
  ListChecks,
  Moon,
  Pause,
  Play,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sun,
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
import { detectDesktopPlatform, type DesktopPlatform } from "./lib/platform";
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
type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "tarlog-theme";
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

function resolveInitialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // A disabled Web Storage API must not block the local desktop app.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function useTheme(platform: DesktopPlatform) {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = resolveInitialTheme();
    document.documentElement.dataset.theme = initial;
    return initial;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme remains active for this session when persistence is unavailable.
    }

    if (platform === "macos" && isTauri()) {
      void getCurrentWindow().setTheme(theme).catch(() => {
        // The web theme remains usable when native window theming is unavailable.
      });
    }
  }, [platform, theme]);

  return { theme, toggle: () => setTheme((current) => (current === "dark" ? "light" : "dark")) };
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

function Sidebar({ activeId, platform }: { activeId: string; platform: DesktopPlatform }) {
  const routeMap = useMemo(() => new Map(ROUTES.map((route) => [route.id, route])), []);

  return (
    <aside className="sidebar" aria-label="Tarlog Navigation">
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
                    <Icon className="nav-item__icon" size={17} strokeWidth={1.9} aria-hidden />
                    <span className="nav-item__label">{route.label}</span>
                    {shortcutLabel ? <span className="nav-item__shortcut" aria-hidden>{shortcutLabel}</span> : null}
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </nav>

      <div className="sidebar__foot">
        <span className="sidebar__privacy-icon" aria-hidden>
          <ShieldCheck size={15} />
        </span>
        <span className="sidebar__footcopy">
          <strong>Local first</strong>
          <small>Deine Zeit bleibt bei dir.</small>
        </span>
      </div>
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
          <Pause size={15} fill="currentColor" />
        ) : meta.control === "resume" || status === "idle" || status === "stopped" ? (
          <Play size={15} fill="currentColor" />
        ) : (
          <ChevronRight size={15} />
        )}
      </button>
    </div>
  );
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const reduceMotion = useReducedMotion();
  const target = theme === "dark" ? "Light Mode" : "Dark Mode";
  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`Zu ${target} wechseln`} title={target}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          className="theme-toggle__icon"
          key={theme}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72, rotate: -24 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.72, rotate: 24 }}
          transition={reduceMotion ? { duration: 0.12 } : SPRING}
          aria-hidden
        >
          {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}

function Topbar({ route, theme, onThemeToggle }: { route: RouteDef; theme: Theme; onThemeToggle: () => void }) {
  const group = NAV_GROUPS.find((candidate) => candidate.ids.some((id) => id === route.id));
  return (
    <header className="topbar">
      <div className="topbar__current" data-tauri-drag-region>
        <span className="topbar__eyebrow" data-tauri-drag-region>{group?.label ?? "Tarlog"}</span>
        <strong className="topbar__title" id="current-route-title" data-tauri-drag-region>{route.label}</strong>
      </div>
      <div className="topbar__actions">
        <PersistentTimer />
        <ThemeToggle theme={theme} onToggle={onThemeToggle} />
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
  const { theme, toggle } = useTheme(platform);
  const reduceMotion = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const previousRoute = useRef(route.id);

  useEffect(() => {
    if (previousRoute.current === route.id) return;
    previousRoute.current = route.id;
    const frame = window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [route.id]);

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
          <p className="boot__copy">Die lokale Datenbank ist nicht verfügbar.</p>
          <code className="boot__detail">{boot.message}</code>
        </div>
      </BootScreen>
    );
  }

  const PageComponent = route.Component;
  return (
    <TimerProvider>
      <a className="skip-link" href="#main-content">Zum Inhalt springen</a>
      <div className={`app-shell app-shell--${platform}`}>
        <Sidebar activeId={route.id} platform={platform} />
        <div className="main">
          <Topbar route={route} theme={theme} onThemeToggle={toggle} />
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
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.995 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.998 }}
                transition={reduceMotion ? { duration: 0.14 } : SPRING}
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
