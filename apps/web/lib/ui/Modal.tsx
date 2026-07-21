"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
}): React.JSX.Element | null {
  const [mounted, setMounted] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  onCloseRef.current = onClose;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const focusFrame = window.requestAnimationFrame(() => {
      const target = surfaceRef.current?.querySelector<HTMLElement>("[autofocus], input, select, textarea, button");
      (target ?? surfaceRef.current)?.focus();
    });

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !surfaceRef.current) return;
      const focusable = Array.from(surfaceRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        surfaceRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previousFocus?.focus();
    };
  }, [open]);

  if (!mounted) return null;

  const modal = (
    <AnimatePresence>
      {open ? (
        <motion.div className="modal-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.button
            type="button"
            className="modal-scrim"
            tabIndex={-1}
            aria-label="Dialog schließen"
            onClick={() => onCloseRef.current()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.2 }}
          />
          <motion.div
            ref={surfaceRef}
            className="modal-surface"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            style={{ "--modal-width": `${width}px` } as CSSProperties}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.965, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.975, filter: "blur(6px)" }}
            transition={reduceMotion ? { duration: 0.14 } : { type: "spring", bounce: 0, duration: 0.34 }}
          >
            <header className="modal-header">
              <h2 id={titleId}>{title}</h2>
              <button type="button" className="icon-button" onClick={() => onCloseRef.current()} aria-label="Schließen">
                <X size={19} />
              </button>
            </header>
            <div className="modal-body">{children}</div>
            {footer ? <footer className="modal-footer">{footer}</footer> : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return createPortal(modal, document.body);
}
