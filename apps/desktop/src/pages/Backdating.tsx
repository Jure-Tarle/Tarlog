/**
 * Backdating workspace, create and correct manual time entries with one
 * shared form, a readable billing preview, and an editable activity history.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, CheckSquare2, Clock3, Coffee, ListFilter, Pencil, ReceiptText, X } from "lucide-react";
import {
  Page, Card, Button, Field, FormRow, Select, TextArea, TextInput, Checkbox,
  Tag, AsyncBody, EmptyState, ErrorNote,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { listCustomers } from "../data/customers";
import { listProjects } from "../data/projects";
import { listTasks } from "../data/tasks";
import { entries, type TimeEntry } from "../data/repositories";
import { resolveRoundingRuleForEntry } from "../data/rounding";
import { presentRounding } from "../data/roundingPresentation";
import { adjustRangeForStartChange } from "../data/timeRange";
import { roundingPreview, backdateReasonEnum, type RoundingResult } from "@tarlog/core";
import type { BackdateEntryInput } from "../lib/bridge";
import {
  fmtHM, fmtDate, fmtClock, fromDateTimeInputs, toDateInputValue,
  toTimeInputValue, deviceTimezone,
} from "../data/format";
import { useTimezone, nameMap } from "./shared";
import { t } from "../i18n";

// Labels stay German (dictionary keys); t() is applied at render time.
export const BACKDATE_REASONS: Record<string, string> = {
  forgot_to_start: "Timerstart vergessen",
  forgot_to_stop: "Timerende vergessen",
  worked_offline: "Offline gearbeitet",
  meeting: "Meeting nachgetragen",
  phone_call: "Telefonat nachgetragen",
  travel_time: "Reisezeit nachgetragen",
  client_work: "Kundenarbeit nachgetragen",
  internal_work: "Interne Arbeit",
  calendar_import: "Aus Kalender übernommen",
  correction: "Eintrag korrigiert",
  other: "Sonstiger Grund",
};

const DAY_MS = 86_400_000;

export default function Backdating() {
  const tz = useTimezone();
  const today = toDateInputValue(Date.now(), tz);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [date, setDate] = useState(today);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [endsNextDay, setEndsNextDay] = useState(false);
  const [timezone, setTimezone] = useState(tz || deviceTimezone());
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState<string>("forgot_to_start");
  const [billable, setBillable] = useState(true);
  const [withBreak, setWithBreak] = useState(false);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("12:30");
  const [breakNextDay, setBreakNextDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<RoundingResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState("__unchanged__");
  const [bulkTaskId, setBulkTaskId] = useState("__unchanged__");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkBillable, setBulkBillable] = useState("unchanged");
  const [historyExpanded, setHistoryExpanded] = useState(() => window.location.hash.includes("project="));
  const [projectContextApplied, setProjectContextApplied] = useState(false);
  const routeOpenStarted = useRef(false);

  const routeTarget = window.location.hash.replace(/^#\/backdating\/?/, "").split("?")[0] || null;
  const routeParams = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
  const returnProjectId = routeParams.get("returnProject");
  const projectHistoryFilter = routeParams.get("project");

  useEffect(() => { if (tz && !editingId) setTimezone(tz); }, [tz, editingId]);

  const customers = useAsync(() => listCustomers(), []);
  const projects = useAsync(
    () => listProjects(customerId ? { customerId } : {}).then((rows) => rows.filter((p) => p.status !== "archived")),
    [customerId],
  );
  const allProjects = useAsync(() => listProjects(), []);
  const tasks = useAsync(() => listTasks(projectId || null), [projectId]);
  const allTasks = useAsync(() => listTasks(null), []);
  const backdated = useAsync(() => entries.backdated(100), []);
  const customerNames = nameMap(customers.data ?? []);
  const projectNames = nameMap(allProjects.data ?? []);
  const taskNames = nameMap(allTasks.data ?? []);
  const projectHistoryRows = useMemo(
    () => (backdated.data ?? []).filter((entry) => !projectHistoryFilter || entry.project_id === projectHistoryFilter),
    [backdated.data, projectHistoryFilter],
  );
  const visibleHistoryRows = historyExpanded ? projectHistoryRows : projectHistoryRows.slice(0, 5);

  useEffect(() => {
    if (!projectHistoryFilter || projectContextApplied || !(allProjects.data ?? []).length) return;
    const contextProject = (allProjects.data ?? []).find((project) => project.id === projectHistoryFilter);
    if (contextProject) {
      setCustomerId(contextProject.customer_id ?? "");
      setProjectId(contextProject.id);
    }
    setProjectContextApplied(true);
  }, [allProjects.data, projectContextApplied, projectHistoryFilter]);

  const startInstant = fromDateTimeInputs(date, start, timezone);
  const endOnDate = fromDateTimeInputs(date, end, timezone);
  const endInstant = endOnDate == null ? null : endOnDate + (endsNextDay ? DAY_MS : 0);
  const breakStartOnDate = fromDateTimeInputs(date, breakStart, timezone);
  const breakEndOnDate = fromDateTimeInputs(date, breakEnd, timezone);
  const breakStartInstant = breakStartOnDate == null ? null : breakStartOnDate + (breakNextDay ? DAY_MS : 0);
  const breakEndInstant = breakEndOnDate == null ? null : breakEndOnDate + (breakNextDay ? DAY_MS : 0);
  const rangeInvalid = startInstant == null || endInstant == null || endInstant <= startInstant;
  const breakInvalid = withBreak && (
    breakStartInstant == null || breakEndInstant == null || breakEndInstant <= breakStartInstant ||
    startInstant == null || endInstant == null || breakStartInstant < startInstant || breakEndInstant > endInstant
  );
  const grossSeconds = rangeInvalid ? 0 : Math.floor((endInstant! - startInstant!) / 1000);
  const breakSeconds = breakInvalid || !withBreak
    ? 0
    : Math.floor((breakEndInstant! - breakStartInstant!) / 1000);
  const netSeconds = Math.max(0, grossSeconds - breakSeconds);

  useEffect(() => {
    let alive = true;
    void resolveRoundingRuleForEntry({ projectId: projectId || null, customerId: customerId || null })
      .then((rule) => { if (alive) setPreview(roundingPreview(netSeconds, rule)); });
    return () => { alive = false; };
  }, [projectId, customerId, netSeconds]);

  const rounding = presentRounding(preview);
  const selectedProject = (allProjects.data ?? []).find((project) => project.id === projectId);
  const descriptionMissing = Boolean(selectedProject?.description_required && !description.trim());

  function changeStart(nextStart: string) {
    const adjusted = adjustRangeForStartChange(start, end, nextStart, endsNextDay);
    setStart(adjusted.start);
    if (adjusted.end !== end) setEnd(adjusted.end);
    if (adjusted.endsNextDay !== endsNextDay) setEndsNextDay(adjusted.endsNextDay);
  }

  function changeTask(nextTaskId: string) {
    setTaskId(nextTaskId);
    const nextTask = (tasks.data ?? []).find((task) => task.id === nextTaskId);
    if (nextTask) setBillable(nextTask.default_billable);
  }

  function resetForm(returnToProject = false) {
    const contextProject = projectHistoryFilter
      ? (allProjects.data ?? []).find((project) => project.id === projectHistoryFilter)
      : null;
    setEditingId(null);
    setCustomerId(contextProject?.customer_id ?? "");
    setProjectId(contextProject?.id ?? "");
    setTaskId("");
    setDate(toDateInputValue(Date.now(), tz));
    setStart("09:00");
    setEnd("10:00");
    setEndsNextDay(false);
    setTimezone(tz || deviceTimezone());
    setDescription("");
    setReason("forgot_to_start");
    setBillable(true);
    setWithBreak(false);
    setBreakStart("12:00");
    setBreakEnd("12:30");
    setBreakNextDay(false);
    setError(null);
    if (returnToProject && returnProjectId) window.location.hash = `#/projects/${returnProjectId}`;
    else if (routeTarget) window.location.hash = "#/backdating";
  }

  async function editEntry(entry: TimeEntry) {
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      const zone = entry.timezone || tz;
      const storedBreaks = await entries.breaks(entry.id);
      setEditingId(entry.id);
      setCustomerId(entry.customer_id ?? "");
      setProjectId(entry.project_id ?? "");
      setTaskId(entry.task_id ?? "");
      setTimezone(zone);
      setDate(toDateInputValue(entry.actual_started_at, zone));
      setStart(toTimeInputValue(entry.actual_started_at, zone));
      setEnd(toTimeInputValue(entry.actual_ended_at ?? entry.actual_started_at, zone));
      setEndsNextDay(
        toDateInputValue(entry.actual_started_at, zone) !==
        toDateInputValue(entry.actual_ended_at ?? entry.actual_started_at, zone)
      );
      setDescription(entry.description ?? "");
      setReason(entry.backdate_reason ?? "correction");
      setBillable(entry.is_billable ?? true);
      const storedBreak = storedBreaks[0];
      if (storedBreak?.ended_at != null) {
        setWithBreak(true);
        setBreakStart(toTimeInputValue(storedBreak.started_at, zone));
        setBreakEnd(toTimeInputValue(storedBreak.ended_at, zone));
        setBreakNextDay(
          toDateInputValue(entry.actual_started_at, zone) !== toDateInputValue(storedBreak.started_at, zone)
        );
      } else if ((entry.break_duration_seconds ?? 0) > 0 && entry.actual_ended_at != null) {
        // Older backdates stored only a duration. Place it centrally so the
        // user can confirm or correct the exact span during the first edit.
        const durationMs = (entry.break_duration_seconds ?? 0) * 1000;
        const centralStart = entry.actual_started_at + Math.max(0, ((entry.actual_ended_at - entry.actual_started_at) - durationMs) / 2);
        setWithBreak(true);
        setBreakStart(toTimeInputValue(centralStart, zone));
        setBreakEnd(toTimeInputValue(centralStart + durationMs, zone));
        setBreakNextDay(toDateInputValue(entry.actual_started_at, zone) !== toDateInputValue(centralStart, zone));
      } else {
        setWithBreak(false);
      }
      window.requestAnimationFrame(() => document.getElementById("backdating-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!routeTarget || routeOpenStarted.current || editingId || !(backdated.data ?? []).length) return;
    const requested = (backdated.data ?? []).find((entry) => entry.id === routeTarget);
    if (requested) {
      routeOpenStarted.current = true;
      void editEntry(requested);
    }
  }, [backdated.data, editingId, routeTarget]);

  async function submit() {
    setError(null);
    setOkMsg(null);
    if (rangeInvalid) { setError(t("Die Endzeit muss nach der Startzeit liegen.")); return; }
    if (breakInvalid) { setError(t("Die Pause muss vollständig innerhalb des Arbeitszeitraums liegen.")); return; }
    if (descriptionMissing) { setError(t("Für dieses Projekt ist eine Beschreibung erforderlich.")); return; }
    const breaks = withBreak ? [{ started_at: breakStartInstant!, ended_at: breakEndInstant! }] : [];
    const input: BackdateEntryInput = {
      customer_id: customerId || null,
      project_id: projectId || null,
      task_id: taskId || null,
      started_at: startInstant!,
      ended_at: endInstant!,
      timezone,
      description: description.trim() || null,
      reason,
      breaks,
      is_billable: billable,
    };
    setBusy(true);
    try {
      if (editingId) await entries.updateBackdated({ ...input, id: editingId });
      else await entries.create(input);
      setOkMsg(editingId ? t("Nachtrag aktualisiert.") : t("Nachtrag gespeichert."));
      if (editingId && returnProjectId) {
        window.location.hash = `#/projects/${returnProjectId}`;
        return;
      }
      resetForm();
      backdated.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function applyBulkEdit() {
    const selected = (backdated.data ?? []).filter((entry) => selectedIds.has(entry.id));
    if (!selected.length) return;
    setBusy(true); setError(null); setOkMsg(null);
    try {
      for (const entry of selected) {
        const storedBreaks = await entries.breaks(entry.id);
        const targetProject = bulkProjectId === "__unchanged__" ? undefined : (allProjects.data ?? []).find((project) => project.id === bulkProjectId);
        await entries.updateBackdated({
          id: entry.id,
          customer_id: bulkProjectId === "__unchanged__" ? entry.customer_id ?? null : targetProject?.customer_id ?? null,
          project_id: bulkProjectId === "__unchanged__" ? entry.project_id ?? null : bulkProjectId || null,
          task_id: bulkTaskId === "__unchanged__" ? entry.task_id ?? null : bulkTaskId || null,
          started_at: entry.actual_started_at, ended_at: entry.actual_ended_at ?? entry.actual_started_at, timezone: entry.timezone || tz,
          description: entry.description ?? null, reason: bulkReason || entry.backdate_reason || "correction",
          breaks: storedBreaks.filter((item) => item.ended_at != null).map((item) => ({ started_at: item.started_at, ended_at: item.ended_at! })),
          is_billable: bulkBillable === "unchanged" ? (entry.is_billable ?? true) : bulkBillable === "billable",
        });
      }
      setOkMsg(t("{n} Nachträge aktualisiert.", { n: selected.length })); setSelectedIds(new Set()); setBulkOpen(false); setBulkProjectId("__unchanged__"); setBulkTaskId("__unchanged__"); setBulkReason(""); setBulkBillable("unchanged"); backdated.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  const summaryPanel = (
    <div className="backdating-summary" aria-label={t("Zeitvorschau")}>
      <Card title={t("Vorschau")} subtitle={t("So wird der Eintrag gespeichert")}>
        <div className="backdating-summary__hero">
          <span>{t("Nettoarbeitszeit")}</span>
          <strong className="num">{fmtHM(netSeconds)}</strong>
          <small>{breakSeconds ? t("{gross} Zeitraum − {pause} Pause", { gross: fmtHM(grossSeconds), pause: fmtHM(breakSeconds) }) : t("{gross} Zeitraum", { gross: fmtHM(grossSeconds) })}</small>
        </div>
        <dl className="backdating-summary__facts">
          <div><dt>{t("Abrechnung")}</dt><dd className="num">{preview ? fmtHM(preview.billing_duration_seconds) : "—"}</dd></div>
          <div><dt>{t("Rundung")}</dt><dd><strong>{rounding.label}</strong><span>{rounding.detail}</span></dd></div>
          <div><dt>{t("Status")}</dt><dd><Tag tone={billable ? "accent" : "muted"}>{t(billable ? "Abrechenbar" : "Intern")}</Tag></dd></div>
        </dl>
        <div className="backdating-summary__actions">
          <Button className="backdating-summary__save" variant="primary" disabled={busy || rangeInvalid || breakInvalid || descriptionMissing} onClick={() => void submit()}>
            <ReceiptText size={15} />{editingId ? t("Änderungen speichern") : t("Nachtrag speichern")}
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <Page
      className="page--wide"
      title={returnProjectId ? t("Nachtrag bearbeiten") : t("Nachträge")}
      hint={returnProjectId ? t("Korrektur im Kontext des ausgewählten Projekts") : t("Vergangene Arbeit erfassen und letzte Einträge schnell korrigieren")}
      actions={returnProjectId ? <Button variant="ghost" onClick={() => resetForm(true)}><ArrowLeft size={15}/>{t("Zurück zum Projekt")}</Button> : undefined}
    >
      {error ? <ErrorNote error={error} /> : null}
      {okMsg ? <div className="notice notice--info" role="status">{okMsg}</div> : null}

      <div className="backdating-desktop-layout">
        {summaryPanel}
        <section id="backdating-editor">
          <Card
            title={editingId ? t("Nachtrag bearbeiten") : t("Arbeit nachtragen")}
            subtitle={editingId ? t("Änderungen werden im Audit-Verlauf dokumentiert") : t("Projekt, Zeitraum und Ergebnis festhalten")}
            actions={editingId ? <Button variant="ghost" onClick={() => resetForm(Boolean(returnProjectId))}>{t("Bearbeitung abbrechen")}</Button> : undefined}
          >
            <div className="backdating-form">
              <section className="backdating-section" aria-labelledby="backdating-assignment">
                <div className="backdating-section__head">
                  <span className="backdating-section__number">1</span>
                  <div><h3 id="backdating-assignment">{t("Zuordnung")}</h3><p>{t("Wem und welchem Projekt gehört die Zeit?")}</p></div>
                </div>
                <FormRow>
                  <Field label={t("Kunde")}>
                    <Select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setProjectId(""); setTaskId(""); }}>
                      <option value="">{t("Intern / ohne Kunde")}</option>
                      {(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("Projekt")}>
                    <Select value={projectId} onChange={(event) => {
                      const nextProjectId = event.target.value;
                      setProjectId(nextProjectId);
                      setTaskId("");
                      if (!nextProjectId) return;
                      const nextProject = (allProjects.data ?? []).find((project) => project.id === nextProjectId)
                        ?? (projects.data ?? []).find((project) => project.id === nextProjectId);
                      if (nextProject) setCustomerId(nextProject.customer_id ?? "");
                    }}>
                      <option value="">{t("Ohne Projekt")}</option>
                      {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("Teilprojekt / Aufgabe")} hint={t("Ordnet die Zeit einem separat auswertbaren Leistungsabschnitt zu")}>
                    <Select value={taskId} onChange={(event) => changeTask(event.target.value)} disabled={!(tasks.data ?? []).some((task) => task.status === "active" || task.id === taskId)}>
                      <option value="">{t("Ohne Teilprojekt")}</option>
                      {(tasks.data ?? []).filter((task) => task.status === "active" || task.id === taskId).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
                    </Select>
                  </Field>
                </FormRow>
              </section>

              <section className="backdating-section" aria-labelledby="backdating-period">
                <div className="backdating-section__head">
                  <span className="backdating-section__number">2</span>
                  <div><h3 id="backdating-period">{t("Zeitraum")}</h3><p>{t("Native Datums- und Zeitauswahl | {timezone}", { timezone })}</p></div>
                </div>
                <div className="backdating-time-grid">
                  <Field label={<span className="field-label-with-icon"><CalendarDays size={14} />{t("Datum")}</span>} required>
                    <TextInput className="temporal-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                  </Field>
                  <Field label={<span className="field-label-with-icon"><Clock3 size={14} />{t("Start")}</span>} required>
                    <TextInput className="temporal-input" type="time" value={start} onChange={(event) => changeStart(event.target.value)} />
                  </Field>
                  <Field label={<span className="field-label-with-icon"><Clock3 size={14} />{t("Ende")}</span>} required error={rangeInvalid ? t("nach Start") : undefined}>
                    <TextInput className="temporal-input" type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
                  </Field>
                </div>
                <div className="backdating-next-day">
                  <Checkbox label={t("Ende liegt am Folgetag")} checked={endsNextDay} onChange={(event) => setEndsNextDay(event.currentTarget.checked)} />
                </div>
              </section>

              <section className="backdating-section" aria-labelledby="backdating-work">
                <div className="backdating-section__head">
                  <span className="backdating-section__number">3</span>
                  <div><h3 id="backdating-work">{t("Arbeit")}</h3><p>{t("Was wurde erledigt und warum wird es nachgetragen?")}</p></div>
                </div>
                <Field label={t("Beschreibung")} required={selectedProject?.description_required} error={descriptionMissing ? t("Für dieses Projekt erforderlich") : undefined}>
                  <TextArea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("Ergebnis oder erledigte Arbeit beschreiben")} rows={3} />
                </Field>
                <FormRow>
                  <Field label={t("Grund")} required>
                    <Select value={reason} onChange={(event) => setReason(event.target.value)}>
                      {backdateReasonEnum.options.map((key) => <option key={key} value={key}>{t(BACKDATE_REASONS[key] ?? key)}</option>)}
                    </Select>
                  </Field>
                  <Field label={t("Abrechnung")}>
                    <div className="backdating-billable-control">
                      <Checkbox label={t("Zeit ist abrechenbar")} checked={billable} onChange={(event) => setBillable(event.currentTarget.checked)} />
                    </div>
                  </Field>
                </FormRow>
              </section>

              <section className="backdating-section" aria-labelledby="backdating-break">
                <div className="backdating-section__head">
                  <span className="backdating-section__number"><Coffee size={14} /></span>
                  <div><h3 id="backdating-break">{t("Pause")}</h3><p>{t("Nur angeben, wenn sie von der Arbeitszeit abgezogen werden soll.")}</p></div>
                </div>
                <Checkbox label={t("Pause abziehen")} checked={withBreak} onChange={(event) => setWithBreak(event.currentTarget.checked)} />
                {withBreak ? (
                  <div className="backdating-break-grid">
                    <Field label={t("Pausenbeginn")}><TextInput className="temporal-input" type="time" value={breakStart} onChange={(event) => setBreakStart(event.target.value)} /></Field>
                    <Field label={t("Pausenende")} error={breakInvalid ? t("außerhalb des Zeitraums") : undefined}><TextInput className="temporal-input" type="time" value={breakEnd} onChange={(event) => setBreakEnd(event.target.value)} /></Field>
                    {endsNextDay ? <Checkbox label={t("Pause am Folgetag")} checked={breakNextDay} onChange={(event) => setBreakNextDay(event.currentTarget.checked)} /> : null}
                  </div>
                ) : null}
              </section>
            </div>
          </Card>
        </section>

        <aside className="backdating-side-column" aria-label={t("Letzte Nachträge")}>
          <Card
            title={projectHistoryFilter ? t("Nachträge im Projekt") : historyExpanded ? t("Alle Nachträge") : t("Zuletzt nachgetragen")}
            subtitle={historyExpanded ? t("Auswählen und gemeinsam bearbeiten") : t("Die fünf letzten Einträge schnell korrigieren")}
            actions={<div className="bulk-actions">
              {historyExpanded && selectedIds.size ? <><span>{t("{n} ausgewählt", { n: selectedIds.size })}</span><Button variant="ghost" className="btn--sm" onClick={() => setSelectedIds(new Set())}><X size={14}/>{t("Auswahl aufheben")}</Button><Button variant="primary" className="btn--sm" onClick={() => setBulkOpen((value) => !value)}><CheckSquare2 size={14}/>{t("Mehrfach bearbeiten")}</Button></> : null}
              <Button variant="ghost" className="btn--sm" onClick={() => { setHistoryExpanded((value) => !value); setSelectedIds(new Set()); setBulkOpen(false); }}><ListFilter size={14}/>{historyExpanded ? t("Nur letzte fünf") : t("Alle anzeigen")}</Button>
            </div>}
          >
        {bulkOpen ? <section className="bulk-editor" aria-label={t("Mehrfachbearbeitung")}><div className="bulk-editor__intro"><strong>{t("Gemeinsame Änderungen")}</strong><span>{t("Nicht ausgewählte Felder bleiben unverändert.")}</span></div><Field label={t("Projekt")}><Select value={bulkProjectId} onChange={(event) => { setBulkProjectId(event.target.value); if (event.target.value !== "__unchanged__") setBulkTaskId(""); }}><option value="__unchanged__">{t("Unverändert")}</option><option value="">{t("Ohne Projekt")}</option>{(allProjects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></Field><Field label={t("Teilprojekt / Aufgabe")}><Select value={bulkTaskId} onChange={(event) => setBulkTaskId(event.target.value)}><option value="__unchanged__">{t("Unverändert")}</option><option value="">{t("Ohne Teilprojekt")}</option>{(allTasks.data ?? []).filter((task) => bulkProjectId === "__unchanged__" || !bulkProjectId || task.project_id === bulkProjectId).map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}</Select></Field><Field label={t("Nachtragsgrund")}><Select value={bulkReason} onChange={(event) => setBulkReason(event.target.value)}><option value="">{t("Unverändert")}</option>{backdateReasonEnum.options.map((key) => <option key={key} value={key}>{t(BACKDATE_REASONS[key] ?? key)}</option>)}</Select></Field><Field label={t("Abrechnung")}><Select value={bulkBillable} onChange={(event) => setBulkBillable(event.target.value)}><option value="unchanged">{t("Unverändert")}</option><option value="billable">{t("Abrechenbar")}</option><option value="internal">{t("Nicht abrechenbar")}</option></Select></Field><Button variant="primary" disabled={busy || (bulkProjectId === "__unchanged__" && bulkTaskId === "__unchanged__" && !bulkReason && bulkBillable === "unchanged")} onClick={() => void applyBulkEdit()}>{t("Auf {n} Einträge anwenden", { n: selectedIds.size })}</Button></section> : null}
        <AsyncBody state={{ data: projectHistoryRows, error: backdated.error, loading: backdated.loading }} empty={<EmptyState title={t("Noch keine Nachträge")} />}>
          {() => (
            <div className={`backdating-history ${historyExpanded ? "is-managing" : "is-recent"}`}>
              {historyExpanded ? <label className="backdating-select-all"><input type="checkbox" checked={visibleHistoryRows.length > 0 && visibleHistoryRows.every((entry) => selectedIds.has(entry.id))} onChange={(event) => setSelectedIds(event.currentTarget.checked ? new Set(visibleHistoryRows.map((entry) => entry.id)) : new Set())}/><span>{t("Alle angezeigten Nachträge auswählen")}</span></label> : null}
              {visibleHistoryRows.map((entry) => (
                <article className={`backdating-history-row ${editingId === entry.id ? "is-selected" : ""} ${selectedIds.has(entry.id) ? "is-bulk-selected" : ""}`} key={entry.id}>
                  {historyExpanded ? <input className="backdating-history-row__check" type="checkbox" aria-label={t("Nachtrag vom {date} auswählen", { date: fmtDate(entry.actual_started_at, entry.timezone || tz) })} checked={selectedIds.has(entry.id)} onChange={() => toggleSelected(entry.id)}/> : null}
                  <div className="backdating-history-row__date">
                    <strong className="num">{fmtDate(entry.actual_started_at, entry.timezone || tz)}</strong>
                    <span className="num">{fmtClock(entry.actual_started_at, entry.timezone || tz)},{fmtClock(entry.actual_ended_at ?? entry.actual_started_at, entry.timezone || tz)}</span>
                  </div>
                  <div className="backdating-history-row__work">
                    <strong>{entry.description || taskNames.get(entry.task_id ?? "") || t("Ohne Beschreibung")}</strong>
                    <span>{entry.project_id ? projectNames.get(entry.project_id) ?? t("Unbekanntes Projekt") : t("Intern")}{entry.customer_id ? ` | ${customerNames.get(entry.customer_id) ?? t("Kunde")}` : ""}</span>
                  </div>
                  <Tag tone="muted">{t(BACKDATE_REASONS[entry.backdate_reason ?? ""] ?? "Nachtrag")}</Tag>
                  <div className="backdating-history-row__duration"><strong className="num">{fmtHM(entry.net_work_duration_seconds ?? 0)}</strong><span>{t(entry.is_billable ? "abrechenbar" : "intern")}</span></div>
                  <Button variant="ghost" className="btn--sm" disabled={busy} onClick={() => void editEntry(entry)}><Pencil size={14} />{t("Bearbeiten")}</Button>
                </article>
              ))}
              {!historyExpanded && projectHistoryRows.length > visibleHistoryRows.length ? <div className="backdating-history__more">{t("Noch {n} ältere Nachträge", { n: projectHistoryRows.length - visibleHistoryRows.length })}</div> : null}
            </div>
          )}
        </AsyncBody>
          </Card>
        </aside>
      </div>
    </Page>
  );
}
