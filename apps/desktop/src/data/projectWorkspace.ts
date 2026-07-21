import { select } from "../lib/db";
import { getContext } from "./context";
import { getSetting, setSetting } from "./settings";

export type RequirementKey =
  | "goal"
  | "users"
  | "scope"
  | "outOfScope"
  | "functional"
  | "quality"
  | "deliverables"
  | "acceptance"
  | "dependencies"
  | "risks";

export type ProjectRequirements = Record<RequirementKey, string>;

export const EMPTY_REQUIREMENTS: ProjectRequirements = {
  goal: "", users: "", scope: "", outOfScope: "", functional: "",
  quality: "", deliverables: "", acceptance: "", dependencies: "", risks: "",
};

export const REQUIREMENT_TEMPLATES: Record<"lastenheft" | "pflichtenheft", Partial<ProjectRequirements>> = {
  lastenheft: {
    goal: "Welches Problem soll gelöst und welches messbare Ergebnis erreicht werden?",
    users: "Wer nutzt die Lösung und welche Bedürfnisse haben diese Personen?",
    scope: "Welche Leistungen und Funktionen werden erwartet?",
    outOfScope: "Was ist ausdrücklich nicht Bestandteil des Auftrags?",
    acceptance: "Woran erkennt der Auftraggeber, dass die Anforderung erfüllt ist?",
    dependencies: "Welche Systeme, Inhalte, Ansprechpartner oder Termine sind Voraussetzung?",
  },
  pflichtenheft: {
    functional: "Wie werden die fachlichen Anforderungen technisch und organisatorisch umgesetzt?",
    quality: "Welche Anforderungen gelten für Leistung, Sicherheit, Barrierefreiheit und Wartbarkeit?",
    deliverables: "Welche konkreten Ergebnisse, Formate und Übergaben werden geliefert?",
    acceptance: "Welche prüfbaren Kriterien, Tests und Freigaben gelten?",
    risks: "Welche Risiken bestehen und wie werden sie reduziert?",
  },
};

/** Fill only unanswered prompts; user-authored content is never overwritten. */
export function applyRequirementTemplate(
  current: ProjectRequirements,
  template: "lastenheft" | "pflichtenheft",
): ProjectRequirements {
  const next = { ...current };
  for (const [key, value] of Object.entries(REQUIREMENT_TEMPLATES[template])) {
    const typedKey = key as RequirementKey;
    if (!next[typedKey].trim() && value) next[typedKey] = value;
  }
  return next;
}

export type WorkspaceEntity = "project" | "task";

const settingKey = (entityType: WorkspaceEntity, entityId: string) =>
  `${entityType}.workspace.${entityId}.requirements`;

export async function loadProjectRequirements(
  entityId: string,
  entityType: WorkspaceEntity = "project",
): Promise<ProjectRequirements> {
  const stored = await getSetting<Partial<ProjectRequirements>>(settingKey(entityType, entityId));
  return { ...EMPTY_REQUIREMENTS, ...(stored ?? {}) };
}

export function saveProjectRequirements(
  entityId: string,
  value: ProjectRequirements,
  entityType: WorkspaceEntity = "project",
): Promise<void> {
  return setSetting(settingKey(entityType, entityId), value);
}

export interface ProjectDocumentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  filename: string;
  mime_type: string;
  storage_path: string;
  size_bytes: number;
  checksum_sha256: string | null;
  created_at: number;
}

export async function listProjectDocuments(projectId: string, taskIds: string[]): Promise<ProjectDocumentRow[]> {
  const ctx = await getContext();
  const taskPlaceholders = taskIds.map((_, index) => `$${index + 3}`).join(",");
  const taskClause = taskIds.length
    ? ` OR (entity_type LIKE 'task_document:%' AND entity_id IN (${taskPlaceholders}))`
    : "";
  return select<ProjectDocumentRow>(
    `SELECT id, entity_type, entity_id, filename, mime_type, storage_path, size_bytes, checksum_sha256, created_at
       FROM attachments
      WHERE main_account_id = $1 AND deleted_at IS NULL
        AND ((entity_type LIKE 'project_document:%' AND entity_id = $2)${taskClause})
      ORDER BY created_at DESC`,
    [ctx.mainAccountId, projectId, ...taskIds],
  );
}

export function documentCategory(entityType: string): string {
  const category = entityType.split(":")[1] ?? "sonstiges";
  return ({ lastenheft: "Lastenheft", pflichtenheft: "Pflichtenheft", angebot: "Angebot", entwurf: "Entwurf", sonstiges: "Sonstiges" } as Record<string, string>)[category] ?? "Sonstiges";
}
