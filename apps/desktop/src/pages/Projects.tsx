/**
 * Projects, Projektliste + Anlageformular (doc 06 A.2). Über data/projects
 * (Bridge create + lokale Patches) und data/customers für die Zuordnung.
 */
import { useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Page, Card, Button, Select, AsyncBody, EmptyState, TableWrap, Tag,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { listProjects, archiveProject, restoreProject, deleteProject, type ProjectRow } from "../data/projects";
import { listCustomers } from "../data/customers";
import { fmtMoney } from "../data/format";
import { t } from "../i18n";
import type { ProjectInput } from "@tarlog/core";
import { nameMap } from "./shared";
import ProjectDetail from "./ProjectDetail";
import ProjectWorkspace from "./ProjectWorkspace";
import { ProjectEditor } from "./EntityEditors";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  planned: "Geplant",
  completed: "Abgeschlossen",
  archived: "Archiviert",
};

const BILLING: { value: ProjectInput["billing_type"]; label: string }[] = [
  { value: "hourly", label: "Stundensatz" },
  { value: "day_rate", label: "Tagessatz" },
  { value: "fixed_fee", label: "Festpreis" },
  { value: "retainer", label: "Retainer" },
  { value: "non_billable", label: "nicht abrechenbar" },
];

export default function Projects() {
  const hashParts = window.location.hash.split("/");
  const projectId = decodeURIComponent(hashParts[2] ?? "");
  if (projectId && hashParts[3] === "workspace") {
    const initialTaskId = hashParts[4] === "task" ? decodeURIComponent(hashParts[5] ?? "") : null;
    return <ProjectWorkspace projectId={projectId} initialTaskId={initialTaskId || null} />;
  }
  if (projectId) return <ProjectDetail projectId={projectId} />;

  return <ProjectsList />;
}

