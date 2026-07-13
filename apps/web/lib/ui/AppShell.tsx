"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckSquare2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileDown,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Paperclip,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  TimerReset,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppearanceControl } from "./AppearanceControl";
import { TimerTicker } from "./TimerTicker";
import { BrandMark } from "./BrandMark";
import {
  TIMER_STATUS_PRESENTATION,
  mergeTimerSnapshot,
  type AppShellTimer,
} from "./appShellTimer";

export type { AppShellTimer } from "./appShellTimer";

interface AppShellAccount {
  displayName: string;
  companyName: string | null;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Zeit",
    items: [
      { href: "/dashboard", label: "Übersicht", icon: LayoutDashboard },
      { href: "/timer", label: "Timer", icon: TimerReset },
      { href: "/today", label: "Heute", icon: CalendarDays },
      { href: "/week", label: "Woche", icon: CalendarRange },
      { href: "/month", label: "Monat", icon: Clock3 },
      { href: "/nachtrag", label: "Nachtragen", icon: PlusCircle },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/customers", label: "Kunden", icon: Users },
      { href: "/projects", label: "Projekte", icon: FolderKanban },
      { href: "/tasks", label: "Aufgaben", icon: CheckSquare2 },
      { href: "/attachments", label: "Anhänge", icon: Paperclip },
    ],
  },
  {
    label: "Finanzen",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/invoices", label: "Rechnungen", icon: ReceiptText },
      { href: "/exports", label: "Exporte", icon: FileDown },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/onboarding?replay=1", label: "Einführung", icon: CircleHelp },
      { href: "/compliance", label: "Compliance", icon: ShieldCheck },
      { href: "/sync", label: "Synchronisierung", icon: RefreshCw },
      { href: "/settings", label: "Einstellungen", icon: Settings2 },
    ],
  },
];

const SPRING = { type: "spring" as const, bounce: 0, duration: 0.36 };

