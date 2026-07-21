import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ArrowLeft, BookOpenCheck, ExternalLink, FileText, FolderOpen, Save, Trash2, Upload } from "lucide-react";
import { AsyncBody, Button, Card, EmptyState, ErrorNote, Field, Page, Select, Tag, TextArea, TextInput } from "../components/ui";
import { useAsync } from "../data/hooks";
import { getProject, updateProject } from "../data/projects";
import { listTasks, updateTask } from "../data/tasks";
import {
  applyRequirementTemplate,
  documentCategory,
  EMPTY_REQUIREMENTS,
  listProjectDocuments,
  loadProjectRequirements,
  saveProjectRequirements,
  type ProjectRequirements,
  type RequirementKey,
} from "../data/projectWorkspace";
import { projectDocumentDelete, projectDocumentImport, projectDocumentOpen } from "../lib/bridge";
import { notifyChange } from "../data/backup";
import { t, getLocale } from "../i18n";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const REQUIREMENT_FIELDS: { key: RequirementKey; label: string; hint: string; placeholder: string }[] = [
  { key: "goal", label: "Ziel & Nutzen", hint: "Das gewünschte Ergebnis, nicht nur die Lösung beschreiben.", placeholder: "Welches Problem wird gelöst? Wann ist das Projekt erfolgreich?" },
  { key: "users", label: "Nutzer & Beteiligte", hint: "Zielgruppen, Auftraggeber und Entscheider.", placeholder: "Wer nutzt, prüft und gibt die Lösung frei?" },
  { key: "scope", label: "Leistungsumfang", hint: "Alles, was verbindlich geliefert werden soll.", placeholder: "Welche Funktionen und Leistungen gehören dazu?" },
  { key: "outOfScope", label: "Nicht enthalten", hint: "Klare Grenzen vermeiden spätere Missverständnisse.", placeholder: "Was ist ausdrücklich nicht Teil des Projekts?" },
  { key: "functional", label: "Umsetzung & Funktionen", hint: "Konkrete Abläufe, Regeln und technische Lösung.", placeholder: "Wie werden die Anforderungen umgesetzt?" },
  { key: "quality", label: "Qualitätsanforderungen", hint: "Zum Beispiel Performance, Sicherheit und Barrierefreiheit.", placeholder: "Welche nicht-funktionalen Qualitätsziele gelten?" },
  { key: "deliverables", label: "Ergebnisse & Übergabe", hint: "Lieferobjekte, Formate, Dokumentation und Schulung.", placeholder: "Was wird in welcher Form übergeben?" },
  { key: "acceptance", label: "Abnahme", hint: "Messbare Kriterien und verantwortliche Freigaben.", placeholder: "Wie wird geprüft, ob die Leistung vollständig ist?" },
  { key: "dependencies", label: "Abhängigkeiten", hint: "Zugänge, Inhalte, Systeme, Termine und Ansprechpartner.", placeholder: "Was muss wann von wem bereitgestellt werden?" },
  { key: "risks", label: "Risiken & Entscheidungen", hint: "Offene Punkte mit Gegenmaßnahme oder Entscheidung festhalten.", placeholder: "Was kann das Ergebnis gefährden?" },
];

