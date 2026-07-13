import {
  cloneElement,
  isValidElement,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { CircleAlert, Inbox } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ComplianceStatus } from "@tarlog/core";

const SPRING = { type: "spring", bounce: 0, duration: 0.38 } as const;

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
  const titleId = useId();
  return (
    <section className="page" aria-labelledby={titleId}>
      <header className="page__head">
        <div className="page__headmain">
          <h1 className="page__title" id={titleId}>{title}</h1>
          {hint ? <span className="page__hint">{hint}</span> : null}
        </div>
        {actions ? <div className="page__actions">{actions}</div> : null}
      </header>
      <div className="page__body">{children}</div>
    </section>
  );
}

export function Toolbar({ children, label = "Aktionen" }: { children: ReactNode; label?: string }) {
  return <div className="toolbar" role="toolbar" aria-label={label}>{children}</div>;
}

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
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      className="card"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 9, scale: 0.995 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0.14 } : SPRING}
    >
      {(title || actions) ? (
        <header className="card__head">
          <div className="card__heading">
            {title ? <h2 className="card__title">{title}</h2> : null}
            {subtitle ? <p className="card__subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="card__body">{children}</div>
      {footer ? <footer className="card__foot">{footer}</footer> : null}
    </motion.section>
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
  const classes = [
    "stat",
    accent ? "stat--accent" : "",
    tone ? `stat--${tone}` : "",
    onClick ? "stat--clickable" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <span className="stat__label">{label}</span>
      <span className="stat__value num">{value}</span>
      {sub ? <span className="stat__sub">{sub}</span> : null}
    </>
  );
  return onClick ? (
    <motion.button type="button" className={classes} onClick={onClick} whileTap={{ scale: 0.985 }} transition={SPRING}>
      {content}
    </motion.button>
  ) : (
    <div className={classes}>{content}</div>
  );
}

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
  return (
    <span className={`cdot cdot--${STATUS_TONE[status]}`}>
      <span className="sr-only">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function ComplianceBadge({ status, children }: { status: ComplianceStatus; children?: ReactNode }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`badge badge--${tone}`}>
      <span aria-hidden><StatusDot status={status} /></span>
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return <span className={`tag ${tone ? `tag--${tone}` : ""}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon" aria-hidden><Inbox size={20} /></span>
      <p className="empty__title">{title}</p>
      {children ? <div className="empty__body">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="notice notice--error" role="alert">
      <CircleAlert size={16} aria-hidden />
      <span><strong>Nicht verfügbar.</strong> {error}</span>
    </div>
  );
}

export function Loading({ label = "Lädt…" }: { label?: string }) {
  return (
    <div className="loading" aria-live="polite">
      <span className="loading__spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

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

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="tablewrap">{children}</div>;
}

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
  const generatedId = useId();
  const messageId = error || hint ? `${generatedId}-message` : undefined;
  const control = isFieldControl(children) ? children : null;
  const controlId = control ? control.props.id ?? `${generatedId}-control` : undefined;
  const describedBy = control
    ? [control.props["aria-describedby"], messageId].filter(Boolean).join(" ") || undefined
    : undefined;
  const content = control
    ? cloneElement(control, {
        id: controlId,
        required: control.props.required ?? required,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : control.props["aria-invalid"],
      })
    : children;

  if (!control) {
    return (
      <fieldset
        className={`field field--group ${error ? "field--error" : ""}`}
        aria-describedby={messageId}
        aria-invalid={error ? true : undefined}
      >
        <legend className="field__label">
          {label}
          {required ? <span className="field__req" aria-hidden>*</span> : null}
        </legend>
        <div className="field__group-content">{content}</div>
        {error ? (
          <span className="field__error" id={messageId}>{error}</span>
        ) : hint ? (
          <span className="field__hint" id={messageId}>{hint}</span>
        ) : null}
      </fieldset>
    );
  }

  return (
    <div className={`field ${error ? "field--error" : ""}`}>
      {controlId ? (
        <label className="field__label" htmlFor={controlId}>
          {label}
          {required ? <span className="field__req" aria-hidden>*</span> : null}
        </label>
      ) : (
        <span className="field__label">
          {label}
          {required ? <span className="field__req" aria-hidden>*</span> : null}
        </span>
      )}
      {content}
      {error ? (
        <span className="field__error" id={messageId}>{error}</span>
      ) : hint ? (
        <span className="field__hint" id={messageId}>{hint}</span>
      ) : null}
    </div>
  );
}

type FieldControlProps = {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

function isFieldControl(node: ReactNode): node is ReactElement<FieldControlProps> {
  if (!isValidElement<FieldControlProps>(node)) return false;
  if (typeof node.type === "string") return ["input", "select", "textarea"].includes(node.type);
  return node.type === TextInput || node.type === TextArea || node.type === Select || node.type === Checkbox;
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
  const classes = variant === "default" ? "btn" : `btn btn--${variant}`;
  return (
    <button type="button" {...props} className={`${classes} ${props.className ?? ""}`}>
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
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            tabIndex={active ? 0 : -1}
            className={`segmented__btn ${active ? "is-active" : ""}`}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const lastIndex = options.length - 1;
              let targetIndex: number | null = null;
              if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                targetIndex = index === 0 ? lastIndex : index - 1;
              } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                targetIndex = index === lastIndex ? 0 : index + 1;
              } else if (event.key === "Home") {
                targetIndex = 0;
              } else if (event.key === "End") {
                targetIndex = lastIndex;
              }

              if (targetIndex == null) return;
              const targetOption = options[targetIndex];
              if (!targetOption) return;
              event.preventDefault();
              onChange(targetOption.value);
              const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(".segmented__btn");
              buttons?.[targetIndex]?.focus();
            }}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
