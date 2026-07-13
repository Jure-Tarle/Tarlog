/**
 * App.tsx — the desktop shell (doc 11 §2, §5).
 *
 * Layout: persistent left sidebar (13 areas) + a persistent timer bar that
 * stays visible in every area (the running timer must always be reachable,
 * doc 11 §2/§5). A minimal hash router swaps the active page. Pages are stubs
 * filled by the UI author (src/pages/*); this shell and src/pages/routes.tsx
 * are part of the skeleton and stay stable.
 *
 * The timer bar here is a VISUAL stub — it does not yet poll `timer_get_state`.
 * Wiring it to src/lib/bridge.ts is the Timer/Frontend author's job.
 */
import { useEffect, useState } from "react";
import { ROUTES, resolveRoute, type RouteDef } from "./pages/routes";
import { dbInit, dbMigrate } from "./lib/bridge";

/**
 * Boot-Gate: die lokale SQLite-Datenbank öffnen und migrieren, BEVOR
 * irgendeine Seite Daten anfragt. Ohne diesen Schritt bleibt die DB schemalos
 * (0 Tabellen) und alle Seiten zeigen nur leere Zustände. Läuft genau einmal
 * beim Start; Ergebnis steuert den Render (laden / Fehler / bereit).
 */
type BootState = { phase: "loading" | "ready" } | { phase: "error"; message: string };

function useDbBoot(): BootState {
  const [state, setState] = useState<BootState>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await dbInit();
        await dbMigrate();
        if (alive) setState({ phase: "ready" });
      } catch (err) {
        if (alive) {
          setState({ phase: "error", message: err instanceof Error ? err.message : String(err) });
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
  const [route, setRoute] = useState<RouteDef>(() =>
    resolveRoute(window.location.hash),
  );
  useEffect(() => {
    const onHash = () => setRoute(resolveRoute(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

function Sidebar({ activeId }: { activeId: string }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__mark" aria-hidden />
        Project Time Ledger
      </div>
      <nav className="sidebar__nav" aria-label="Hauptnavigation">
        {ROUTES.map((r, i) => (
          <a
            key={r.id}
            className="nav-item"
            href={`#/${r.id}`}
            aria-current={r.id === activeId ? "page" : undefined}
          >
            <span className="nav-item__key" aria-hidden>
              {i + 1}
            </span>
            {r.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

/**
 * Persistent timer bar. Stub: shows an idle timer with tabular figures. The
 * Timer author replaces the static state with a `timer_get_state` subscription.
 */
function TimerBar() {
  return (
    <header className="timerbar" aria-label="Laufender Timer">
      <span className="timerbar__status">
        <span className="timerbar__dot" aria-hidden />
        Kein Timer
      </span>
      <span className="timerbar__elapsed num">00:00:00</span>
      <span className="timerbar__spacer" />
      <button className="btn btn--primary" type="button">
        Timer starten
      </button>
    </header>
  );
}

function BootScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell app-shell--boot">
      <div className="boot">{children}</div>
    </div>
  );
}

export function App() {
  const boot = useDbBoot();
  const route = useHashRoute();

  if (boot.phase === "loading") {
    return (
      <BootScreen>
        <span className="boot__spinner" aria-hidden />
        <p>Lokale Datenbank wird vorbereitet …</p>
      </BootScreen>
    );
  }
  if (boot.phase === "error") {
    return (
      <BootScreen>
        <p className="boot__error">Die lokale Datenbank konnte nicht initialisiert werden.</p>
        <code className="boot__detail">{boot.message}</code>
      </BootScreen>
    );
  }

  const Page = route.Component;
  return (
    <div className="app-shell">
      <Sidebar activeId={route.id} />
      <div className="main">
        <TimerBar />
        <main className="content" aria-live="polite">
          <Page />
        </main>
      </div>
    </div>
  );
}

export default App;
