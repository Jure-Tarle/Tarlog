/**
 * PagePlaceholder, shared scaffold for the 13 area pages.
 *
 * Every page stub renders this until its owning UI author fills the page. It
 * carries the ledger design tokens (title scale, muted hint, dashed stub box)
 * so the skeleton already looks intentional, not like a broken route.
 */
import { t } from "../i18n";

export function PagePlaceholder({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page" aria-labelledby="page-title">
      <header className="page__head">
        <h1 className="page__title" id="page-title">
          {title}
        </h1>
        {hint ? <span className="page__hint">{hint}</span> : null}
      </header>
      <div className="page__stub">
        {children ?? (
          <p>
            {t("Platzhalter für")} <strong>{title}</strong>{t(". Diese Seite füllt der UI-Autor. Backend über")} <code>src/lib/bridge.ts</code>{t(", Read-Queries über")} <code>src/lib/db.ts</code>.
          </p>
        )}
      </div>
    </section>
  );
}
