"use client";
/**
 * lib/ui/controls.tsx — interaktive Formular-Primitive (Client).
 *
 * Konsistente Eingabe-Elemente in Ledger-Optik: neutrale Flächen, EINE
 * Akzentfarbe für Primäraktionen, sichtbarer Fokus (globals.css), keine
 * Default-Shadows. Alle themed Farben über CSS-Variablen.
 */
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const inputBase: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sm)",
  outline: "none",
};

type Variant = "primary" | "default" | "ghost" | "danger";

const BTN: Record<Variant, CSSProperties> = {
  primary: {
    background: "var(--color-accent)",
    color: "var(--color-accent-contrast)",
    border: "1px solid var(--color-accent)",
  },
  default: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    border: "1px solid var(--color-border-strong)",
  },
  ghost: {
    background: "transparent",
    color: "var(--color-text)",
    border: "1px solid transparent",
  },
  danger: {
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
    border: "1px solid var(--color-danger)",
  },
};

export function Button({
  variant = "default",
  size = "md",
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
}): React.ReactElement {
  const pad = size === "sm" ? "5px 10px" : "7px 14px";
  return (
    <button
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: pad,
        fontSize: size === "sm" ? 13 : 14,
        fontWeight: 500,
        fontFamily: "var(--font-sans)",
        borderRadius: "var(--radius-sm)",
        cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.55 : 1,
        transition: "background var(--duration-state) var(--ease-quiet)",
        ...BTN[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}): React.ReactElement {
  return (
    <label htmlFor={htmlFor} style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12.5,
          fontWeight: 500,
          marginBottom: 4,
          color: "var(--color-text-muted)",
        }}
      >
        {label}
        {required ? <span style={{ color: "var(--color-danger)" }}> *</span> : null}
      </span>
      {children}
      {error ? (
        <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--color-danger)" }}>
          {error}
        </span>
      ) : hint ? (
        <span style={{ display: "block", marginTop: 4, fontSize: 12, color: "var(--color-text-faint)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input {...props} style={{ ...inputBase, ...props.style }} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return <textarea {...props} style={{ ...inputBase, resize: "vertical", minHeight: 72, ...props.style }} />;
}

export function Select({
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select {...props} style={{ ...inputBase, ...props.style }}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }): React.ReactElement {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
      <input
        type="checkbox"
        {...props}
        style={{ width: 16, height: 16, accentColor: "var(--color-accent)", ...props.style }}
      />
      <span>{label}</span>
    </label>
  );
}

/** Zweispaltiges Formular-Raster (auf schmalen Screens einspaltig). */
export function FormRow({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

/** Inline-Statuszeile für Formular-Ergebnisse (Erfolg/Fehler). */
export function StatusLine({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}): React.ReactElement {
  const map = {
    error: { fg: "var(--color-danger)", bg: "var(--color-danger-soft)" },
    success: { fg: "var(--color-ok)", bg: "var(--color-ok-soft)" },
    info: { fg: "var(--color-text)", bg: "var(--color-surface-sunken)" },
  } as const;
  const c = map[kind];
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      style={{
        padding: "8px 12px",
        borderRadius: "var(--radius-sm)",
        background: c.bg,
        color: c.fg,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
