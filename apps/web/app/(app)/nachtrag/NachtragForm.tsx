"use client";
/**
 * NachtragForm — Arbeitszeit nachtragen (doc 03 §7.1, alle 14 Felder; §7.2, 11
 * Gründe). Quelle wird fest auf „manuell nachgetragen" gesetzt (Feld 14). Der
 * Assistent zeigt live die gerundete abrechenbare Dauer (§7.3 Nr. 11) und
 * Compliance-Hinweise (kurze Pausen). POST an /api/time-entries.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { computeAmountCents, roundingPreview } from "@tarlog/core";
import type { RateSnapshot, RoundingMode, RoundingRule } from "@tarlog/core";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { deviceTimezone, formatMoney, secondsToHM } from "@/lib/ui/format";
import { Button, Checkbox, Field, FormRow, Select, StatusLine, TextArea, TextInput } from "@/lib/ui/controls";
import type { ProjectRow, RoundingRuleRow, TaskRow } from "@/lib/ui/queries";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "forgot_to_start", label: "Timer vergessen zu starten" },
  { value: "forgot_to_stop", label: "Timer vergessen zu stoppen" },
  { value: "worked_offline", label: "Arbeit offline durchgeführt" },
  { value: "meeting", label: "Meeting nachgetragen" },
  { value: "phone_call", label: "Telefonat nachgetragen" },
  { value: "travel_time", label: "Reisezeit nachgetragen" },
  { value: "client_work", label: "Kundenarbeit nachgetragen" },
  { value: "internal_work", label: "interne Arbeit nachgetragen" },
  { value: "calendar_import", label: "Kalendertermin übernommen" },
  { value: "correction", label: "Korrektur eines falschen Eintrags" },
  { value: "other", label: "sonstiger Grund" },
];

function coreRule(r: RoundingRuleRow | undefined): RoundingRule {
  if (!r) return { id: "none", mode: "none" };
  return {
    id: r.id,
    mode: r.mode as RoundingMode,
    interval_seconds: r.interval_minutes ? ((r.interval_minutes * 60) as RoundingRule["interval_seconds"]) : undefined,
    minimum_seconds: r.min_duration_seconds ?? undefined,
  };
}

export function NachtragForm({
  projects,
  tasks,
  rules,
  currency,
  prefill,
}: {
  projects: ProjectRow[];
  tasks: TaskRow[];
  rules: RoundingRuleRow[];
  currency: string;
  prefill: { date: string; startTime: string; endTime: string };
}): React.ReactElement {
  const router = useRouter();
  const [date, setDate] = useState(prefill.date);
  const [startTime, setStartTime] = useState(prefill.startTime);
  const [endTime, setEndTime] = useState(prefill.endTime);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [billable, setBillable] = useState(true);
  const [reason, setReason] = useState(REASONS[0]!.value);
  const [tags, setTags] = useState("");
  const [clientVisible, setClientVisible] = useState(true);
  const [internalNote, setInternalNote] = useState("");
  const [lateReason, setLateReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "success"; msg: string } | null>(null);

  const project = projects.find((p) => p.id === projectId);
  const projectTasks = tasks.filter((t) => t.project_id === projectId || t.project_id === null);
  const descriptionRequired = Boolean(project?.description_required);
  const reasonRequired = Boolean(project?.backdating_reason_required);

  const times = useMemo(() => {
    let start = new Date(`${date}T${startTime || "00:00"}:00`).getTime();
    let end = new Date(`${date}T${endTime || "00:00"}:00`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return null;
    if (end <= start) end += 86_400_000; // über Mitternacht
    return { start, end };
  }, [date, startTime, endTime]);

  const preview = useMemo(() => {
    if (!times) return null;
    const gross = Math.floor((times.end - times.start) / 1000);
    const net = Math.max(0, gross - breakMinutes * 60);
    const rule = coreRule(rules.find((r) => r.id === project?.rounding_rule_id));
    const rounded = roundingPreview(net, rule);
    const snapshot: RateSnapshot = { amount_cents: project?.hourly_rate_cents ?? 0, currency, source: "project" };
    const amount = billable ? computeAmountCents(rounded.billing_duration_seconds, snapshot) : 0;
    return { net, rounded, amount, crossesMidnight: times.end - times.start > 0 && new Date(times.end).getDate() !== new Date(times.start).getDate() };
  }, [times, breakMinutes, rules, project, currency, billable]);

  const canSave = Boolean(times) && (!descriptionRequired || description.trim()) && (!reasonRequired || reason);
  const shortBreakHint = breakMinutes > 0 && breakMinutes < 15;

  async function submit(asDraft: boolean) {
    if (!times) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.post(API.timeEntries, {
        source: "manual_backdated",
        is_backdated: true,
        status: asDraft ? "draft" : "stopped",
        project_id: projectId || null,
        task_id: taskId || null,
        description: description || null,
        break_duration_seconds: breakMinutes * 60,
        is_billable: billable,
        backdate_reason: reason,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        client_visible: clientVisible,
        internal_note: internalNote || null,
        late_reason: lateReason || null,
        actual_started_at: times.start,
        actual_ended_at: times.end,
        timezone: deviceTimezone(),
        date,
      });
      setStatus({ kind: "success", msg: "Nachtrag gespeichert." });
      router.refresh();
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof ApiClientError ? e.message : "Speichern fehlgeschlagen (Dienst nicht erreichbar).",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
      {status ? <StatusLine kind={status.kind}>{status.msg}</StatusLine> : null}

      <FormRow>
        <Field label="Datum" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Startzeit" required>
          <TextInput type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Endzeit" required>
          <TextInput type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Projekt">
          <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
            <option value="">Ohne Projekt</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Aufgabe (optional)">
          <Select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
            <option value="">—</option>
            {projectTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </FormRow>

      <Field label="Tätigkeitsbeschreibung" required={descriptionRequired}>
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <FormRow>
        <Field label="Pausenzeit (Minuten)" hint={shortBreakHint ? "Unter 15 Min. zählt nicht als Ruhepause." : undefined}>
          <TextInput type="number" min={0} value={breakMinutes} onChange={(e) => setBreakMinutes(Math.max(0, Number(e.target.value) || 0))} />
        </Field>
        <Field label="Grund für Nachtrag" required={reasonRequired}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
        </Field>
      </FormRow>

      <FormRow>
        <Field label="Tags (Komma-getrennt, optional)">
          <TextInput value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Begründung für spätere Erfassung (optional)">
          <TextInput value={lateReason} onChange={(e) => setLateReason(e.target.value)} />
        </Field>
      </FormRow>

      <Field label="Interne Notiz (optional, nie kundensichtbar)">
        <TextInput value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
      </Field>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <Checkbox label="Abrechenbar" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
        <Checkbox label="Kunde sichtbar" checked={clientVisible} onChange={(e) => setClientVisible(e.target.checked)} />
      </div>

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
        <Metric label="Nettozeit" value={preview ? secondsToHM(preview.net) + " h" : "—"} />
        <Metric label="Abrechenbar (gerundet)" value={preview ? secondsToHM(preview.rounded.billing_duration_seconds) + " h" : "—"} hint={preview?.rounded.rounding_reason} />
        <Metric label="Betrag" value={preview ? formatMoney(preview.amount, currency) : "—"} accent />
      </div>

      <div style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
        Quelle: manuell nachgetragen · wird im Audit-Log protokolliert und im PDF-Nachweis als Nachtrag markiert.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={() => submit(true)} disabled={busy || !times}>Als Entwurf</Button>
        <Button variant="primary" onClick={() => submit(false)} disabled={busy || !canSave}>Nachtrag speichern</Button>
      </div>
    </div>
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
