"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/ui/format";

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
    <label className="auth-field field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-message">{hint}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input {...props} className={cx("ui-input", className)} />;
}

export function FormError({ message }: { message: string | null }): React.ReactElement | null {
  if (!message) return null;
  return <div role="alert" className="auth-error">{message}</div>;
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
      className="ui-button variant-primary size-md auth-submit"
      aria-busy={loading}
    >
      {loading ? "Bitte warten …" : children}
    </button>
  );
}

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
    // Nicht-JSON-Antworten fallen auf die fachliche Standardmeldung zurück.
  }
  return fallback;
}
