import { useState } from "react";
import { ArrowLeft, BarChart3, BookOpenCheck, FileDown, Layers3, Pencil, Plus, ReceiptText, Sparkles } from "lucide-react";
import { Page, Card, StatGrid, StatTile, AsyncBody, EmptyState, Tag, Button, Field, TextArea, TextInput, Select, Checkbox, ErrorNote } from "../components/ui";
import { useAsync } from "../data/hooks";
import { projects, entries, type TimeEntry } from "../data/repositories";
import { getCustomer, listCustomers } from "../data/customers";
import { updateProject } from "../data/projects";
import { createTask, listTasks, updateTask, type TaskRow } from "../data/tasks";
import { sumAmountCents, sumBillableSeconds, sumNet } from "../data/aggregates";
import { activitiesByDescription, activitiesByTask, activeDayCount, effectiveFixedHourlyCents } from "../data/projectAnalytics";
import { fmtClock, fmtDate, fmtHM, fmtMoney } from "../data/format";
import { useTimezone, nameMap } from "./shared";
import { renderProjectTimesheetPdf } from "../data/projectTimesheetPdf";
import { saveExportFile } from "../lib/bridge";
import { t } from "../i18n";
import { ProjectEditor } from "./EntityEditors";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const BILLING_LABELS: Record<string, string> = {
  hourly: "Stundensatz",
  day_rate: "Tagessatz",
  fixed_fee: "Festpreis",
  retainer: "Retainer",
  non_billable: "Nicht abrechenbar",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "Geplant",
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

function toCents(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [partEditorOpen, setPartEditorOpen] = useState(false);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [partName, setPartName] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [partRate, setPartRate] = useState("");
  const [partBillable, setPartBillable] = useState(true);
  const [partCompleted, setPartCompleted] = useState(false);
  const [partBusy, setPartBusy] = useState(false);
  const [partError, setPartError] = useState<string | null>(null);
  const [customerEditOpen, setCustomerEditOpen] = useState(false);
  const [customerEditValue, setCustomerEditValue] = useState("");
  const [customerEditBusy, setCustomerEditBusy] = useState(false);
  const [customerEditError, setCustomerEditError] = useState<string | null>(null);
  const [projectEditorOpen, setProjectEditorOpen] = useState(false);
  const tz = useTimezone();
  const project = useAsync(() => projects.byId(projectId), [projectId]);
  const projectEntries = useAsync(() => entries.forProject(projectId), [projectId]);
  const taskList = useAsync(() => listTasks(projectId), [projectId]);
  const customer = useAsync(
    async () => project.data?.customer_id ? getCustomer(project.data.customer_id) : null,
    [project.data?.customer_id],
  );
  const allCustomers = useAsync(() => listCustomers(), []);

  function openCustomerEdit() {
    setCustomerEditValue(project.data?.customer_id ?? "");
    setCustomerEditError(null);
    setCustomerEditOpen(true);
  }

  async function saveCustomer() {
    setCustomerEditBusy(true);
    setCustomerEditError(null);
    try {
      await updateProject(projectId, { customer_id: customerEditValue || null });
      setCustomerEditOpen(false);
      project.reload();
    } catch (caught) {
      setCustomerEditError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setCustomerEditBusy(false);
    }
  }

  const rows = projectEntries.data ?? [];
  const taskNames = nameMap(taskList.data ?? []);
  const selectedPart = (taskList.data ?? []).find((task) => task.id === selectedPartId) ?? null;
  const scopedRows = selectedPartId === "__unassigned__"
    ? rows.filter((entry) => !entry.task_id)
    : selectedPartId
      ? rows.filter((entry) => entry.task_id === selectedPartId)
      : rows;
  const scopeName = selectedPart?.name ?? (selectedPartId === "__unassigned__" ? t("Ohne Teilprojekt") : null);
  const net = sumNet(scopedRows);
  const billable = sumBillableSeconds(scopedRows);
  const amount = sumAmountCents(scopedRows);
  const projectValue = !selectedPartId && project.data?.billing_type === "fixed_fee" ? project.data.fixed_fee_cents ?? 0 : amount;
  const fixedHourlyValue = !selectedPartId && project.data?.billing_type === "fixed_fee"
    ? effectiveFixedHourlyCents(project.data.fixed_fee_cents, net)
    : null;
  const days = activeDayCount(scopedRows, tz);
  const taskRanking = activitiesByTask(scopedRows, taskNames).slice(0, 5);
  const workRanking = activitiesByDescription(scopedRows).slice(0, 5);

  function resetPartEditor() {
    setPartEditorOpen(false);
    setEditingPartId(null);
    setPartName("");
    setPartDescription("");
    setPartRate("");
    setPartBillable(true);
    setPartCompleted(false);
    setPartError(null);
  }

  function newPart() {
    resetPartEditor();
    setPartEditorOpen(true);
  }

  function editPart(part: TaskRow) {
    setEditingPartId(part.id);
    setPartName(part.name);
    setPartDescription(part.description ?? "");
    setPartRate(part.default_hourly_rate_cents != null ? (part.default_hourly_rate_cents / 100).toFixed(2).replace(".", ",") : "");
    setPartBillable(part.default_billable);
    setPartCompleted(part.status === "archived");
    setPartError(null);
    setPartEditorOpen(true);
  }

  async function savePart() {
    if (!partName.trim()) { setPartError(t("Bitte einen Namen für das Teilprojekt angeben.")); return; }
    const rateCents = partRate ? toCents(partRate) : null;
    if (partRate && (rateCents == null || rateCents < 0)) { setPartError(t("Bitte einen gültigen Stundensatz angeben.")); return; }
    setPartBusy(true); setPartError(null);
    const payload = {
      project_id: projectId,
      name: partName.trim(),
      description: partDescription.trim() || null,
      default_billable: partBillable,
      default_hourly_rate_cents: rateCents,
      status: partCompleted ? "archived" as const : "active" as const,
    };
    try {
      if (editingPartId) await updateTask(editingPartId, payload);
      else await createTask({ ...payload, sort_order: (taskList.data?.length ?? 0) + 1 });
      resetPartEditor();
      taskList.reload();
    } catch (caught) { setPartError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setPartBusy(false); }
  }

  async function exportPdf() {
    if (!project.data) return;
    setExporting(true); setExportMessage(null);
    try {
      const exportProject = scopeName
        ? { ...project.data, name: `${project.data.name} - ${scopeName}`, fixed_fee_cents: null }
        : project.data;
      const bytes = await renderProjectTimesheetPdf({ project: exportProject, customer: customer.data ?? null, entries: scopedRows, timezone: tz });
      const scopeSuffix = scopeName ? `-${scopeName}` : "";
      const path = await saveExportFile(`Projekt-${project.data.project_code || project.data.name}${scopeSuffix}-Stundennachweis.pdf`, bytes);
      setExportMessage(t("PDF gespeichert: {path}", { path }));
    } catch (caught) { setExportMessage(t("PDF konnte nicht erstellt werden: {error}", { error: caught instanceof Error ? caught.message : String(caught) })); }
    finally { setExporting(false); }
  }

  return (
    <Page
      className="project-detail"
      title={project.data?.name ?? t("Projektdetails")}
      hint={scopeName ? t("{name} | Teilprojekt", { name: scopeName }) : project.data?.project_code ? t("Projekt {code}", { code: project.data.project_code }) : customer.data?.name ?? t("Projektübersicht")}
      actions={<><Button variant="ghost" onClick={() => { if (selectedPartId) setSelectedPartId(null); else window.location.hash = "#/projects"; }}><ArrowLeft size={15} />{selectedPartId ? t("Gesamtprojekt") : t("Alle Projekte")}</Button>{!selectedPartId ? <Button variant="ghost" onClick={() => setProjectEditorOpen((current) => !current)}><Pencil size={15} />{projectEditorOpen ? t("Bearbeitung schließen") : t("Projekt bearbeiten")}</Button> : null}{selectedPartId !== "__unassigned__" ? <Button variant="ghost" onClick={() => { window.location.hash = selectedPart ? `#/projects/${encodeURIComponent(projectId)}/workspace/task/${encodeURIComponent(selectedPart.id)}` : `#/projects/${encodeURIComponent(projectId)}/workspace`; }}><BookOpenCheck size={15}/>{t("Briefing & Dokumente")}</Button> : null}<Button variant="primary" disabled={exporting || !scopedRows.length} onClick={() => void exportPdf()}><FileDown size={15}/>{exporting ? t("PDF wird erstellt …") : scopeName ? t("Teilprojekt als PDF") : t("Stundennachweis als PDF")}</Button></>}
    >
      <AsyncBody
        state={{ data: project.data, error: project.error, loading: project.loading }}
        empty={<EmptyState title={t("Projekt nicht gefunden")} />}
      >
        {(current) => (
          <>
            {exportMessage ? <div className="notice notice--info" role="status">{exportMessage}</div> : null}
            {projectEditorOpen ? (
              <Card title={t("Projekt bearbeiten")} subtitle={t("Stammdaten, Abrechnung und Pflichtfelder direkt im Projekt aktualisieren")}>
                <ProjectEditor
                  key={current.id}
                  project={current}
                  customers={allCustomers.data ?? []}
                  onSaved={() => { setProjectEditorOpen(false); project.reload(); }}
                  onCancel={() => setProjectEditorOpen(false)}
                />
              </Card>
            ) : null}
            <section className="detail-hero">
              <div className="detail-hero__identity">
                <span className="detail-hero__icon">{selectedPartId ? <Layers3 size={22} /> : <BarChart3 size={22} />}</span>
                <div>
                  {scopeName ? (
                    <span className="detail-eyebrow">{t("Teilprojekt von {name}", { name: current.name })}</span>
                  ) : customerEditOpen ? (
                    <div className="detail-eyebrow-edit">
                      {customerEditError ? <ErrorNote error={customerEditError} /> : null}
                      <Select value={customerEditValue} onChange={(event) => setCustomerEditValue(event.currentTarget.value)} autoFocus>
                        <option value="">{t("Kein Kunde | intern")}</option>
                        {(allCustomers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                      <Button variant="primary" className="btn--sm" disabled={customerEditBusy} onClick={() => void saveCustomer()}>{t("Speichern")}</Button>
                      <Button variant="ghost" className="btn--sm" onClick={() => setCustomerEditOpen(false)}>{t("Abbrechen")}</Button>
                    </div>
                  ) : (
                    <span className="detail-eyebrow detail-eyebrow--editable" onClick={openCustomerEdit}>
                      {customer.data?.name ?? t("Internes Projekt")}
                      <button type="button" className="detail-eyebrow__edit" onClick={openCustomerEdit} title={t("Kunde ändern")} aria-label={t("Kunde ändern")}><Pencil size={12}/></button>
                    </span>
                  )}
                  <p>{selectedPart?.description || (selectedPartId === "__unassigned__" ? t("Zeiten, die noch keinem Teilprojekt zugeordnet wurden.") : current.description || t("Alle erfassten Zeiten, Tätigkeiten und Abrechnungswerte dieses Projekts."))}</p>
                </div>
              </div>
              <div className="detail-hero__meta">
                <Tag tone={selectedPartId === "__unassigned__" ? "muted" : (selectedPart?.status ?? current.status) === "active" ? "accent" : "muted"}>{selectedPartId === "__unassigned__" ? t("Nicht zugeordnet") : t(STATUS_LABELS[selectedPart?.status ?? current.status] ?? selectedPart?.status ?? current.status)}</Tag>
                <span>{selectedPartId === "__unassigned__" ? t("Projektsatz") : selectedPart ? (selectedPart.default_hourly_rate_cents != null ? t("{amount} / Std.", { amount: fmtMoney(selectedPart.default_hourly_rate_cents) }) : t("Projektsatz")) : t(BILLING_LABELS[current.billing_type] ?? current.billing_type)}</span>
                {selectedPart ? <Button variant="ghost" className="btn--sm" onClick={() => { setSelectedPartId(null); editPart(selectedPart); }}><Pencil size={14}/>{t("Teilprojekt bearbeiten")}</Button> : null}
              </div>
            </section>

            <StatGrid>
              <StatTile label={t("Arbeitszeit")} value={fmtHM(net)} sub={t("{n} Einträge", { n: scopedRows.length })} accent />
              <StatTile label={t("Abrechenbar")} value={fmtHM(billable)} sub={net ? t("{pct} % der Zeit", { pct: Math.round((billable / net) * 100) }) : t("Noch keine Zeit")} />
              <StatTile label={t("Aktive Tage")} value={String(days)} sub={days ? t("Ø {avg} pro Tag", { avg: fmtHM(Math.round(net / days)) }) : t("Noch keine Aktivität")} />
              <StatTile label={t("Wert")} value={fmtMoney(projectValue)} sub={!selectedPartId && current.billing_type === "fixed_fee" ? <>{fixedHourlyValue != null ? t("Ø {amount} pro Stunde", { amount: fmtMoney(fixedHourlyValue) }) : t("Ø Stundenwert nach erster Zeiterfassung")}<span className="stat__detail">{t("vereinbarter Festpreis")}</span></> : t("aus gespeicherten Sätzen")} />
            </StatGrid>

            {!selectedPartId ? (
              <Card
                title={t("Teilprojekte & Leistungen")}
                subtitle={t("Leistungsabschnitte getrennt erfassen, auswerten und später als eigene Rechnungsposition verwenden")}
                actions={<Button variant="primary" onClick={partEditorOpen ? resetPartEditor : newPart}>{partEditorOpen ? t("Schließen") : <><Plus size={15}/>{t("Teilprojekt hinzufügen")}</>}</Button>}
              >
                {partEditorOpen ? (
                  <div className="project-part-editor">
                    {partError ? <ErrorNote error={partError} /> : null}
                    <Field label={t("Name des Teilprojekts")} required hint={t("Dieser Name erscheint beim Timer, in Reports und auf dem Stundennachweis.")}><TextInput value={partName} onChange={(event) => setPartName(event.target.value)} placeholder={t("z. B. Erweiterung der Website")} autoFocus /></Field>
                    <Field label={t("Beschreibung des Teilprojekts")}><TextArea value={partDescription} onChange={(event) => setPartDescription(event.target.value)} placeholder={t("Welche Leistung gehört zu diesem Abschnitt?")} /></Field>
                    <div className="project-part-editor__rate"><Field label={t("Eigener Stundensatz (€)")} hint={t("Leer lassen, um den Projektsatz zu verwenden")}><TextInput inputMode="decimal" value={partRate} onChange={(event) => setPartRate(event.target.value)} placeholder={t("Projektsatz übernehmen")} /></Field></div>
                    <Checkbox label={t("Zeiten dieses Teilprojekts standardmäßig als abrechenbar behandeln")} checked={partBillable} onChange={(event) => setPartBillable(event.currentTarget.checked)} />
                    {editingPartId ? <Checkbox label={t("Teilprojekt abgeschlossen, nicht mehr für neue Zeiterfassungen anbieten")} checked={partCompleted} onChange={(event) => setPartCompleted(event.currentTarget.checked)} /> : null}
                    <div className="cluster"><Button variant="primary" disabled={partBusy} onClick={() => void savePart()}>{editingPartId ? t("Änderungen speichern") : t("Teilprojekt anlegen")}</Button><Button variant="ghost" onClick={resetPartEditor}>{t("Abbrechen")}</Button></div>
                  </div>
                ) : null}

                {(taskList.data ?? []).length || rows.some((entry) => !entry.task_id) ? (
                  <div className="project-parts-grid">
                    {(taskList.data ?? []).map((part) => {
                      const partRows = rows.filter((entry) => entry.task_id === part.id);
                      const partNet = sumNet(partRows);
                      const partAmount = sumAmountCents(partRows);
                      const openBillable = partRows.filter((entry) => entry.is_billable && entry.status !== "invoiced").reduce((sum, entry) => sum + (entry.billing_duration_seconds ?? 0), 0);
                      const billedEntries = partRows.filter((entry) => entry.status === "invoiced").length;
                      return <article className="project-part-card" key={part.id}>
                        <div className="project-part-card__head"><span className="project-part-card__icon"><Layers3 size={17}/></span><div><strong>{part.name}</strong><span>{part.description || t("Eigener Leistungsabschnitt")}</span></div><Tag tone={openBillable ? "accent" : "muted"}>{openBillable ? t("Zur Abrechnung") : billedEntries ? t("Fakturiert") : t("Noch keine Zeit")}</Tag></div>
                        <div className="project-part-card__metrics"><div><span>{t("Arbeitszeit")}</span><strong className="num">{fmtHM(partNet)}</strong></div><div><span>{t("Wert")}</span><strong className="num">{fmtMoney(partAmount)}</strong></div><div><span>{t("Einträge")}</span><strong className="num">{partRows.length}</strong></div></div>
                        <div className="project-part-card__foot"><span>{part.default_hourly_rate_cents != null ? t("{amount} / Std.", { amount: fmtMoney(part.default_hourly_rate_cents) }) : t("Projektsatz")}</span><div><Button variant="ghost" className="btn--sm" onClick={() => editPart(part)}><Pencil size={14}/>{t("Name & Daten")}</Button><Button variant="ghost" className="btn--sm" onClick={() => { window.location.hash = `#/projects/${encodeURIComponent(projectId)}/workspace/task/${encodeURIComponent(part.id)}`; }}><BookOpenCheck size={14}/>{t("Briefing & Dokumente")}</Button><Button variant="ghost" className="btn--sm" onClick={() => setSelectedPartId(part.id)}>{t("Details ansehen")}</Button></div></div>
                      </article>;
                    })}
                    {rows.some((entry) => !entry.task_id) ? <UnassignedPartCard rows={rows.filter((entry) => !entry.task_id)} fixedPrice={current.billing_type === "fixed_fee"} onOpen={() => setSelectedPartId("__unassigned__")} /> : null}
                  </div>
                ) : <EmptyState title={t("Noch keine Teilprojekte")}><span>{t("Lege zuerst „Website erstellen“ an und ergänze später weitere Leistungen im selben Projekt.")}</span></EmptyState>}
              </Card>
            ) : null}

            <div className="detail-grid">
              <Card title={t("Meist ausgeführte Arbeit")} subtitle={t("Nach erfasster Dauer")}>
                <RankingList rows={workRanking} empty={t("Noch keine Beschreibungen vorhanden")} />
              </Card>
              <Card title={t("Leistungsverteilung")} subtitle={scopeName ? t("Zuordnung innerhalb dieses Teilprojekts") : t("Arbeitszeit nach Teilprojekt")}>
                <RankingList rows={taskRanking} empty={t("Noch keine Aufgaben zugeordnet")} />
              </Card>
            </div>

            <Card
              title={t("Detaillierter Stundennachweis")}
              subtitle={scopeName ? t("Nur Zeiten für „{name}“", { name: scopeName }) : t("Alle erfassten Zeiten dieses Projekts")}
              actions={<Button variant="ghost" className="btn--sm" onClick={() => { window.location.hash = `#/backdating?project=${projectId}`; }}><Pencil size={14}/>{t("Nachträge verwalten")}</Button>}
            >
              {scopedRows.length ? (
                <div className="project-hours-table"><div className="project-hours-table__head"><span>{t("Datum")}</span><span>{t("Zeit & Pause")}</span><span>{t("Tätigkeit")}</span><span>{t("Status")}</span><span>{t("Netto")}</span></div>{scopedRows.map((entry) => <article className="project-hours-row" key={entry.id}><div><strong className="num">{fmtDate(entry.actual_started_at, entry.timezone || tz)}</strong><span>{entry.is_backdated ? t("Nachtrag") : t("Timer")}</span></div><div><strong className="num">{fmtClock(entry.actual_started_at, entry.timezone || tz)},{fmtClock(entry.actual_ended_at ?? entry.actual_started_at, entry.timezone || tz)}</strong><span>{entry.break_duration_seconds ? t("{duration} Pause", { duration: fmtHM(entry.break_duration_seconds) }) : t("Keine Pause")}</span></div><div className="project-hours-row__work"><strong>{entry.description || taskNames.get(entry.task_id ?? "") || t("Ohne Beschreibung")}</strong><span>{taskNames.get(entry.task_id ?? "") || t("Ohne Teilprojekt")}</span></div><div className="project-hours-row__actions"><Tag tone={entry.is_billable ? "accent" : "muted"}>{entry.is_billable ? t("Abrechenbar") : t("Intern")}</Tag>{entry.is_backdated ? <Button variant="ghost" className="btn--sm" onClick={() => { window.location.hash = `#/backdating/${entry.id}?returnProject=${projectId}`; }}><Pencil size={13}/>{t("Bearbeiten")}</Button> : null}</div><div className="project-hours-row__total"><strong className="num">{fmtHM(entry.net_work_duration_seconds ?? 0)}</strong><span>{entry.billing_duration_seconds !== entry.net_work_duration_seconds ? t("{duration} gerundet", { duration: fmtHM(entry.billing_duration_seconds ?? 0) }) : t("ohne Rundung")}</span></div></article>)}</div>
              ) : <EmptyState title={t("Noch keine Zeiten")}><span>{t("Starte einen Timer oder erfasse einen Nachtrag für dieses Projekt.")}</span></EmptyState>}
            </Card>

            <div className="detail-facts">
              <span><ReceiptText size={15} />{current.description_required ? t("Beschreibung erforderlich") : t("Beschreibung optional")}</span>
              <span><Sparkles size={15} />{current.backdating_reason_required ? t("Nachtragsgrund erforderlich") : t("Nachträge erlaubt")}</span>
            </div>
          </>
        )}
      </AsyncBody>
    </Page>
  );
}

function RankingList({ rows, empty }: { rows: ReturnType<typeof activitiesByDescription>; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <ol className="ranking-list">
      {rows.map((row, index) => (
        <li key={row.key}>
          <span className="ranking-list__index num">{index + 1}</span>
          <div className="ranking-list__content">
            <div><strong>{row.label}</strong><span>{row.entries} {row.entries === 1 ? t("Eintrag") : t("Einträge")}</span></div>
            <span className="ranking-list__bar"><i style={{ width: `${Math.max(4, row.share * 100)}%` }} /></span>
          </div>
          <strong className="num">{fmtHM(row.seconds)}</strong>
        </li>
      ))}
    </ol>
  );
}

function UnassignedPartCard({ rows, fixedPrice, onOpen }: { rows: TimeEntry[]; fixedPrice: boolean; onOpen: () => void }) {
  return (
    <article className="project-part-card project-part-card--unassigned">
      <div className="project-part-card__head"><span className="project-part-card__icon"><Layers3 size={17}/></span><div><strong>{t("Ohne Teilprojekt")}</strong><span>{t("Bestehende Zeiten, die noch keinem Leistungsabschnitt zugeordnet sind")}</span></div><Tag tone="muted">{t("Zuordnen")}</Tag></div>
      <div className="project-part-card__metrics"><div><span>{t("Arbeitszeit")}</span><strong className="num">{fmtHM(sumNet(rows))}</strong></div><div><span>{fixedPrice ? t("Festpreis") : t("Wert")}</span><strong className="num">{fixedPrice ? t("Nicht aufgeteilt") : fmtMoney(sumAmountCents(rows))}</strong></div><div><span>{t("Einträge")}</span><strong className="num">{rows.length}</strong></div></div>
      <div className="project-part-card__foot"><span>{t("Gesamtprojekt")}</span><Button variant="ghost" className="btn--sm" onClick={onOpen}>{t("Details ansehen")}</Button></div>
    </article>
  );
}
