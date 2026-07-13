import type { CSSProperties, ReactNode } from "react";
import { cx, formatMoney, secondsToHMS } from "./format.js";

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
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
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
    <div className={cx("ui-card", padded && "is-padded", className)} style={style}>
      {children}
    </div>
  );
}

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
  const gridStyle = {
    "--grid-min": `${min}px`,
    "--grid-gap": `${gap}px`,
    ...style,
  } as CSSProperties;
  return <div className="ui-grid" style={gridStyle}>{children}</div>;
}

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
      <div className="stat-label">{label}</div>
      <div className="stat-value tabular">{value}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </>
  );
  const className = cx("stat-tile", accent && "is-accent");
  return href ? <a href={href} className={className}>{inner}</a> : <div className={className}>{inner}</div>;
}

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

export type Traffic = "green" | "yellow" | "red";

const TRAFFIC: Record<Traffic, { sym: string; word: string }> = {
  green: { sym: "●", word: "OK" },
  yellow: { sym: "▲", word: "Risiko" },
  red: { sym: "■", word: "Verstoß" },
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
    <span className={`compliance-badge tone-${status}`}>
      <span aria-hidden>{t.sym}</span>
      <span>{label ?? t.word}</span>
      {count != null ? <span className="tabular">({count})</span> : null}
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "muted";
}): React.ReactElement {
  return <span className={`status-badge tone-${tone}`}>{children}</span>;
}

export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div className="table-shell">
      <table className="data-table">
        <thead><tr>{head}</tr></thead>
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
  return <th style={{ textAlign: align, width }}>{children}</th>;
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
    <td className={cx(mono && "tabular", muted && "is-muted")} style={{ textAlign: align }}>
      {children}
    </td>
  );
}

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
    <div className="empty-state">
      <div className="empty-state-inner">
        <p className="empty-state-title">{title}</p>
        {hint ? <p className="empty-state-hint">{hint}</p> : null}
        {action ? <div className="empty-state-action">{action}</div> : null}
      </div>
    </div>
  );
}

export function LoadError({ message }: { message?: string }): React.ReactElement {
  return (
    <div role="alert" className="load-error">
      {message ?? "Daten konnten nicht geladen werden. Prüfe Serververbindung und Anmeldung."}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}): React.ReactElement {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {right ? <div className="section-title-aside">{right}</div> : null}
    </div>
  );
}
