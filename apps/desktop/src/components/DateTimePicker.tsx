import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DateTime } from "luxon";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { getLanguage } from "../i18n";
import { t } from "../i18n";
import { Button } from "./ui";

/** Custom date + time picker replacing the native OS `datetime-local` popover. */
export function DateTimePicker({
  value,
  onChange,
  tz,
  className,
  max,
}: {
  /** "YYYY-MM-DDTHH:mm", same format used by nowLocalInput/fromDateTimeInputs. */
  value: string;
  onChange: (value: string) => void;
  tz: string;
  className?: string;
  /** Epoch ms upper bound (e.g. Date.now()) — later dates/times can't be picked. */
  max?: number;
}) {
  const lang = getLanguage();
  const selected = useMemo(() => {
    const dt = DateTime.fromISO(value, { zone: tz });
    return dt.isValid ? dt : DateTime.now().setZone(tz);
  }, [value, tz]);
  const maxDt = useMemo(() => (max != null ? DateTime.fromMillis(max, { zone: tz }) : null), [max, tz]);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected.year);
  const [viewMonth, setViewMonth] = useState(selected.month);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setViewYear(selected.year);
    setViewMonth(selected.month);
    // Only reset the visible month when the popover opens, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Rendered via portal into <body> so a scroll-clipped/overflow:hidden ancestor
  // (e.g. .card) can never crop the panel. Position tracks the trigger and flips
  // above it (or clamps to the window) when there isn't room below.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const tr = triggerRef.current?.getBoundingClientRect();
      if (!tr) return;
      const pr = panelRef.current?.getBoundingClientRect();
      const panelH = pr?.height ?? 220;
      const panelW = pr?.width ?? 272;
      const spaceBelow = window.innerHeight - tr.bottom;
      const spaceAbove = tr.top;
      const placeAbove = spaceBelow < panelH + 12 && spaceAbove > spaceBelow;
      const top = placeAbove
        ? Math.max(8, tr.top - panelH - 6)
        : Math.min(tr.bottom + 6, window.innerHeight - panelH - 8);
      const left = Math.min(Math.max(8, tr.left), window.innerWidth - panelW - 8);
      setAnchor({ top, left });
    };
    reposition();
    // Second pass once the panel is actually mounted and its real size is known.
    const raf = requestAnimationFrame(reposition);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function commit(next: DateTime) {
    const clamped = maxDt && next > maxDt ? maxDt : next;
    onChange(clamped.toFormat("yyyy-MM-dd'T'HH:mm"));
  }

  function shiftMonth(delta: number) {
    const next = DateTime.local(viewYear, viewMonth, 1).plus({ months: delta });
    setViewYear(next.year);
    setViewMonth(next.month);
  }

  const monthStart = DateTime.local(viewYear, viewMonth, 1, { zone: tz });
  const gridStart = monthStart.minus({ days: monthStart.weekday - 1 });
  const days = Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i }));
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    DateTime.local(2024, 1, 1 + i, { zone: tz }).setLocale(lang).toFormat("ccccc"));
  const todayKey = DateTime.now().setZone(tz).toFormat("yyyy-MM-dd");
  const selectedKey = selected.toFormat("yyyy-MM-dd");
  const maxDayKey = maxDt ? maxDt.toFormat("yyyy-MM-dd") : null;

  const dateLabel = selected.setLocale(lang).toFormat(lang === "en" ? "MM/dd/yyyy" : "dd.MM.yyyy");
  const timeLabel = selected.toFormat("HH:mm");

  const onMaxDay = maxDayKey === selectedKey;
  const hourMax = onMaxDay ? maxDt!.hour : 23;
  const minuteMax = onMaxDay && selected.hour >= (maxDt?.hour ?? 23) ? maxDt!.minute : 59;

  return (
    <div className={`dtp ${className ?? ""}`}>
      <button
        type="button"
        ref={triggerRef}
        className="dtp__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <CalendarClock size={14} aria-hidden />
        <span className="num">{dateLabel}, {timeLabel}</span>
      </button>
      {open && anchor
        ? createPortal(
            <div
              className="dtp__panel"
              ref={panelRef}
              role="dialog"
              aria-label={t("Datum und Uhrzeit wählen")}
              style={{ position: "fixed", top: anchor.top, left: anchor.left }}
            >
              <div className="dtp__time">
                <TimeStepper value={selected.hour} max={hourMax} onChange={(h) => commit(selected.set({ hour: h }))} />
                <span className="dtp__time-sep">:</span>
                <TimeStepper value={selected.minute} max={minuteMax} onChange={(m) => commit(selected.set({ minute: m }))} />
              </div>
              <div className="dtp__cal-head">
                <button type="button" className="dtp__nav" onClick={() => shiftMonth(-1)} aria-label={t("Vorheriger Monat")}>
                  <ChevronLeft size={14} />
                </button>
                <span className="dtp__cal-title">{monthStart.setLocale(lang).toFormat("LLLL yyyy")}</span>
                <button
                  type="button"
                  className="dtp__nav"
                  onClick={() => shiftMonth(1)}
                  disabled={maxDt ? monthStart.plus({ months: 1 }) > maxDt.startOf("month") : false}
                  aria-label={t("Nächster Monat")}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="dtp__weekdays">
                {weekdayLabels.map((w, i) => <span key={i}>{w}</span>)}
              </div>
              <div className="dtp__days">
                {days.map((d) => {
                  const key = d.toFormat("yyyy-MM-dd");
                  const inMonth = d.month === viewMonth;
                  const disabled = maxDayKey != null && key > maxDayKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      className={`dtp__day ${inMonth ? "" : "dtp__day--muted"} ${key === selectedKey ? "is-selected" : ""} ${key === todayKey ? "is-today" : ""}`}
                      onClick={() => commit(selected.set({ year: d.year, month: d.month, day: d.day }))}
                    >
                      {d.day}
                    </button>
                  );
                })}
              </div>
              <div className="dtp__foot">
                <Button variant="ghost" onClick={() => setOpen(false)}>{t("Fertig")}</Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function TimeStepper({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="dtp-stepper">
      <input
        className="dtp-stepper__input num"
        type="text"
        inputMode="numeric"
        value={String(value).padStart(2, "0")}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(-2);
          const n = digits === "" ? 0 : parseInt(digits, 10);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(0, n)));
        }}
      />
      <div className="dtp-stepper__arrows">
        <button type="button" tabIndex={-1} aria-label="+1" onClick={() => onChange(value >= max ? 0 : value + 1)}>
          <ChevronUp size={11} />
        </button>
        <button type="button" tabIndex={-1} aria-label="-1" onClick={() => onChange(value <= 0 ? max : value - 1)}>
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}
