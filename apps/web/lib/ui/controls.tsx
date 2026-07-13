"use client";

import type { Route } from "next";
import Link from "next/link";
import * as React from "react";
import type {
  AnchorHTMLAttributes,
  AriaAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Children, cloneElement, isValidElement, useId } from "react";
import { cx } from "./format.js";

type Variant = "primary" | "default" | "ghost" | "danger";

function buttonClass(variant: Variant, size: "sm" | "md", className?: string): string {
  return cx("ui-button", `variant-${variant}`, `size-${size}`, className);
}

export function Button({
  variant = "default",
  size = "md",
  children,
  className,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md";
}): React.ReactElement {
  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={buttonClass(variant, size, className)}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "default",
  size = "md",
  className,
  children,
  ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  variant?: Variant;
  size?: "sm" | "md";
}): React.ReactElement {
  return (
    <Link {...rest} href={href as Route} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
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
  const generatedId = useId();
  const childItems = Children.toArray(children);
  const hintId = hint ? `${generatedId}-hint` : undefined;
  const errorId = error ? `${generatedId}-error` : undefined;
  const messageIds = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const messages = (
    <>
      {hint ? <span id={hintId} className="field-message">{hint}</span> : null}
      {error ? <span id={errorId} className="field-message is-error">{error}</span> : null}
    </>
  );

  const candidate = childItems[0];
  const isSingleControl = childItems.length === 1
    && isValidElement<FieldControlProps>(candidate)
    && candidate.type !== React.Fragment;

  if (!isSingleControl || !isValidElement<FieldControlProps>(candidate)) {
    return (
      <fieldset
        className="field field-group"
        aria-describedby={messageIds}
        aria-invalid={error ? true : undefined}
      >
        <legend className="field-label">
          {label}{required ? <span className="field-required"> *</span> : null}
        </legend>
        {children}
        {messages}
      </fieldset>
    );
  }

  const child = candidate;
  const controlId = htmlFor ?? child.props.id ?? `${generatedId}-control`;
  const effectiveRequired = Boolean(required || child.props.required);
  const describedBy = mergeIds(child.props["aria-describedby"], messageIds);
  const control = cloneElement(child, {
    id: controlId,
    required: effectiveRequired || undefined,
    "aria-invalid": error ? true : child.props["aria-invalid"],
    "aria-describedby": describedBy,
    "aria-errormessage": errorId ?? child.props["aria-errormessage"],
  });

  return (
    <div className="field">
      <label htmlFor={controlId} className="field-label">
        {label}{effectiveRequired ? <span className="field-required"> *</span> : null}
      </label>
      {control}
      {messages}
    </div>
  );
}

interface FieldControlProps {
  id?: string;
  required?: boolean;
  "aria-invalid"?: AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
  "aria-errormessage"?: string;
}

function mergeIds(...values: Array<string | undefined>): string | undefined {
  const ids = values.flatMap((value) => value?.split(/\s+/).filter(Boolean) ?? []);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.ReactElement {
  return <input {...props} className={cx("ui-input", className)} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>): React.ReactElement {
  return <textarea {...props} className={cx("ui-textarea", className)} />;
}

export function Select({
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.ReactElement {
  return (
    <select {...props} className={cx("ui-select", className)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }): React.ReactElement {
  return (
    <label className="ui-checkbox">
      <input type="checkbox" {...props} className={className} />
      <span>{label}</span>
    </label>
  );
}

export function FormRow({ children }: { children: ReactNode }): React.ReactElement {
  return <div className="form-row">{children}</div>;
}

export function StatusLine({
  kind,
  children,
}: {
  kind: "error" | "success" | "info";
  children: ReactNode;
}): React.ReactElement {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`status-line kind-${kind}`}>
      {children}
    </div>
  );
}
