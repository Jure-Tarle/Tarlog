"use client";
/**
 * lib/ui/Modal.tsx — leichtgewichtiger Dialog (Stopp-Dialog, Formulare).
 * Fokus-Falle bewusst schlank; Escape schließt, Backdrop-Klick schließt.
 * Motion zurückhaltend (kein Bounce), respektiert prefers-reduced-motion via
 * globals.css.
 */
import { useEffect } from "react";
import type { ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "color-mix(in srgb, var(--color-ink-950) 55%, transparent)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "6vh 16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: width,
          background: "var(--color-surface-raised)",
          border: "1px solid var(--color-border-strong)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 20,
              lineHeight: 1,
              color: "var(--color-text-muted)",
            }}
          >
            ×
          </button>
        </header>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
        {footer ? (
          <footer
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "12px 18px",
              borderTop: "1px solid var(--color-border)",
            }}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
