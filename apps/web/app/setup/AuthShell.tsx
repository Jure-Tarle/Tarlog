/**
 * AuthShell — Vollbild-Rahmen für Auth-Seiten (Setup/Login). Legt sich als
 * `position: fixed` über die App-Shell aus dem Root-Layout (das eine feste
 * Sidebar rendert, die auf Auth-Seiten nicht erwünscht ist).
 *
 * Design-Direktion (doc 11 §1 "ruhiges Kontobuch"): neutrale Fläche, EINE
 * Akzentfarbe, dezente 1px-Ränder statt Schlagschatten, großzügiger Weißraum,
 * tabulare Ziffern für Codes. Rein präsentational (Server-Component).
 */
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}): React.ReactElement {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "var(--color-surface-sunken)",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "30px 28px 26px",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--color-text-faint)",
          }}
        >
          Tarlog · {eyebrow}
        </div>
        <h1
          style={{
            margin: "10px 0 0",
            fontSize: 21,
            lineHeight: 1.2,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--color-text)",
          }}
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--color-text-muted)",
            }}
          >
            {subtitle}
          </p>
        ) : null}

        <div style={{ marginTop: 22 }}>{children}</div>

        {footer ? (
          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid var(--color-border)",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