export default function ProjectWorkspace({ projectId, initialTaskId = null }: { projectId: string; initialTaskId?: string | null }) {
  const project = useAsync(() => getProject(projectId), [projectId]);
  const tasks = useAsync(() => listTasks(projectId), [projectId]);
  const [workspaceTarget, setWorkspaceTarget] = useState(initialTaskId ?? "project");
  const activeTask = (tasks.data ?? []).find((task) => task.id === workspaceTarget) ?? null;
  const activeEntityType = workspaceTarget === "project" ? "project" as const : "task" as const;
  const activeEntityId = activeEntityType === "project" ? projectId : workspaceTarget;
  const requirementsState = useAsync(
    () => loadProjectRequirements(activeEntityId, activeEntityType),
    [activeEntityId, activeEntityType],
  );
  const taskIds = useMemo(() => (tasks.data ?? []).map((task) => task.id), [tasks.data]);
  const documents = useAsync(() => listProjectDocuments(projectId, taskIds), [projectId, taskIds.join("|")]);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState<ProjectRequirements>({ ...EMPTY_REQUIREMENTS });
  const [documentTarget, setDocumentTarget] = useState(initialTaskId ?? "project");
  const [category, setCategory] = useState<"lastenheft" | "pflichtenheft" | "angebot" | "entwurf" | "sonstiges">("sonstiges");
  const [busy, setBusy] = useState(false);
  // window.confirm ist in der Tauri-WebView nicht verfügbar (liefert sofort
  // false), daher zweistufige Inline-Bestätigung direkt in der Dokumentzeile.
  const [confirmDocDeleteId, setConfirmDocDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTask) {
      setProjectName(activeTask.name);
      setDescription(activeTask.description ?? "");
      return;
    }
    if (workspaceTarget === "project" && project.data) {
      setProjectName(project.data.name);
      setDescription(project.data.description ?? "");
    }
  }, [activeTask?.id, activeTask?.name, activeTask?.description, project.data, workspaceTarget]);
  useEffect(() => {
    if (requirementsState.data) setRequirements(requirementsState.data);
  }, [requirementsState.data]);

  async function saveOverview() {
    if (workspaceTarget !== "project" && !activeTask) { setError(t("Das Teilprojekt wird noch geladen oder wurde nicht gefunden.")); return; }
    if (!projectName.trim()) { setError(activeTask ? t("Der Teilprojektname darf nicht leer sein.") : t("Der Projektname darf nicht leer sein.")); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      if (activeTask) {
        await updateTask(activeTask.id, { name: projectName.trim(), description: description.trim() || null });
        tasks.reload();
        setMessage(t("Teilprojektname und Beschreibung wurden gespeichert."));
      } else {
        await updateProject(projectId, { name: projectName.trim(), description: description.trim() || null });
        project.reload();
        setMessage(t("Projektname und Beschreibung wurden gespeichert."));
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function saveRequirements() {
    if (workspaceTarget !== "project" && !activeTask) { setError(t("Das Teilprojekt wird noch geladen oder wurde nicht gefunden.")); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      await saveProjectRequirements(activeEntityId, requirements, activeEntityType);
      setMessage(activeTask
        ? t("Anforderungen für „{name}“ wurden lokal gespeichert.", { name: activeTask.name })
        : t("Anforderungen für das Gesamtprojekt wurden lokal gespeichert."));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  function changeWorkspaceTarget(value: string) {
    setWorkspaceTarget(value);
    setDocumentTarget(value);
    setMessage(null);
    setError(null);
    window.location.hash = value === "project"
      ? `#/projects/${encodeURIComponent(projectId)}/workspace`
      : `#/projects/${encodeURIComponent(projectId)}/workspace/task/${encodeURIComponent(value)}`;
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError(t("Die Datei ist größer als 20 MB.")); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const isProject = documentTarget === "project";
      await projectDocumentImport({
        entityType: isProject ? "project" : "task",
        entityId: isProject ? projectId : documentTarget,
        category,
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      documents.reload();
      void notifyChange().catch(() => undefined);
      setMessage(t("„{name}“ wurde sicher in Tarlog abgelegt.", { name: file.name }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  async function deleteDocument(id: string) {
    setConfirmDocDeleteId(null);
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await projectDocumentDelete(id);
      documents.reload();
      void notifyChange().catch(() => undefined);
      setMessage(result.warning ? t("Dokument wurde aus Tarlog entfernt. Hinweis: {warning}", { warning: result.warning }) : t("Dokument wurde gelöscht."));
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  }

  const taskNames = new Map((tasks.data ?? []).map((task) => [task.id, task.name]));
  const visibleDocuments = (documents.data ?? []).filter((document) => documentTarget === "project"
    ? document.entity_type.startsWith("project_document:") && document.entity_id === projectId
    : document.entity_type.startsWith("task_document:") && document.entity_id === documentTarget);
  return (
    <Page
      className="project-workspace"
      title={activeTask ? t("Teilprojektakte") : t("Projektakte")}
      hint={activeTask ? t("{project} | {task}", { project: project.data?.name ?? t("Projekt"), task: activeTask.name }) : project.data?.name ?? t("Anforderungen und Dokumente")}
      actions={<Button variant="ghost" onClick={() => { window.location.hash = `#/projects/${encodeURIComponent(projectId)}`; }}><ArrowLeft size={15}/>{t("Projektübersicht")}</Button>}
    >
      {message ? <div className="notice notice--info" role="status">{message}</div> : null}
      {error ? <ErrorNote error={error} /> : null}
      <AsyncBody state={{ data: project.data, error: project.error, loading: project.loading }} empty={<EmptyState title={t("Projekt nicht gefunden")} />}>
        {() => <>
          <section className="workspace-scope-bar" aria-label={t("Bereich auswählen")}>
            <div><span className="detail-eyebrow">{t("Arbeitsbereich")}</span><strong>{activeTask ? activeTask.name : t("Gesamtprojekt")}</strong><span>{activeTask ? t("Eigenes Briefing, Anforderungen und Dokumente") : t("Übergeordnete Projektakte")}</span></div>
            <Field label={t("Projekt oder Teilprojekt")}>
              <Select value={workspaceTarget} onChange={(event) => changeWorkspaceTarget(event.target.value)}>
                <option value="project">{t("Gesamtprojekt | {name}", { name: project.data?.name ?? "" })}</option>
                {(tasks.data ?? []).map((task) => <option value={task.id} key={task.id}>{t("Teilprojekt | {name}", { name: task.name })}</option>)}
              </Select>
            </Field>
          </section>
          <section className="workspace-intro">
            <div className="workspace-intro__icon"><BookOpenCheck size={24}/></div>
            <div><span className="detail-eyebrow">{activeTask ? t("Teilprojektwissen an einem Ort") : t("Projektwissen an einem Ort")}</span><h2>{t("Vom Briefing bis zur Abnahme")}</h2><p>{activeTask ? t("Dokumentiere Ziel, Leistungsumfang, Umsetzung und Abnahme dieses Teilprojekts unabhängig vom Gesamtprojekt.") : t("Beschreibe das Vorhaben, konkretisiere Anforderungen und ordne Lastenheft, Pflichtenheft oder weitere Unterlagen dem Gesamtprojekt zu.")}</p></div>
          </section>

          <Card title={activeTask ? t("Teilprojekt-Stammdaten") : t("Stammdaten")} subtitle={activeTask ? t("Name und Beschreibung dieses Leistungsabschnitts") : t("Name und übergeordnete Beschreibung des Gesamtprojekts")}>
            <div className="workspace-form-grid">
              <Field label={activeTask ? t("Name des Teilprojekts") : t("Projektname")} required><TextInput value={projectName} maxLength={140} onChange={(event) => setProjectName(event.target.value)} /></Field>
              <Field label={activeTask ? t("Teilprojektbeschreibung") : t("Projektbeschreibung")} hint={t("Kurzer Kontext, der in der Projektübersicht sichtbar ist.")}><TextArea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t("Ausgangslage, Ziel und erwartetes Ergebnis")} /></Field>
            </div>
            <div className="workspace-actions"><Button variant="primary" disabled={busy} onClick={() => void saveOverview()}><Save size={15}/>{t("Stammdaten speichern")}</Button></div>
          </Card>

          <Card
            title={t("Anforderungen strukturieren")}
            subtitle={t("Geführte Fragen als Arbeitsgrundlage für Lasten- und Pflichtenheft")}
            actions={<div className="workspace-template-actions"><Button variant="ghost" className="btn--sm" onClick={() => setRequirements((current) => applyRequirementTemplate(current, "lastenheft"))}>{t("Lastenheft-Hilfe")}</Button><Button variant="ghost" className="btn--sm" onClick={() => setRequirements((current) => applyRequirementTemplate(current, "pflichtenheft"))}>{t("Pflichtenheft-Hilfe")}</Button></div>}
          >
            <div className="requirements-grid">
              {REQUIREMENT_FIELDS.map((field) => <Field key={field.key} label={t(field.label)} hint={t(field.hint)}><TextArea rows={4} value={requirements[field.key]} onChange={(event) => setRequirements((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={t(field.placeholder)}/></Field>)}
            </div>
            <div className="workspace-actions"><span>{t("Die Hilfen füllen ausschließlich leere Felder.")}</span><Button variant="primary" disabled={busy} onClick={() => void saveRequirements()}><Save size={15}/>{t("Anforderungen speichern")}</Button></div>
          </Card>

          <Card title={t("Dokumente")} subtitle={t("Lokale Ablage im geschützten Tarlog-App-Datenordner | maximal 20 MB pro Datei")}>
            <div className="document-toolbar">
              <Field label={t("Zuordnung")}>
                <Select value={documentTarget} onChange={(event) => setDocumentTarget(event.target.value)}>
                  <option value="project">{t("Gesamtprojekt")}</option>
                  {(tasks.data ?? []).map((task) => <option value={task.id} key={task.id}>{t("Teilprojekt | {name}", { name: task.name })}</option>)}
                </Select>
              </Field>
              <Field label={t("Dokumentart")}>
                <Select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                  <option value="lastenheft">{t("Lastenheft")}</option><option value="pflichtenheft">{t("Pflichtenheft")}</option><option value="angebot">{t("Angebot")}</option><option value="entwurf">{t("Entwurf")}</option><option value="sonstiges">{t("Sonstiges")}</option>
                </Select>
              </Field>
              <label className={`btn btn--primary document-upload ${busy ? "is-disabled" : ""}`}><Upload size={15}/>{t("Datei auswählen")}<input className="sr-only" type="file" disabled={busy} accept=".pdf,.doc,.docx,.txt,.md,.rtf,.pages,.xlsx,.png,.jpg,.jpeg" onChange={(event) => void importFile(event)}/></label>
            </div>
            {documents.error ? <ErrorNote error={documents.error} /> : null}
            {visibleDocuments.length ? <div className="document-list">
              {visibleDocuments.map((document) => {
                const isTask = document.entity_type.startsWith("task_document:");
                return <article className="document-row" key={document.id}>
                  <span className="document-row__icon"><FileText size={18}/></span>
                  <div className="document-row__main"><strong>{document.filename}</strong><span>{isTask ? t("Teilprojekt | {name}", { name: taskNames.get(document.entity_id) ?? t("Nicht verfügbar") }) : t("Gesamtprojekt")} | {(document.size_bytes / 1024).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} KB</span></div>
                  <Tag tone="muted">{t(documentCategory(document.entity_type))}</Tag>
                  <div className="document-row__actions">{confirmDocDeleteId === document.id ? (
                    <>
                      <Button variant="danger" className="btn--sm" disabled={busy} onClick={() => void deleteDocument(document.id)}><Trash2 size={14}/>{t("Endgültig löschen")}</Button>
                      <Button variant="ghost" className="btn--sm" onClick={() => setConfirmDocDeleteId(null)}>{t("Abbrechen")}</Button>
                    </>
                  ) : (
                    <>
                      <Button variant="ghost" className="btn--sm" onClick={() => void projectDocumentOpen(document.id).catch((caught) => setError(caught instanceof Error ? caught.message : String(caught)))}><ExternalLink size={14}/>{t("Öffnen")}</Button>
                      <Button variant="ghost" className="btn--sm" disabled={busy} onClick={() => setConfirmDocDeleteId(document.id)}><Trash2 size={14}/>{t("Löschen")}</Button>
                    </>
                  )}</div>
                </article>;
              })}
            </div> : <EmptyState title={t("Noch keine Dokumente")}><span>{t("Lege zum Beispiel Lastenheft, Pflichtenheft, Angebot oder Entwürfe ab.")}</span></EmptyState>}
            <div className="document-privacy"><FolderOpen size={15}/><span>{t("Tarlog importiert eine eigene Kopie. Das Original bleibt unverändert.")}</span></div>
          </Card>
        </>}
      </AsyncBody>
    </Page>
  );
}
