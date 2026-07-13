/**
 * Backdating — Nachtragsassistent (doc 03 §7). Formular mit den 14 Feldern und
 * den 11 vordefinierten Nachtragsgründen (backdateReasonEnum). Anlage über die
 * Rust-Assistant-Command entries.create(BackdateEntryInput); darunter die Liste
 * der bereits nachgetragenen Einträge. Live-Vorschau von Netto + Rundung.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Page, Card, Button, Field, FormRow, Select, TextArea, TextInput, Checkbox, Tag, TableWrap, AsyncBody, EmptyState, ErrorNote,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { listCustomers } from "../data/customers";
import { listProjects } from "../data/projects";
import { listTasks } from "../data/tasks";
import { entries } from "../data/repositories";
import { resolveRoundingRuleForEntry } from "../data/rounding";
import { roundingPreview, backdateReasonEnum, type RoundingResult } from "@tarlog/core";
import type { BackdateEntryInput } from "../lib/bridge";
import { fmtHM, fmtDate, fmtClock, fromDateTimeInputs, toDateInputValue, deviceTimezone } from "../data/format";
import { useTimezone, nameMap } from "./shared";

/** German labels for the 11 stable reason keys (doc 03 §7.2). */
const REASONS: Record<string, string> = {
  forgot_to_start: "1 · Timer vergessen zu starten",
  forgot_to_stop: "2 · Timer vergessen zu stoppen",
  worked_offline: "3 · Arbeit offline durchgeführt",
  meeting: "4 · Meeting nachgetragen",
  phone_call: "5 · Telefonat nachgetragen",
  travel_time: "6 · Reisezeit nachgetragen",
  client_work: "7 · Kundenarbeit nachgetragen",
  internal_work: "8 · interne Arbeit nachgetragen",
  calendar_import: "9 · Kalendertermin übernommen",
  correction: "10 · Korrektur eines falschen Eintrags",
  other: "11 · sonstiger Grund",
};

