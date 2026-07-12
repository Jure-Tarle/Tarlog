"use client";
/**
 * ui.tsx — kleine geteilte Formular-Bausteine für die Auth-Seiten (Client).
 * Konsistente, zurückhaltende Ledger-Optik ohne Schlagschatten. Von SetupForm
 * und LoginForm genutzt.
 */
import type { InputHTMLAttributes, ReactNode } from "react";

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--color-text-muted)",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontSize: 14,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius)",
  outline: "none",
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint ? (
        <div style={{ marginTop: 5, fontSize: 12, color: "var(--color-text-faint)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input {...props} style={{ ...inputStyle, ...(props.style ?? {}) }} />;
}

export function FormError({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{
        margin: "0 0 14px",
        padding: "9px 11px",
        fontSize: 13,
        lineHeight: 1.45,
        color: "var(--color-danger)",
        background: "var(--color-danger-soft)",
        border: "1px solid var(--color-danger)",
        borderRadius: "var(--radius)",
      }}
    >
      {message}
    </div>
  );
}

export function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}): React.ReactElement {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%",
        marginTop: 6,
        padding: "10px 14px",
        fontSize: 14,
        fontWeight: 600,
        color: "var(--color-accent-contrast)",
        background: "var(--color-accent)",
        border: "1px solid var(--color-accent-strong)",
        borderRadius: "var(--radius)",
        cursor: loading ? "progress" : "pointer",
        opacity: loading ? 0.7 : 1,
        transition: "opacity var(--duration-state) var(--ease-quiet)",
      }}
    >
      {loading ? "Bitte warten …" : children}
    </button>
  );
}

/** Zieht eine menschenlesbare Meldung aus der einheitlichen Fehlerantwort. */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string; details?: unknown };
    };
    const details = body.error?.details;
    if (Array.isArray(details) && details.length > 0) {
      const first = details[0] as { message?: string };
      if (first?.message) return first.message;
    }
    if (body.error?.message) return body.error.message;
  } catch {
    // ignore parse errors
  }
  return fallback;
}
