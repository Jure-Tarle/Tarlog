/**
 * ui.tsx — the ledger design system primitives.
 *
 * Consumes the tokens in styles.css (one accent, tabular numerals, no default
 * shadows, deliberate radii — doc 11 §1). Pages compose these; they never
 * hard-code colors or sizes.
 */
import type {
  ReactNode,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";
import type { ComplianceStatus } from "@ptl/core";

// --- Page scaffold ---------------------------------------------------------

export function Page({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="page" aria-label={title}>
      <header className="page__head">
        <div className="page__headmain">
          <h1 className="page__title">{title}</h1>
          {hint ? <span className="page__hint">{hint}</span> : null}
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar">{children}</div>;
}

// --- Surfaces --------------------------------------------------------------

export function Card({
  title,
  subtitle,
  actions,
  children,
  footer,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title ? <h2 className="card__title">{title}</h2> : null}
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      )}
      <div className="card__body">{children}</div>
      {footer ? <footer className="card__foot">{footer}</footer> : null}
    </section>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="statgrid">{children}</div>;
}

export function StatTile({
  label,
  value,
  sub,
  tone,
  accent,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: ComplianceStatus;
  accent?: boolean;
  onClick?: () => void;
}) {
  const cls = ["stat", accent ? "stat--accent" : "", tone ? `stat--${tone}` : "", onClick ? "stat--clickable" : ""]
    .filter(Boolean)
    .join(" ");
  const inner = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value num">{value}</span>
      {sub ? <span className="stat__sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// --- Status ----------------------------------------------------------------

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  green: "Konform",
  yellow: "Risiko",
  red: "Verstoß",
};

const STATUS_TONE: Record<ComplianceStatus, "ok" | "warn" | "danger"> = {
  green: "ok",
  yellow: "warn",
  red: "danger",
};

export function StatusDot({ status }: { status: ComplianceStatus }) {
  return <span className={`cdot cdot--${STATUS_TONE[status]}`} aria-hidden />;
}

export function ComplianceBadge({ status, children }: { status: ComplianceStatus; children?: ReactNode }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`badge badge--${tone}`}>
      <StatusDot status={status} />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return <span className={`tag ${tone ? `tag--${tone}` : ""}`}>{children}</span>;
}

// --- States ----------------------------------------------------------------

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {children ? <div className="empty__body">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="notice notice--error" role="alert">
      <strong>Nicht verfügbar.</strong> {error}
    </div>
  );
}

export function Loading({ label = "Lädt…" }: { label?: string }) {
  return (
    <div className="loading" aria-live="polite">
      <span className="loading__spinner" aria-hidden />
      {label}
    </div>
  );
}

/**
 * Standard async body: renders loading / error / empty / content in one place
 * so every page treats the not-yet-migrated backend gracefully.
 */
export function AsyncBody<T>({
  state,
  empty,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean };
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (state.loading && state.data == null) return <Loading />;
  if (state.error && state.data == null) return <ErrorNote error={state.error} />;
  if (state.data == null || (Array.isArray(state.data) && state.data.length === 0)) {
    return <>{empty ?? <EmptyState title="Keine Daten" />}</>;
  }
  return <>{children(state.data)}</>;
}

// --- Table -----------------------------------------------------------------

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="tablewrap">{children}</div>;
}

// --- Form controls ---------------------------------------------------------

export function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {required ? <span className="field__req" aria-hidden>*</span> : null}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="formrow">{children}</div>;
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`input textarea ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input select ${props.className ?? ""}`} />;
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="check">
      <input {...props} type="checkbox" className="check__box" />
      <span>{label}</span>
    </label>
  );
}

export function Button({
  variant = "default",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" | "danger" }) {
  const cls = variant === "default" ? "btn" : `btn btn--${variant}`;
  return (
    <button type="button" {...props} className={`${cls} ${props.className ?? ""}`}>
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={`segmented__btn ${o.value === value ? "is-active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
