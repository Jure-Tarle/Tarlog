/**
 * Timer, Start/Pause/Resume/Stop (doc 03, doc 11 §2).
 *
 * The Stop-Dialog enforces a project-mandated description, previews rounding
 * (@tarlog/core roundingPreview + resolveRoundingRuleForEntry) and allows a
 * start/end correction. All state flows through the finished useTimer hook.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Clock, NotebookPen, Play } from "lucide-react";
import {
  Page, Card, Button, Field, FormRow, Select, TextArea, TextInput, ErrorNote, Tag,
} from "../components/ui";
import { DateTimePicker } from "../components/DateTimePicker";
import { useAsync, useTick } from "../data/hooks";
import {
  consumePendingTimerStop,
  elapsedSeconds,
  isNavigationRequest,
  NAV_EVENT,
  TIMER_STATUS_LABELS,
  useTimer,
} from "../data/timer";
import { projects as projectRepo } from "../data/repositories";
import { listTasks } from "../data/tasks";
import { getProject } from "../data/projects";
import { resolveRoundingRuleForEntry } from "../data/rounding";
import { roundingPreview, type RoundingResult } from "@tarlog/core";
import { fmtHMS, fmtHM, fmtDurationShort, fromDateTimeInputs, toDateInputValue, toTimeInputValue } from "../data/format";
import { useTimezone } from "./shared";
import { loadTimerDescriptionDraft } from "../data/timerDescriptionDraft";
import { t } from "../i18n";

function nowLocalInput(tz: string): string {
  return `${toDateInputValue(Date.now(), tz)}T${toTimeInputValue(Date.now(), tz)}`;
}

export default function Timer() {
  const tz = useTimezone();
  const timer = useTimer();
  const now = useTick(true);
  const elapsed = elapsedSeconds(timer.state, now);

  const proj = useAsync(() => projectRepo.list({ status: "active" }), []);
  const [projectId, setProjectId] = useState<string>("");
  const [taskId, setTaskId] = useState<string>("");
  const [desc, setDesc] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [correctStart, setCorrectStart] = useState(false);
  const [startAt, setStartAt] = useState("");

  const tasks = useAsync(() => listTasks(projectId || null), [projectId]);
  const [stopOpen, setStopOpen] = useState(false);
  const startable = !timer.state || timer.state.status === "idle" || timer.state.status === "stopped";

  // Tray "Stop" may arrive before this route mounts or before timer state loads.
  useEffect(() => {
    const openPendingStop = () => {
      if (timer.loading) return;
      const requested = consumePendingTimerStop();
      if (requested && timer.active) setStopOpen(true);
    };

    openPendingStop();
    const onNav = (e: Event) => {
      const request = (e as CustomEvent<unknown>).detail;
      if (!isNavigationRequest(request) || request.route !== "timer" || request.action !== "stop") return;
      openPendingStop();
    };
    window.addEventListener(NAV_EVENT, onNav);
    return () => window.removeEventListener(NAV_EVENT, onNav);
  }, [timer.active, timer.loading]);

  async function onStart() {
    const startedAt = correctStart && startAt ? fromDateTimeInputs(startAt.slice(0, 10), startAt.slice(11), tz) : null;
    const started = await timer.start({ projectId: projectId || null, taskId: taskId || null, description: desc || null, startedAt });
    if (started) {
      setDesc("");
      setShowDescription(false);
    }
  }

  return (
    <Page
      title={t("Timer")}
      hint={timer.loading ? t("lädt") : timer.state && timer.state.status !== "idle" ? t(TIMER_STATUS_LABELS[timer.state.status]) : undefined}
    >
      {timer.error ? <ErrorNote error={timer.error} /> : null}

      <Card title={timer.active ? t("Laufender Timer") : t("Neuer Timer")}>
        <div className="timerface">
          <span className={`timerface__elapsed ${timer.state?.status === "running" ? "timerface__elapsed--running" : ""} num`}>
            {fmtHMS(elapsed)}
          </span>
          {timer.state && timer.state.status !== "idle" ? (
            <span className="timerface__meta">
              {t(TIMER_STATUS_LABELS[timer.state.status])}
              {timer.state.accumulated_pause_seconds ? t(" | Pausen {duration}", { duration: fmtDurationShort(timer.state.accumulated_pause_seconds) }) : ""}
            </span>
          ) : null}

          {!timer.active ? (
            <div className="stack" style={{ width: "100%", maxWidth: 520 }}>
              <FormRow>
                <Field label={t("Projekt")}>
                  <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
                    <option value="">{t("Ohne Projekt")}</option>
                    {(proj.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label={t("Teilprojekt / Aufgabe")} hint={t("Für eine getrennte Auswertung im Projekt")}>
                  <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!(tasks.data ?? []).some((task) => task.status === "active")}>
                    <option value="">{t("Ohne Teilprojekt")}</option>
                    {(tasks.data ?? []).filter((task) => task.status === "active").map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                  </Select>
                </Field>
              </FormRow>
              {showDescription ? (
                <Field
                  label={t("Beschreibung vorab (optional)")}
                  hint={t("Du kannst sie beim Stoppen prüfen, ergänzen oder ersetzen.")}
                >
                  <TextInput
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder={t("Falls schon klar: Woran arbeitest du?")}
                    autoFocus
                  />
                </Field>
              ) : (
                <button type="button" className="option-row" onClick={() => setShowDescription(true)}>
                  <span className="option-row__icon" aria-hidden><NotebookPen size={16} /></span>
                  <span className="option-row__label">{t("Beschreibung vorab hinzufügen")}</span>
                  <span className="option-row__hint">{t("Optional, normalerweise beim Stoppen")}</span>
                </button>
              )}
              <div className="option-row option-row--static">
                <span className="option-row__icon" aria-hidden><Clock size={16} /></span>
                <div className="option-row__body">
                  <span className="option-row__label">{t("Startzeit korrigieren")}</span>
                  <label className="check">
                    <input
                      type="checkbox"
                      className="check__box"
                      checked={correctStart}
                      onChange={(e) => { setCorrectStart(e.target.checked); if (e.target.checked && !startAt) setStartAt(nowLocalInput(tz)); }}
                    />
                    <span>{t("abweichende Startzeit")}</span>
                  </label>
                  {correctStart ? (
                    <DateTimePicker value={startAt} onChange={setStartAt} tz={tz} max={Date.now()} />
                  ) : (
                    <span className="option-row__hint">{t("Für einen vergessenen Start rückwirkend beginnen.")}</span>
                  )}
                </div>
              </div>
              <div className="cluster cluster--center">
                <Button variant="primary" disabled={timer.pending || !startable} onClick={() => void onStart()}>
                  <Play size={15} fill="currentColor" /> {t("Timer starten")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="timerface__active-actions">
              <p>{t("Beim Stoppen hältst du fest, was du erledigt hast.")}</p>
              <div className="cluster">
                {timer.state?.status === "paused" ? (
                  <Button variant="primary" disabled={timer.pending} onClick={() => void timer.resume()}>
                    <Play size={15} fill="currentColor" /> {t("Fortsetzen")}
                  </Button>
                ) : (
                  <Button disabled={timer.pending} onClick={() => void timer.pause()}>{t("Pause")}</Button>
                )}
                <Button variant="danger" disabled={timer.pending} onClick={() => setStopOpen(true)}>{t("Stoppen & beschreiben…")}</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {stopOpen && timer.active ? (
        <StopDialog
          projectId={timer.state?.project_id ?? null}
          initialDescriptionForStartedAt={timer.state?.started_at ?? null}
          netSeconds={elapsed}
          startedAt={timer.state?.started_at ?? Date.now()}
          tz={tz}
          onCancel={() => setStopOpen(false)}
          onConfirm={async (description, at) => {
            const result = await timer.stop({ description, at });
            if (result) setStopOpen(false);
          }}
        />
      ) : null}
    </Page>
  );
}

/** The mandatory Stop-Dialog: description gate + rounding preview + end correction. */
function StopDialog({
  projectId, initialDescriptionForStartedAt, netSeconds, startedAt, tz, onCancel, onConfirm,
}: {
  projectId: string | null;
  initialDescriptionForStartedAt: number | null;
  netSeconds: number;
  startedAt: number;
  tz: string;
  onCancel: () => void;
  onConfirm: (description: string | null, at: number | null) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const descriptionEdited = useRef(false);
  const [correctEnd, setCorrectEnd] = useState(false);
  const [endAt, setEndAt] = useState(nowLocalInput(tz));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RoundingResult | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const titleId = useId();
  onCancelRef.current = onCancel;

  useEffect(() => {
    let cancelled = false;
    void loadTimerDescriptionDraft(initialDescriptionForStartedAt).then((draft) => {
      if (!cancelled && !descriptionEdited.current && draft) setDescription(draft);
    });
    return () => { cancelled = true; };
  }, [initialDescriptionForStartedAt]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>(
        "[autofocus], textarea, input, select, button:not([disabled])",
      );
      (first ?? dialogRef.current)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  // Description requirement comes from the project (doc 03 Stop-Dialog).
  const required = useAsync(async () => {
    if (!projectId) return false;
    const p = await getProject(projectId);
    return p?.description_required ?? false;
  }, [projectId]);

  const effectiveEnd = correctEnd ? fromDateTimeInputs(endAt.slice(0, 10), endAt.slice(11), tz) : null;
  const previewNet = effectiveEnd != null ? Math.max(0, Math.floor((effectiveEnd - startedAt) / 1000)) : netSeconds;

  // Rounding preview must match what will be persisted (@tarlog/core).
  useEffect(() => {
    let alive = true;
    void resolveRoundingRuleForEntry({ projectId, customerId: null }).then((rule) => {
      if (alive) setPreview(roundingPreview(previewNet, rule));
    });
    return () => { alive = false; };
  }, [projectId, previewNet]);

  const descMissing = (required.data ?? false) && description.trim() === "";

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancelRef.current();
      }}
    >
      <div
        className="dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog__head" id={titleId}>{t("Timer stoppen")}</div>
        <div className="dialog__body">
          <Field
            label={t("Beschreibung")}
            required={required.data ?? false}
            error={descMissing ? t("Für dieses Projekt ist eine Beschreibung Pflicht.") : undefined}
          >
            <TextArea
              value={description}
              onChange={(e) => {
                descriptionEdited.current = true;
                setDescription(e.target.value);
              }}
              placeholder={t("Was hast du erledigt?")}
              autoFocus
            />
          </Field>

          <Field label={t("Endzeit korrigieren")}>
            <div className="cluster">
              <label className="check">
                <input type="checkbox" className="check__box" checked={correctEnd} onChange={(e) => setCorrectEnd(e.target.checked)} />
                <span>{t("abweichende Endzeit")}</span>
              </label>
              {correctEnd ? <DateTimePicker value={endAt} onChange={setEndAt} tz={tz} max={Date.now()} /> : null}
            </div>
          </Field>

          <div className="inset">
            <div className="defrow"><span className="defrow__key">{t("Netto")}</span><span className="num">{fmtHM(previewNet)}</span></div>
            <div className="defrow"><span className="defrow__key">{t("Abrechnung (gerundet)")}</span><span className="num">{preview ? fmtHM(preview.billing_duration_seconds) : ","}</span></div>
            <div className="defrow">
              <span className="defrow__key">{t("Rundung")}</span>
              <span>
                {preview ? (
                  <>
                    <span className="num">{preview.rounding_delta_seconds >= 0 ? "+" : "−"}{fmtHM(Math.abs(preview.rounding_delta_seconds))}</span>{" "}
                    <Tag tone="muted">{preview.rounding_reason}</Tag>
                  </>
                ) : ","}
              </span>
            </div>
          </div>
        </div>
        <div className="dialog__foot">
          <Button variant="ghost" onClick={onCancel}>{t("Abbrechen")}</Button>
          <Button
            variant="primary"
            disabled={descMissing || busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(description || null, effectiveEnd); }
              finally { setBusy(false); }
            }}
          >
            {t("Stoppen & speichern")}
          </Button>
        </div>
      </div>
    </div>
  );
}
