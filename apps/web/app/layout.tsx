import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

/**
 * Root-Layout — App-Shell mit fester Sidebar-Navigation (doc 11 §2, alle 15
 * Hauptbereiche). Struktur ist plattformübergreifend gleich (Web/Desktop/iOS),
 * damit kein Umlernen nötig ist. Der laufende Timer bleibt als persistente
 * Kopfleisten-Komponente sichtbar — dafür ist hier ein Slot vorbereitet; die
 * Timer-Komponente füllt der Timer-Autor.
 *
 * Diese Datei legt NUR das Grundgerüst + Navigation an. Seiteninhalte macht der
 * UI-Autor. Design-Direktion: ruhige Ledger-Ästhetik, neutrale Basis, eine
 * Akzentfarbe, tabulare Ziffern (globals.css).
 */

export const metadata: Metadata = {
  title: "Project Time Ledger",
  description: "Local-first Zeiterfassung, Abrechnung und Compliance.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d0f" },
  ],
};

/** Die 15 Hauptbereiche (doc 11 §2). `href` = App-Router-Segment. */
const NAV_AREAS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/timer", label: "Timer" },
  { href: "/today", label: "Heute" },
  { href: "/week", label: "Woche" },
  { href: "/month", label: "Monat" },
  { href: "/customers", label: "Kunden" },
  { href: "/projects", label: "Projekte" },
  { href: "/tasks", label: "Aufgaben" },
  { href: "/reports", label: "Reports" },
  { href: "/invoices", label: "Rechnungen" },
  { href: "/exports", label: "Exporte" },
  { href: "/attachments", label: "Anhänge" },
  { href: "/compliance", label: "Compliance" },
  { href: "/settings", label: "Einstellungen" },
  { href: "/sync", label: "Sync-Status" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="de">
      <body>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "232px 1fr",
            minHeight: "100dvh",
          }}
        >
          <aside
            style={{
              borderRight: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              display: "flex",
              flexDirection: "column",
              position: "sticky",
              top: 0,
              height: "100dvh",
            }}
          >
            <div
              style={{
                padding: "16px 18px",
                borderBottom: "1px solid var(--color-border)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              Project Time Ledger
            </div>

            {/* Slot: persistente Timer-Kopfleiste (Timer-Autor füllt) */}
            <div
              id="ptl-timer-slot"
              style={{
                padding: "10px 18px",
                borderBottom: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                fontSize: 13,
              }}
            >
              {/* <TimerBar /> */}
            </div>

            <nav style={{ padding: "8px", overflowY: "auto", flex: 1 }}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                {NAV_AREAS.map((area) => (
                  <li key={area.href}>
                    <Link
                      href={area.href}
                      style={{
                        display: "block",
                        padding: "7px 10px",
                        borderRadius: "var(--radius)",
                        color: "var(--color-text)",
                        textDecoration: "none",
                        fontSize: 14,
                      }}
                    >
                      {area.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <main
            style={{
              padding: "24px 28px",
              maxWidth: 1200,
              width: "100%",
            }}
          >
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
