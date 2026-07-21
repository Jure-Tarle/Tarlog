/**
 * projects.ts, project CRUD (doc 06 A.2 `projects`). Inserts via the
 * `create_project` bridge command; reads via `list_projects`; updates/archive
 * are local SQL. Validation via @tarlog/core `projectSchema`.
 */
import { createProject as bridgeCreate, listProjects as bridgeList } from "../lib/bridge";
import { execute, select } from "../lib/db";
import { applyPatch } from "./customers";
import { getContext, now } from "./context";
import { writeAudit } from "./audit";
import { notifyChange } from "./backup";
import { uuidv7 } from "uuidv7";
import { projectSchema, type ProjectInput, type Uuid } from "@tarlog/core";

export type ProjectRow = ProjectInput;

/** Draft for {@link createProject}, id/main_account_id are filled here. */
export type ProjectDraft = Omit<Partial<ProjectInput>, "main_account_id"> & {
  name: string;
  billing_type: ProjectInput["billing_type"];
};

/** Columns a client may patch via {@link updateProject}. */
const PATCHABLE = new Set<keyof ProjectInput>([
  "name",
  "customer_id",
  "description",
  "status",
  "project_code",
  "color",
  "start_date",
  "end_date",
  "billing_type",
  "hourly_rate_cents",
  "day_rate_cents",
  "fixed_fee_cents",
  "rounding_rule_id",
  "description_required",
  "backdating_allowed",
  "backdating_reason_required",
  "max_retroactive_edit_days",
]);

/** List projects, optional customer/status filter (via the bridge command). */
export function listProjects(
  args: { customerId?: Uuid | null; status?: string | null } = {},
): Promise<ProjectRow[]> {
  return bridgeList({ customerId: args.customerId ?? null, status: args.status ?? null });
}

/** One project by id, or null (local read). */
export async function getProject(id: Uuid): Promise<ProjectRow | null> {
  const ctx = await getContext();
  const rows = await select<ProjectRow>(
    `SELECT * FROM projects WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, ctx.mainAccountId],
  );
  return rows[0] ?? null;
}

/** Create a project: validate → `create_project` → audit → backup trigger. */
export async function createProject(draft: ProjectDraft): Promise<ProjectRow> {
  const ctx = await getContext();
  const input: ProjectInput = projectSchema.parse({
    ...draft,
    id: draft.id ?? uuidv7(),
    main_account_id: ctx.mainAccountId,
  });
  const row = await bridgeCreate(input);
  await writeAudit({
    action: "entry_updated",
    entity_type: "project",
    entity_id: input.id,
    after: input as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return row;
}

/** Patch a project's whitelisted columns (local SQL). Returns the fresh row. */
export async function updateProject(
  id: Uuid,
  patch: Partial<ProjectInput>,
): Promise<ProjectRow> {
  const before = await getProject(id);
  if (!before) throw new Error(`updateProject: Projekt ${id} nicht gefunden`);
  await applyPatch("projects", id, patch, PATCHABLE);
  const after = await getProject(id);
  await writeAudit({
    action: before.rounding_rule_id !== after?.rounding_rule_id ? "rounding_rule_changed" : "entry_updated",
    entity_type: "project",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return after!;
}

/** Archive a project: status archived, stays listed and restorable. */
export async function archiveProject(id: Uuid): Promise<void> {
  const before = await getProject(id);
  const ctx = await getContext();
  const ts = now();
  await execute(
    `UPDATE projects SET status = 'archived', archived_at = $1, updated_at = $2
      WHERE id = $3 AND main_account_id = $4 AND deleted_at IS NULL`,
    [ts, ts, id, ctx.mainAccountId],
  );
  await writeAudit({
    action: "entry_updated",
    entity_type: "project",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
    after: (await getProject(id)) as unknown as Record<string, unknown>,
  });
  await notifyChange();
}

/** Bring an archived project back to active. */
export async function restoreProject(id: Uuid): Promise<void> {
  const before = await getProject(id);
  const ctx = await getContext();
  await execute(
    `UPDATE projects SET status = 'active', archived_at = NULL, updated_at = $1
      WHERE id = $2 AND main_account_id = $3 AND deleted_at IS NULL`,
    [now(), id, ctx.mainAccountId],
  );
  await writeAudit({
    action: "entry_updated",
    entity_type: "project",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
    after: (await getProject(id)) as unknown as Record<string, unknown>,
  });
  await notifyChange();
}

/** Soft-delete a project: set `deleted_at`. Recorded time entries keep their reference. */
export async function deleteProject(id: Uuid): Promise<void> {
  const before = await getProject(id);
  const ctx = await getContext();
  const ts = now();
  await execute(
    `UPDATE projects SET deleted_at = $1, updated_at = $2
      WHERE id = $3 AND main_account_id = $4`,
    [ts, ts, id, ctx.mainAccountId],
  );
  await writeAudit({
    action: "entry_deleted",
    entity_type: "project",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
  });
  await notifyChange();
}