function ProjectsList() {
  const [status, setStatus] = useState("active");
  const list = useAsync(() => listProjects(status === "all" ? {} : { status }), [status]);
  const customers = useAsync(() => listCustomers(), []);
  const custNames = nameMap((customers.data ?? []) as { id: string; name: string }[]);

  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  // window.confirm ist in der Tauri-WebView nicht verfügbar (liefert sofort
  // false), daher zweistufige Inline-Bestätigung direkt in der Zeile.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function resetForm() {
    setOpen(false);
    setEditingProject(null);
  }
  function createNew() { resetForm(); setOpen(true); }
  function edit(project: ProjectRow) {
    setEditingProject(project);
    setOpen(true);
  }

  function projectActions(project: ProjectRow) {
    if (project.status !== "archived") {
      return (
        <>
          <Button variant="ghost" className="btn--sm" onClick={() => edit(project)}><Pencil size={14}/>{t("Bearbeiten")}</Button>
          <Button variant="ghost" className="btn--sm" onClick={() => void archiveProject(project.id).then(() => list.reload())}><Archive size={14}/>{t("Archivieren")}</Button>
        </>
      );
    }
    if (confirmDeleteId === project.id) {
      return (
        <>
          <Button
            variant="danger"
            className="btn--sm"
            title={t("Erfasste Zeiten bleiben erhalten.")}
            onClick={() => {
              setConfirmDeleteId(null);
              void deleteProject(project.id).then(() => list.reload());
            }}
          ><Trash2 size={14}/>{t("Endgültig löschen")}</Button>
          <Button variant="ghost" className="btn--sm" onClick={() => setConfirmDeleteId(null)}>{t("Abbrechen")}</Button>
        </>
      );
    }
    return (
      <>
        <Button variant="ghost" className="btn--sm" onClick={() => void restoreProject(project.id).then(() => list.reload())}><ArchiveRestore size={14}/>{t("Reaktivieren")}</Button>
        <Button variant="danger" className="btn--sm" onClick={() => setConfirmDeleteId(project.id)}><Trash2 size={14}/>{t("Löschen")}</Button>
      </>
    );
  }

  return (
    <Page
      title={t("Projekte")}
      hint={t("Projektverwaltung")}
      actions={
        <>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
            <option value="active">{t("Aktiv")}</option>
            <option value="planned">{t("Geplant")}</option>
            <option value="completed">{t("Abgeschlossen")}</option>
            <option value="archived">{t("Archiviert")}</option>
            <option value="all">{t("Alle")}</option>
          </Select>
          <Button variant="primary" onClick={open ? resetForm : createNew}>{open ? t("Schließen") : <><Plus size={15}/>{t("Neues Projekt")}</>}</Button>
        </>
      }
    >
      {open ? (
        <Card title={editingProject ? t("Projekt bearbeiten") : t("Neues Projekt")} subtitle={editingProject ? t("Abrechnung, Zuordnung und Pflichtfelder aktualisieren") : undefined}>
          <ProjectEditor
            key={editingProject?.id ?? "new-project"}
            project={editingProject}
            customers={customers.data ?? []}
            onSaved={() => { resetForm(); list.reload(); }}
            onCancel={resetForm}
          />
        </Card>
      ) : null}

      <Card title={t("Projekte")} subtitle={t("{n} Einträge", { n: list.data?.length ?? 0 })}>
        <AsyncBody state={{ data: list.data, error: list.error, loading: list.loading }} empty={<EmptyState title={t("Keine Projekte")}>{t("Lege das erste Projekt an.")}</EmptyState>}>
          {(rows) => (
            <div className="responsive-entity-list responsive-entity-list--projects">
              <div className="responsive-entity-list__table">
                <TableWrap>
                  <table className="table">
                    <thead><tr><th>{t("Name")}</th><th>{t("Kunde")}</th><th>{t("Abrechnung")}</th><th className="right">{t("Satz")}</th><th>{t("Flags")}</th><th>{t("Status")}</th><th className="right">{t("Aktion")}</th></tr></thead>
                    <tbody>
                      {rows.map((project) => (
                        <tr key={project.id}>
                          <td><a className="table-link" href={`#/projects/${encodeURIComponent(project.id)}`}>{project.name}</a>{project.project_code ? <span className="faint num"> | {project.project_code}</span> : null}</td>
                          <td className="muted">{project.customer_id ? custNames.get(project.customer_id) ?? t("Unbekannter Kunde") : <span className="faint">{t("intern")}</span>}</td>
                          <td>{t(BILLING.find((option) => option.value === project.billing_type)?.label ?? project.billing_type)}</td>
                          <td className="right num">{fmtMoney(project.hourly_rate_cents ?? project.day_rate_cents ?? project.fixed_fee_cents ?? null)}</td>
                          <td className="cluster">{project.description_required ? <Tag tone="muted">{t("Beschr.")}</Tag> : null}{project.backdating_reason_required ? <Tag tone="muted">{t("Grund")}</Tag> : null}</td>
                          <td><Tag tone={project.status === "active" ? "accent" : "muted"}>{t(STATUS_LABEL[project.status] ?? project.status)}</Tag></td>
                          <td className="right"><div className="table-actions">{projectActions(project)}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </div>
              <div className="entity-card-list" role="list">
                {rows.map((project) => (
                  <article className="entity-record-card" role="listitem" key={project.id}>
                    <header className="entity-record-card__head">
                      <div><a className="entity-record-card__title" href={`#/projects/${encodeURIComponent(project.id)}`}>{project.name}</a><span>{project.project_code || (project.customer_id ? custNames.get(project.customer_id) ?? t("Unbekannter Kunde") : t("Internes Projekt"))}</span></div>
                      <Tag tone={project.status === "active" ? "accent" : "muted"}>{t(STATUS_LABEL[project.status] ?? project.status)}</Tag>
                    </header>
                    <dl className="entity-record-card__facts">
                      <div><dt>{t("Kunde")}</dt><dd>{project.customer_id ? custNames.get(project.customer_id) ?? t("Unbekannter Kunde") : t("intern")}</dd></div>
                      <div><dt>{t("Abrechnung")}</dt><dd>{t(BILLING.find((option) => option.value === project.billing_type)?.label ?? project.billing_type)}</dd></div>
                      <div><dt>{t("Satz")}</dt><dd className="num">{fmtMoney(project.hourly_rate_cents ?? project.day_rate_cents ?? project.fixed_fee_cents ?? null)}</dd></div>
                      <div><dt>{t("Pflichtfelder")}</dt><dd className="entity-record-card__tags">{project.description_required ? <Tag tone="muted">{t("Beschreibung")}</Tag> : null}{project.backdating_reason_required ? <Tag tone="muted">{t("Nachtragsgrund")}</Tag> : null}{!project.description_required && !project.backdating_reason_required ? <span className="faint">{t("Keine")}</span> : null}</dd></div>
                    </dl>
                    <footer className="entity-record-card__actions">{projectActions(project)}</footer>
                  </article>
                ))}
              </div>
            </div>
          )}
        </AsyncBody>
      </Card>
    </Page>
  );
}
