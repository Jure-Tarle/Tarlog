/**
 * Timer — Start/Pause/Resume/Stop (doc 03, doc 11 §2).
 *
 * The Stop-Dialog enforces a project-mandated description, previews rounding
 * (@tarlog/core roundingPreview + resolveRoundingRuleForEntry) and allows a
 * start/end correction. All state flows through the finished useTimer hook.
 */
import { useEffect, useState } from "react";
import {
  Page, Card, Button, Field, FormRow, Select, TextArea, TextInput, ErrorNote, Tag,
} from "../components/ui";
import { useAsync, useTick } from "../data/hooks";
import { useTimer, elapsedSeconds, NAV_EVENT } from "../data/timer";
import { projects as projectRepo } from "../data/repositories";
import { listTasks } from "../data/tasks";
import { getProject } from "../data/projects";
import { resolveRoundingRuleForEntry } from "../data/rounding";
import { roundingPreview, type RoundingResult } from "@tarlog/core";
import { fmtHMS, fmtHM, fmtDurationShort, fromDateTimeInputs, toDateInputValue, toTimeInputValue } from "../data/format";
import { useTimezone } from "./shared";

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
  const [correctStart, setCorrectStart] = useState(false);
  const [startAt, setStartAt] = useState("");

  const tasks = useAsync(() => listTasks(projectId || null), [projectId]);
  const [stopOpen, setStopOpen] = useState(false);

  // Tray "Stop" opens the mandatory dialog (doc 11 §5 nr. 12).
  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as { route?: string; action?: string } | undefined;
      if (detail?.route === "timer" && detail.action === "stop" && timer.active) setStopOpen(true);
    };
    window.addEventListener(NAV_EVENT, onNav);
    return () => window.removeEventListener(NAV_EVENT, onNav);
  }, [timer.active]);

  async function onStart() {
    const startedAt = correctStart && startAt ? fromDateTimeInputs(startAt.slice(0, 10), startAt.slice(11), tz) : null;
    await timer.start({ projectId: projectId || null, taskId: taskId || null, description: desc || null, startedAt });
    setDesc("");
  }

  return (
    <Page title="Timer" hint={timer.active ? "läuft" : "bereit"}>
      {timer.error && !timer.active ? <ErrorNote error={timer.error} /> : null}

      <Card title={timer.active ? "Laufender Timer" : "Neuer Timer"}>
        <div className="timerface">
          <span className={`timerface__elapsed ${timer.state?.status === "running" ? "timerface__elapsed--running" : ""} num`}>
            {fmtHMS(elapsed)}
          </span>
          <span className="timerface__meta">
            {timer.active ? (timer.state?.status === "paused" ? "pausiert" : "läuft seit Start") : "noch nicht gestartet"}
            {timer.state?.accumulated_pause_seconds ? ` · Pausen ${fmtDurationShort(timer.state.accumulated_pause_seconds)}` : ""}
          </span>

          {!timer.active ? (
            <div className="stack" style={{ width: "100%", maxWidth: 520 }}>
              <FormRow>
                <Field label="Projekt">
                  <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
                    <option value="">— ohne Projekt —</option>
                    {(proj.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
                <Field label="Aufgabe">
                  <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!(tasks.data ?? []).length}>
                    <option value="">— ohne Aufgabe —</option>
                    {(tasks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
              </FormRow>
              <Field label="Beschreibung">
                <TextInput value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Woran arbeitest du?" />
              </Field>
              <Field label="Startzeit korrigieren" hint="Für einen vergessenen Start rückwirkend beginnen.">
                <div className="cluster">
                  <label className="check">
                    <input
                      type="checkbox"
                      className="check__box"
                      checked={correctStart}
                      onChange={(e) => { setCorrectStart(e.target.checked); if (e.target.checked && !startAt) setStartAt(nowLocalInput(tz)); }}
                    />
                    <span>abweichende Startzeit</span>
                  </label>
                  {correctStart ? (
                    <TextInput type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} style={{ width: "auto" }} />
                  ) : null}
                </div>
              </Field>
              <div className="cluster">
                <Button variant="primary" onClick={() => void onStart()}>Timer starten</Button>
              </div>
            </div>
          ) : (
            <div className="cluster">
              {timer.state?.status === "paused" ? (
                <Button variant="primary" onClick={() => void timer.resume()}>Fortsetzen</Button>
              ) : (
                <Button onClick={() => void timer.pause()}>Pause</Button>
              )}
              <Button variant="danger" onClick={() => setStopOpen(true)}>Stoppen…</Button>
            </div>
          )}
        </div>
      </Card>

      {stopOpen && timer.active ? (
        <StopDialog
          projectId={timer.state?.project_id ?? null}
          netSeconds={elapsed}
          startedAt={timer.state?.started_at ?? Date.now()}
          tz={tz}
          onCancel={() => setStopOpen(false)}
          onConfirm={async (description, at) => {
            await timer.stop({ description, at });
            setStopOpen(false);
          }}
        />
      ) : null}
    </Page>
  );
}

/** The mandatory Stop-Dialog: description gate + rounding preview + end correction. */
function StopDialog({
  projectId, netSeconds, startedAt, tz, onCancel, onConfirm,
}: {
  projectId: string | null;
  netSeconds: number;
  startedAt: number;
  tz: string;
  onCancel: () => void;
  onConfirm: (description: string | null, at: number | null) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [correctEnd, setCorrectEnd] = useState(false);
  const [endAt, setEndAt] = useState(nowLocalInput(tz));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RoundingResult | null>(null);

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
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label="Timer stoppen">
      <div className="dialog">
        <div className="dialog__head">Timer stoppen</div>
        <div className="dialog__body">
          <Field
            label="Beschreibung"
            required={required.data ?? false}
            error={descMissing ? "Für dieses Projekt ist eine Beschreibung Pflicht." : undefined}
          >
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was wurde erledigt?" autoFocus />
          </Field>

          <Field label="Endzeit korrigieren">
            <div className="cluster">
              <label className="check">
                <input type="checkbox" className="check__box" checked={correctEnd} onChange={(e) => setCorrectEnd(e.target.checked)} />
                <span>abweichende Endzeit</span>
              </label>
              {correctEnd ? <TextInput type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} style={{ width: "auto" }} /> : null}
            </div>
          </Field>

          <div className="inset">
            <div className="defrow"><span className="defrow__key">Netto</span><span className="num">{fmtHM(previewNet)}</span></div>
            <div className="defrow"><span className="defrow__key">Abrechnung (gerundet)</span><span className="num">{preview ? fmtHM(preview.billing_duration_seconds) : "—"}</span></div>
            <div className="defrow">
              <span className="defrow__key">Rundung</span>
              <span>
                {preview ? (
                  <>
                    <span className="num">{preview.rounding_delta_seconds >= 0 ? "+" : "−"}{fmtHM(Math.abs(preview.rounding_delta_seconds))}</span>{" "}
                    <Tag tone="muted">{preview.rounding_reason}</Tag>
                  </>
                ) : "—"}
              </span>
            </div>
          </div>
        </div>
        <div className="dialog__foot">
          <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
          <Button
            variant="primary"
            disabled={descMissing || busy}
            onClick={async () => {
              setBusy(true);
              try { await onConfirm(description || null, effectiveEnd); }
              finally { setBusy(false); }
            }}
          >
            Stoppen &amp; speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