export default function Backdating() {
  const tz = useTimezone();
  const today = toDateInputValue(Date.now(), tz);

  // --- 14 form fields ---
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [timezone, setTimezone] = useState(tz || deviceTimezone());
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState<string>("forgot_to_start");
  const [billable, setBillable] = useState(true);
  const [withBreak, setWithBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("12:30");
  const [note, setNote] = useState("");

  useEffect(() => { if (tz) setTimezone(tz); }, [tz]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoundingResult | null>(null);

  const customers = useAsync(() => listCustomers(), []);
  const projects = useAsync(() => listProjects(customerId ? { customerId } : {}), [customerId]);
  const tasks = useAsync(() => listTasks(projectId || null), [projectId]);
  const backdated = useAsync(() => entries.backdated(50), []);
  const projNames = nameMap((projects.data ?? []) as { id: string; name: string }[]);
  const allProjects = useAsync(() => listProjects(), []);
  const projNameAll = nameMap((allProjects.data ?? []) as { id: string; name: string }[]);

  const startedAt = fromDateTimeInputs(date, start, timezone);
  const endedAt = fromDateTimeInputs(date, end, timezone);
  const netSeconds = useMemo(() => {
    if (startedAt == null || endedAt == null || endedAt <= startedAt) return 0;
    let n = Math.floor((endedAt - startedAt) / 1000);
    if (withBreak) {
      const bs = fromDateTimeInputs(date, breakStart, timezone);
      const be = fromDateTimeInputs(date, breakEnd, timezone);
      if (bs != null && be != null && be > bs) n -= Math.floor((be - bs) / 1000);
    }
    return Math.max(0, n);
  }, [startedAt, endedAt, withBreak, date, breakStart, breakEnd, timezone]);

  useEffect(() => {
    let alive = true;
    void resolveRoundingRuleForEntry({ projectId: projectId || null, customerId: customerId || null }).then((rule) => {
      if (alive) setPreview(roundingPreview(netSeconds, rule));
    });
    return () => { alive = false; };
  }, [projectId, customerId, netSeconds]);

  const rangeInvalid = startedAt == null || endedAt == null || endedAt <= startedAt;

  async function submit() {
    setError(null); setOkMsg(null);
    if (rangeInvalid) { setError("Endzeit muss nach der Startzeit liegen."); return; }
    const breaks =
      withBreak
        ? (() => {
            const bs = fromDateTimeInputs(date, breakStart, timezone);
            const be = fromDateTimeInputs(date, breakEnd, timezone);
            return bs != null && be != null && be > bs ? [{ started_at: bs, ended_at: be }] : [];
          })()
        : [];
    const input: BackdateEntryInput = {
      customer_id: customerId || null,
      project_id: projectId || null,
      task_id: taskId || null,
      started_at: startedAt!,
      ended_at: endedAt!,
      timezone,
      description: [description, note].filter(Boolean).join(" — ") || null,
      reason,
      breaks,
    };
    setBusy(true);
    try {
      await entries.create(input);
      setOkMsg("Nachtrag gespeichert.");
      setDescription(""); setNote("");
      backdated.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Nachträge" hint="Nachtragsassistent (doc 03 §7)">
      {error ? <ErrorNote error={error} /> : null}
      {okMsg ? <div className="notice notice--info" role="status">{okMsg}</div> : null}
      {!billable ? null : null}

      <div className="grid-2">
        <Card title="Nachtrag erfassen" subtitle="14 Felder · 11 Gründe">
          <div className="stack">
            <FormRow>
              <Field label="Kunde">
                <Select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setProjectId(""); setTaskId(""); }}>
                  <option value="">— ohne Kunde —</option>
                  {(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Projekt">
                <Select value={projectId} onChange={(e) => { setProjectId(e.target.value); setTaskId(""); }}>
                  <option value="">— ohne Projekt —</option>
                  {(projects.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <Field label="Aufgabe">
                <Select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={!(tasks.data ?? []).length}>
                  <option value="">— ohne Aufgabe —</option>
                  {(tasks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            </FormRow>

            <FormRow>
              <Field label="Datum" required><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <Field label="Start" required><TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Ende" required error={rangeInvalid ? "nach Start" : undefined}><TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
              <Field label="Zeitzone"><TextInput value={timezone} onChange={(e) => setTimezone(e.target.value)} /></Field>
            </FormRow>

            <Field label="Beschreibung"><TextInput value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Was wurde erledigt?" /></Field>
            <Field label="Interne Notiz"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" /></Field>

            <FormRow>
              <Field label="Grund" required hint="Pflicht bei Projekten mit Begründungszwang.">
                <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                  {backdateReasonEnum.options.map((k) => <option key={k} value={k}>{REASONS[k] ?? k}</option>)}
                </Select>
              </Field>
              <Field label="Abrechnung">
                <Checkbox label="abrechenbar" checked={billable} onChange={(e) => setBillable((e.target as HTMLInputElement).checked)} />
              </Field>
            </FormRow>

            <Field label="Pause">
              <div className="cluster">
                <Checkbox label="Pause abziehen" checked={withBreak} onChange={(e) => setWithBreak((e.target as HTMLInputElement).checked)} />
                {withBreak ? (
                  <>
                    <TextInput type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} style={{ width: "auto" }} />
                    <span className="faint">–</span>
                    <TextInput type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} style={{ width: "auto" }} />
                  </>
                ) : null}
              </div>
            </Field>

            <div className="inset">
              <div className="defrow"><span className="defrow__key">Netto</span><span className="num">{fmtHM(netSeconds)}</span></div>
              <div className="defrow"><span className="defrow__key">Abrechnung (gerundet)</span><span className="num">{preview ? fmtHM(preview.billing_duration_seconds) : "—"}</span></div>
              <div className="defrow"><span className="defrow__key">Rundung</span><span>{preview ? <Tag tone="muted">{preview.rounding_reason}</Tag> : "—"}</span></div>
            </div>

            <div className="cluster">
              <Button variant="primary" disabled={busy || rangeInvalid} onClick={() => void submit()}>Nachtrag speichern</Button>
            </div>
          </div>
        </Card>

        <Card title="Bereits nachgetragen" subtitle="letzte manuelle Einträge">
          <AsyncBody state={{ data: backdated.data, error: backdated.error, loading: backdated.loading }} empty={<EmptyState title="Noch keine Nachträge" />}>
            {(rows) => (
              <TableWrap>
                <table className="table">
                  <thead><tr><th>Datum</th><th>Zeit</th><th>Projekt</th><th>Grund</th><th className="right">Netto</th></tr></thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td className="num">{fmtDate(e.actual_started_at, e.timezone || tz)}</td>
                        <td className="num">{fmtClock(e.actual_started_at, e.timezone || tz)}{e.actual_ended_at ? `–${fmtClock(e.actual_ended_at, e.timezone || tz)}` : ""}</td>
                        <td>{e.project_id ? projNames.get(e.project_id) ?? projNameAll.get(e.project_id) ?? "—" : <span className="faint">—</span>}</td>
                        <td><Tag tone="muted">{e.backdate_reason ? (REASONS[e.backdate_reason] ?? e.backdate_reason) : "—"}</Tag></td>
                        <td className="right num">{fmtHM(e.net_work_duration_seconds ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </AsyncBody>
        </Card>
      </div>
    </Page>
  );
}
