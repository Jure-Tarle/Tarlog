"use client";
/**
 * TimerConsole — Live-Erfassung (doc 03 §2/§3/§4).
 *
 * Start / Pause / Fortsetzen / Stopp + verpflichtender Stopp-Dialog (22
 * Elemente, doc 03 §4). Rundungsvorschau + Abrechnungsbetrag werden
 * clientseitig über @ptl/core berechnet (roundingPreview / computeAmountCents),
 * damit der Nutzer VOR dem Speichern sieht, was fakturiert wird (doc 03 §4
 * Nr. 17/18). Start-/Endzeit-Korrektur verlangt einen Grund (Nr. 16). Alle
 * Mutationen laufen über die Timer-REST-Routen (/api/timer/*).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeAmountCents, roundingPreview } from "@ptl/core";
import type { RateSnapshot, RoundingMode, RoundingRule } from "@ptl/core";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { deviceTimezone, formatMoney, secondsToHM, toDatetimeLocalValue } from "@/lib/ui/format";
import { Button, Checkbox, Field, FormRow, Select, StatusLine, TextArea, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";
import { TimerTicker } from "@/lib/ui/TimerTicker";
import type { ProjectRow, RoundingRuleRow, TaskRow, TimerRow } from "@/lib/ui/queries";

export interface TimerConsoleProps {
  initialTimer: TimerRow | null;
  projects: ProjectRow[];
  tasks: TaskRow[];
  rules: RoundingRuleRow[];
  currency: string;
}

function coreRule(r: RoundingRuleRow | undefined): RoundingRule {
  if (!r) return { id: "none", mode: "none" };
  return {
    id: r.id,
    mode: r.mode as RoundingMode,
    interval_seconds: r.interval_minutes ? ((r.interval_minutes * 60) as RoundingRule["interval_seconds"]) : undefined,
    minimum_seconds: r.min_duration_seconds ?? undefined,
  };
}

export function TimerConsole({ initialTimer, projects, tasks, rules, currency }: TimerConsoleProps): React.ReactElement {
  const router = useRouter();
  const [timer, setTimer] = useState<TimerRow | null>(initialTimer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>(initialTimer?.project_id ?? projects[0]?.id ?? "");
  const [taskId, setTaskId] = useState<string>(initialTimer?.task_id ?? "");
  const [startDescription, setStartDescription] = useState("");

  const status = timer?.status ?? "idle";
  const isActive = status === "running" || status === "paused";
  const needsDescription = status === "needs_description";

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );
  const projectTasks = useMemo(
    () => tasks.filter((t) => t.project_id === projectId || t.project_id === null),
    [tasks, projectId],
  );

  async function run(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Aktion fehlgeschlagen (Timer-Dienst nicht erreichbar).");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const [stopOpen, setStopOpen] = useState(needsDescription);

  async function onStart() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerStart, {
        project_id: projectId || null,
        task_id: taskId || null,
        description: startDescription || null,
        timezone: deviceTimezone(),
      });
      if (res?.timer) setTimer(res.timer);
    });
  }
  async function onPause() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerPause);
      if (res?.timer) setTimer(res.timer);
    });
  }
  async function onResume() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerResume);
      if (res?.timer) setTimer(res.timer);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error ? <StatusLine kind="error">{error}</StatusLine> : null}

      {isActive || needsDescription ? (
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderLeft: "2px solid var(--color-accent)",
            borderRadius: "var(--radius)",
            padding: 18,
            background: "var(--color-surface-raised)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {timer?.projectName ?? "Ohne Projekt"}
              {timer?.taskName ? ` · ${timer.taskName}` : ""}
            </div>
            <div style={{ marginTop: 8 }}>
              <TimerTicker timer={timer} size={34} />
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "var(--color-text-faint)" }}>
              Status: {status}
              {status === "paused" ? " (Pause läuft, zählt nicht zur Nettozeit)" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {status === "running" ? (
              <Button onClick={onPause} disabled={busy}>Pause</Button>
            ) : status === "paused" ? (
              <Button variant="primary" onClick={onResume} disabled={busy}>Fortsetzen</Button>
            ) : null}
            <Button variant="primary" onClick={() => setStopOpen(true)} disabled={busy}>Stoppen…</Button>
          </div>
        </div>
      ) : (
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            padding: 18,
            background: "var(--color-surface-raised)",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <FormRow>
            <Field label="Projekt">
              <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
                <option value="">Ohne Projekt</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Aufgabe">
              <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">—</option>
                {projectTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </Select>
            </Field>
          </FormRow>
          <Field label="Beschreibung (Entwurf, optional)" hint={selectedProject?.description_required ? "Dieses Projekt verlangt beim Stoppen eine Beschreibung." : undefined}>
            <TextInput
              value={startDescription}
              onChange={(e) => setStartDescription(e.target.value)}
              placeholder="Woran wird gearbeitet?"
            />
          </Field>
          <div>
            <Button variant="primary" onClick={onStart} disabled={busy}>Timer starten</Button>
          </div>
        </div>
      )}

      <StopDialog
        open={stopOpen || needsDescription}
        onClose={() => setStopOpen(false)}
        timer={timer}
        project={selectedProject}
        rule={coreRule(rules.find((r) => r.id === selectedProject?.rounding_rule_id))}
        rules={rules}
        currency={currency}
        busy={busy}
        onSubmit={async (payload) => {
          const ok = await run(async () => {
            await api.post(API.timerStop, payload);
            setTimer(null);
          });
          if (ok) setStopOpen(false);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stopp-Dialog (22 Elemente, doc 03 §4)
// ---------------------------------------------------------------------------

function StopDialog({
  open,
  onClose,
  timer,
  project,
  rule,
  rules,
  currency,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  timer: TimerRow | null;
  project: ProjectRow | undefined;
  rule: RoundingRule;
  rules: RoundingRuleRow[];
  currency: string;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}): React.ReactElement | null {
  const startedAt = timer?.started_at ?? Date.now() - 3600_000;
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [blocker, setBlocker] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [tags, setTags] = useState("");
  const [billable, setBillable] = useState(true);
  const [clientVisible, setClientVisible] = useState(true);
  const [internalNote, setInternalNote] = useState("");
  const [breakMinutes, setBreakMinutes] = useState<number>(
    Math.round((timer?.accumulated_pause_seconds ?? 0) / 60),
  );
  const [startLocal, setStartLocal] = useState(toDatetimeLocalValue(startedAt));
  const [endLocal, setEndLocal] = useState(toDatetimeLocalValue(Date.now()));
  const [ruleId, setRuleId] = useState<string>(project?.rounding_rule_id ?? "");
  const [correctionReason, setCorrectionReason] = useState("");

  const startMs = new Date(startLocal).getTime();
  const endMs = new Date(endLocal).getTime();
  const timesCorrected =
    Math.abs(startMs - startedAt) > 60_000 || Math.abs(endMs - (timer?.paused_at ?? Date.now())) > 5 * 60_000;

  const effectiveRule = ruleId ? coreRule(rules.find((r) => r.id === ruleId)) : rule;

  const preview = useMemo(() => {
    const gross = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const net = Math.max(0, gross - breakMinutes * 60);
    const rounded = roundingPreview(net, effectiveRule);
    const hourly = project?.hourly_rate_cents ?? 0;
    const snapshot: RateSnapshot = { amount_cents: hourly, currency, source: "project" };
    const amount = billable ? computeAmountCents(rounded.billing_duration_seconds, snapshot) : 0;
    return { net, rounded, amount };
  }, [endMs, startMs, breakMinutes, effectiveRule, project, currency, billable]);

  const descriptionRequired = Boolean(project?.description_required && (!project ? true : billable || project.description_required));
  const canSave = !descriptionRequired || description.trim().length > 0;

  function buildPayload(asDraft: boolean): Record<string, unknown> {
    return {
      status: asDraft ? "draft" : "stopped",
      project_id: project?.id ?? timer?.project_id ?? null,
      task_id: timer?.task_id ?? null,
      description,
      summary,
      long_description: longDescription || null,
      deliverable: deliverable || null,
      blocker: blocker || null,
      next_step: nextStep || null,
      internal_note: internalNote || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      is_billable: billable,
      client_visible: clientVisible,
      break_duration_seconds: breakMinutes * 60,
      actual_started_at: Number.isFinite(startMs) ? startMs : startedAt,
      actual_ended_at: Number.isFinite(endMs) ? endMs : Date.now(),
      rounding_rule_id: ruleId || project?.rounding_rule_id || null,
      correction_reason: timesCorrected ? correctionReason : null,
      timezone: deviceTimezone(),
    };
  }

  const shortBreakHint = breakMinutes > 0 && breakMinutes < 15;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Timer stoppen"
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Abbrechen</Button>
          <Button onClick={() => onSubmit(buildPayload(true))} disabled={busy}>Als Entwurf speichern</Button>
          <Button
            variant="primary"
            onClick={() => onSubmit(buildPayload(false))}
            disabled={busy || !canSave || (timesCorrected && !correctionReason.trim())}
          >
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Was wurde gemacht?" required={descriptionRequired} error={descriptionRequired && !canSave ? "Beschreibung ist für dieses Projekt Pflicht." : undefined}>
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurzbeschreibung der Tätigkeit" />
      </Field>
      <Field label="Kurze Zusammenfassung">
        <TextInput value={summary} onChange={(e) => setSummary(e.target.value)} />
      </Field>
      <Field label="Ausführliche Beschreibung (optional)">
        <TextArea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} />
      </Field>
      <FormRow>
        <Field label="Ergebnis / Deliverable (optional)">
          <TextInput value={deliverable} onChange={(e) => setDeliverable(e.target.value)} />
        </Field>
        <Field label="Blocker (optional)">
          <TextInput value={blocker} onChange={(e) => setBlocker(e.target.value)} />
        </Field>
      </FormRow>
      <Field label="Nächster Schritt (optional)">
        <TextInput value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
      </Field>
      <FormRow>
        <Field label="Tags (Komma-getrennt)">
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} placeholder="z. B. review, kunde" />
        </Field>
        <Field label="Rundungsregel">
          <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="">Projekt-Standard</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </Field>
      </FormRow>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Checkbox label="Abrechenbar" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        <Checkbox label="Kunde sichtbar" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
      </div>
      <Field label="Interne Notiz (nie kundensichtbar)">
        <TextInput value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
      </Field>

      <FormRow>
        <Field label="Startzeit korrigieren">
          <TextInput type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
        </Field>
        <Field label="Endzeit korrigieren">
          <TextInput type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
        </Field>
      </FormRow>
      <Field
        label="Pause bestätigen (Minuten)"
        hint={shortBreakHint ? "Hinweis: Blöcke unter 15 Min. zählen nicht als Ruhepause (doc 03 §6)." : undefined}
      >
        <TextInput
          type="number"
          min={0}
          value={breakMinutes}
          onChange={(e) => setBreakMinutes(Math.max(0, Number(e.target.value) || 0))}
        />
      </Field>
      {timesCorrected ? (
        <Field label="Grund für Korrektur" required error={!correctionReason.trim() ? "Pflicht bei geänderter Start-/Endzeit (Audit-Log)." : undefined}>
          <TextInput value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} />
        </Field>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
          padding: 12,
          borderRadius: "var(--radius)",
          background: "var(--color-surface-sunken)",
          border: "1px solid var(--color-border)",
        }}
      >
        <Metric label="Nettozeit" value={secondsToHM(preview.net) + " h"} />
        <Metric label="Rundungsvorschau" value={secondsToHM(preview.rounded.billing_duration_seconds) + " h"} hint={preview.rounded.rounding_reason} />
        <Metric label="Abrechnungsbetrag" value={formatMoney(preview.amount, currency)} accent />
      </div>
    </Modal>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }): React.ReactElement {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div className="tabular" style={{ fontSize: 18, fontWeight: 600, marginTop: 2, color: accent ? "var(--color-accent)" : "var(--color-text)" }}>{value}</div>
      {hint ? <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}
