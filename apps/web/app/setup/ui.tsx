"use client";

import type { AriaAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Children, cloneElement, isValidElement, useId } from "react";
import { cx } from "@/lib/ui/format";

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const generatedId = useId();
  const candidate = Children.toArray(children)[0];
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement<AuthControlProps>(candidate)
    ? cloneElement(candidate, {
        id: candidate.props.id ?? `${generatedId}-control`,
        required: required || candidate.props.required || undefined,
        "aria-invalid": error ? true : candidate.props["aria-invalid"],
        "aria-describedby": describedBy,
        "aria-errormessage": errorId,
      })
    : children;
  const controlId = isValidElement<AuthControlProps>(control) ? control.props.id : undefined;

  return (
    <div className="auth-field field">
      <label className="field-label" htmlFor={controlId}>
        {label}{required ? <span className="field-required"> *</span> : null}
      </label>
      {control}
      {hint ? <span id={hintId} className="field-message">{hint}</span> : null}
      {error ? <span id={errorId} className="field-message is-error">{error}</span> : null}
    </div>
  );
}

interface AuthControlProps {
  id?: string;
  required?: boolean;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input {...props} className={cx("ui-input", className)} />;
}

export function FormError({ message }: { message: string | null }): React.JSX.Element | null {
  if (!message) return null;
  return <div role="alert" className="auth-error">{message}</div>;
}

export function SubmitButton({
  loading,
  children,
}: {
  loading: boolean;
  children: ReactNode;
}): React.JSX.Element {
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
