import type { ReactNode } from "react";
import { BrandMark } from "@/lib/ui/BrandMark";

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
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand" aria-label="Tarlog Flow">
          <span className="brand">
            <BrandMark />
            <span className="brand-copy">
              <strong>Tarlog</strong>
              <small>Flow</small>
            </span>
          </span>
        </div>
        <div className="auth-eyebrow">{eyebrow}</div>
        <h1 id="auth-title">{title}</h1>
        {subtitle ? <p className="auth-subtitle">{subtitle}</p> : null}
        <div className="auth-content">{children}</div>
        {footer ? <footer className="auth-footer">{footer}</footer> : null}
      </section>
    </main>
  );
}
