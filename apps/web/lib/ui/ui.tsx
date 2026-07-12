/**
 * lib/ui/ui.tsx — präsentationale Ledger-Primitive (doc 11 §1).
 *
 * Bewusst OHNE `"use client"`: reine Darstellung, keine Hooks — dadurch in
 * Server- UND Client-Bäumen nutzbar. Design-Direktion: ruhige, dichte
 * Ledger-Ästhetik, GENAU EINE Akzentfarbe, tabulare Ziffern, KEINE
 * Default-Shadows, Hierarchie über Kontrast + Abstand, Radien sparsam. Farben
 * kommen aus den CSS-Variablen in globals.css (dark/light automatisch).
 */
import type { CSSProperties, ReactNode } from "react";
import { cx, formatMoney, secondsToHMS } from "./format.js";

// ---------------------------------------------------------------------------
// Seitengerüst
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}): React.ReactElement {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        paddingBottom: 14,
        marginBottom: 20,
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>
          {title}
        </h1>
        {subtitle ? (
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--color-text-muted)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>{actions}</div> : null}
    </header>
  );
}

export function Card({
  children,
  style,
  className,
  padded = true,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padded?: boolean;
}): React.ReactElement {
  return (
    <div
      className={className}
      style={{
        background: "var(--color-surface-raised)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        padding: padded ? 16 : 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Responsives Kachel-Raster (Dashboard, Detailblöcke). */
export function Grid({
  min = 200,
  gap = 12,
  children,
  style,
}: {
  min?: number;
  gap?: number;
  children: ReactNode;
  style?: CSSProperties;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kennzahl-Kachel (Dashboard)
// ---------------------------------------------------------------------------

export function StatTile({
  label,
  value,
  hint,
  accent = false,
  href,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
  href?: string;
}): React.ReactElement {
  const inner = (
    <>
      <div
        style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 24,
          fontWeight: 600,
          marginTop: 6,
          color: accent ? "var(--color-accent)" : "var(--color-text)",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ fontSize: 12, color: "var(--color-text-faint)", marginTop: 4 }}>{hint}</div>
      ) : null}
    </>
  );
  const style: CSSProperties = {
    display: "block",
    background: "var(--color-surface-raised)",
    border: "1px solid var(--color-border)",
    borderLeft: accent ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
    borderRadius: "var(--radius)",
    padding: 14,
    textDecoration: "none",
    color: "inherit",
  };
  return href ? (
    <a href={href} style={style}>
      {inner}
    </a>
  ) : (
    <div style={style}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Werte-Renderer (tabular)
// ---------------------------------------------------------------------------

export function Duration({ seconds }: { seconds: number }): React.ReactElement {
  return <span className="tabular">{secondsToHMS(seconds)}</span>;
}

export function Money({
  cents,
  currency = "EUR",
}: {
  cents: number | null | undefined;
  currency?: string;
}): React.ReactElement {
  return <span className="tabular">{formatMoney(cents, currency)}</span>;
}

// ---------------------------------------------------------------------------
// Compliance-Ampel — Farbe NIE alleiniger Bedeutungsträger (Symbol + Text)
// ---------------------------------------------------------------------------

export type Traffic = "green" | "yellow" | "red";

const TRAFFIC: Record<Traffic, { fg: string; bg: string; sym: string; word: string }> = {
  green: { fg: "var(--color-ok)", bg: "var(--color-ok-soft)", sym: "●", word: "OK" },
  yellow: { fg: "var(--color-warn)", bg: "var(--color-warn-soft)", sym: "▲", word: "Risiko" },
  red: { fg: "var(--color-danger)", bg: "var(--color-danger-soft)", sym: "■", word: "Verstoß" },
};

export function ComplianceBadge({
  status,
  label,
  count,
}: {
  status: Traffic;
  label?: string;
  count?: number;
}): React.ReactElement {
  const t = TRAFFIC[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        background: t.bg,
        color: t.fg,
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <span aria-hidden style={{ fontSize: 10 }}>
        {t.sym}
      </span>
      <span>{label ?? t.word}</span>
      {count != null ? <span className="tabular">({count})</span> : null}
    </span>
  );
}

/** Neutraler Status-/Kategorie-Chip (Projektstatus, Rechnungsstatus …). */
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted";
}): React.ReactElement {
  const tones: Record<string, CSSProperties> = {
    neutral: { background: "var(--color-surface-sunken)", color: "var(--color-text)" },
    accent: { background: "var(--color-accent-soft)", color: "var(--color-accent-strong)" },
    muted: { background: "transparent", color: "var(--color-text-muted)" },
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        fontSize: 12,
        ...tones[tone],
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tabelle (dichte Ledger-Liste)
// ---------------------------------------------------------------------------

export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius)" }}>
      <table
        className="tabular"
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontFamily: "var(--font-sans)" }}
      >
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  width,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
}): React.ReactElement {
  return (
    <th
      style={{
        textAlign: align,
        padding: "8px 12px",
        fontSize: 11.5,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        color: "var(--color-text-muted)",
        background: "var(--color-surface-sunken)",
        borderBottom: "1px solid var(--color-border)",
        whiteSpace: "nowrap",
        width,
      }}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  mono = false,
  muted = false,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
}): React.ReactElement {
  return (
    <td
      className={mono ? "tabular" : undefined}
      style={{
        textAlign: align,
        padding: "8px 12px",
        borderBottom: "1px solid var(--color-border)",
        color: muted ? "var(--color-text-muted)" : "var(--color-text)",
        verticalAlign: "top",
      }}
    >
      {children}
    </td>
  );
}

// ---------------------------------------------------------------------------
// Leer-/Fehlerzustände
// ---------------------------------------------------------------------------

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "40px 20px",
        border: "1px dashed var(--color-border-strong)",
        borderRadius: "var(--radius)",
        color: "var(--color-text-muted)",
      }}
    >
      <p style={{ margin: 0, fontWeight: 600, color: "var(--color-text)" }}>{title}</p>
      {hint ? <p style={{ margin: "6px 0 0", fontSize: 13 }}>{hint}</p> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}

/** Hinweis, wenn ein Server-Read fehlschlägt (z. B. keine DB/Session). */
export function LoadError({ message }: { message?: string }): React.ReactElement {
  return (
    <div
      role="alert"
      style={{
        padding: "12px 14px",
        border: "1px solid var(--color-border)",
        borderLeft: "2px solid var(--color-warn)",
        borderRadius: "var(--radius)",
        background: "var(--color-warn-soft)",
        color: "var(--color-text)",
        fontSize: 13.5,
      }}
    >
      {message ?? "Daten konnten nicht geladen werden. Prüfe Serververbindung und Anmeldung."}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Abschnitts-Titel
// ---------------------------------------------------------------------------

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        margin: "24px 0 10px",
      }}
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{children}</h2>
      {right ? <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{right}</div> : null}
    </div>
  );
}