function isActive(pathname: string, href: string): boolean {
  const baseHref = href.split("?", 1)[0] ?? href;
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

function Brand({ compact = false }: { compact?: boolean }): React.ReactElement {
  return (
    <Link href="/dashboard" className={compact ? "brand brand-compact" : "brand"} aria-label="Tarlog Flow – Übersicht">
      <BrandMark />
      <span className="brand-copy">
        <strong>Tarlog</strong>
        <small>Flow</small>
      </span>
    </Link>
  );
}

function MiniTimer({ timer, compact = false }: { timer: AppShellTimer | null; compact?: boolean }): React.ReactElement {
  const status = timer?.status ?? "idle";
  const presentation = TIMER_STATUS_PRESENTATION[status];
  const workLabel = [timer?.projectName, timer?.taskName].filter(Boolean).join(" · ");
  const label = workLabel || presentation.fallback;
  const classes = [
    "mini-timer",
    presentation.active ? "is-active" : "",
    presentation.tone === "attention" ? "is-attention" : "",
    presentation.tone === "conflict" ? "is-conflict" : "",
    compact ? "is-compact" : "",
    `status-${status}`,
  ].filter(Boolean).join(" ");

  return (
    <Link
      href="/timer"
      className={classes}
      aria-label={`${label}; Status: ${presentation.label}; Timer öffnen`}
    >
      {compact ? (
        <>
          <TimerReset size={18} aria-hidden />
          <span className="mini-timer-compact-status" aria-hidden />
        </>
      ) : (
        <span className="mini-timer-copy">
          <span className="mini-timer-label">
            {label}
            <span className="mini-timer-status">· {presentation.label}</span>
          </span>
          <TimerTicker timer={timer} size={19} />
        </span>
      )}
      {compact ? null : <ChevronRight size={16} aria-hidden />}
    </Link>
  );
}

function Navigation({
  pathname,
  variant,
  onNavigate,
  firstLinkRef,
}: {
  pathname: string;
  variant: "desktop" | "drawer";
  onNavigate?: () => void;
  firstLinkRef?: RefObject<HTMLAnchorElement | null>;
}): React.ReactElement {
  let isFirst = true;

  return (
    <nav className="app-navigation" aria-label="Hauptnavigation">
      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          <ul>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const ref = isFirst ? firstLinkRef : undefined;
              isFirst = false;
              return (
                <li key={item.href}>
                  <Link
                    ref={ref}
                    href={item.href}
                    className={`nav-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {active ? (
                      <motion.span
                        className="nav-active-material"
                        layoutId={`active-nav-${variant}`}
                        transition={SPRING}
                      />
                    ) : null}
                    <Icon size={17} strokeWidth={active ? 2.25 : 1.8} aria-hidden />
                    <span>{item.label}</span>
                    {active ? <span className="nav-active-dot" aria-hidden /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Sidebar({
  pathname,
  account,
  timer,
}: {
  pathname: string;
  account: AppShellAccount;
  timer: AppShellTimer | null;
}): React.ReactElement {
  return (
    <aside className="app-sidebar material-heavy">
      <Brand />
      <MiniTimer timer={timer} />
      <Navigation pathname={pathname} variant="desktop" />
      <div className="sidebar-footer">
        <AppearanceControl />
        <Link href="/settings" className="account-card">
          <span className="account-avatar" aria-hidden>{initials(account.displayName)}</span>
          <span className="account-copy">
            <strong>{account.displayName}</strong>
            <small>{account.companyName ?? "Persönlicher Arbeitsbereich"}</small>
          </span>
          <ChevronRight size={15} aria-hidden />
        </Link>
      </div>
    </aside>
  );
}

function MobileDrawer({
  open,
  onClose,
  pathname,
  account,
  timer,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
  account: AppShellAccount;
  timer: AppShellTimer | null;
  triggerRef: RefObject<HTMLButtonElement | null>;
}): React.ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => firstLinkRef.current?.focus());

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="mobile-drawer-layer">
          <motion.button
            type="button"
            className="drawer-scrim"
            aria-label="Navigation schließen"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.aside
            ref={panelRef}
            className="mobile-drawer material-heavy"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: "-104%" }}
            animate={{ x: 0 }}
            exit={{ x: "-104%" }}
            transition={{ type: "spring", bounce: 0.12, duration: 0.34 }}
            drag="x"
            dragConstraints={{ left: -340, right: 0 }}
            dragElastic={{ left: 0.08, right: 0.04 }}
            dragMomentum={false}
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (info.offset.x < -72 || info.velocity.x < -460) onClose();
            }}
          >
            <div className="drawer-header">
              <Brand />
              <button type="button" className="icon-button" onClick={onClose} aria-label="Navigation schließen">
                <X size={19} />
              </button>
            </div>
            <MiniTimer timer={timer} />
            <Navigation pathname={pathname} variant="drawer" onNavigate={onClose} firstLinkRef={firstLinkRef} />
            <div className="drawer-footer">
              <AppearanceControl />
              <Link href="/settings" className="account-card" onClick={onClose}>
                <span className="account-avatar" aria-hidden>{initials(account.displayName)}</span>
                <span className="account-copy">
                  <strong>{account.displayName}</strong>
                  <small>{account.companyName ?? "Persönlicher Arbeitsbereich"}</small>
                </span>
              </Link>
            </div>
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function AppShell({
  account,
  initialTimer,
  children,
}: {
  account: AppShellAccount;
  initialTimer: AppShellTimer | null;
  children: ReactNode;
}): React.ReactElement {
  const pathname = usePathname() || "/dashboard";
  const reduceMotion = useReducedMotion();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const initialRouteRef = useRef(true);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const timer = useLiveTimer(initialTimer);

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (initialRouteRef.current) {
      initialRouteRef.current = false;
      return;
    }
    window.requestAnimationFrame(() => mainRef.current?.focus());
  }, [pathname]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <a className="skip-link" href="#app-content">Zum Inhalt springen</a>
      <div className="app-shell">
          <Sidebar pathname={pathname} account={account} timer={timer} />

          <header className="mobile-topbar material-heavy">
            <button
              ref={menuButtonRef}
              type="button"
              className="icon-button"
              aria-label="Navigation öffnen"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={20} />
            </button>
            <Brand compact />
            <div className="mobile-topbar-actions">
              <MiniTimer timer={timer} compact />
              <AppearanceControl variant="compact" />
            </div>
          </header>

          <MobileDrawer
            open={drawerOpen}
            onClose={closeDrawer}
            pathname={pathname}
            account={account}
            timer={timer}
            triggerRef={menuButtonRef}
          />

          <main ref={mainRef} className="app-main" id="app-content" tabIndex={-1}>
            {!online ? (
              <div className="offline-banner" role="status">
                Offline – der letzte geladene Stand bleibt sichtbar. Speichern
                ist nicht möglich; sichere deine Eingaben und versuche es nach
                Wiederherstellung der Verbindung erneut.
              </div>
            ) : null}
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={pathname}
                className="route-stage"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.996 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.998 }}
                transition={reduceMotion ? { duration: 0.14 } : SPRING}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
      </div>
    </MotionConfig>
  );
}

function useLiveTimer(initialTimer: AppShellTimer | null): AppShellTimer | null {
  const [timer, setTimer] = useState(initialTimer);

  useEffect(() => setTimer(initialTimer), [initialTimer]);

  useEffect(() => {
    let disposed = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/timer", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const body = (await response.json()) as { timer?: AppShellTimer | null };
        if (!disposed) {
          setTimer((current) => mergeTimerSnapshot(current, body.timer ?? null));
        }
      } catch {
        // Keep the last known state while temporarily offline.
      }
    };

    const interval = window.setInterval(() => void refresh(), 4000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return timer;
}
