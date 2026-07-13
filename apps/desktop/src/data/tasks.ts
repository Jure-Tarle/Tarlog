/**
 * tasks.ts — task CRUD (doc 06 A.2 `tasks`). No bridge command exists for tasks,
 * so all operations are local SQL via {@link ../lib/db}. Validation via @tarlog/core
 * `taskSchema`.
 */
import { execute, select } from "../lib/db";
import { applyPatch } from "./customers";
import { getContext, now } from "./context";
import { writeAudit } from "./audit";
import { notifyChange } from "./backup";
import { uuidv7 } from "uuidv7";
import { taskSchema, type TaskInput, type Uuid } from "@tarlog/core";

export type TaskRow = TaskInput;

/** Draft for {@link createTask} — id/main_account_id are filled here. */
export type TaskDraft = Omit<Partial<TaskInput>, "main_account_id"> & {
  name: string;
};

/** Columns a client may patch via {@link updateTask}. */
const PATCHABLE = new Set<keyof TaskInput>([
  "project_id",
  "name",
  "description",
  "default_billable",
  "default_hourly_rate_cents",
  "default_day_rate_cents",
  "cost_center",
  "color",
  "status",
  "sort_order",
]);

/** List tasks, optionally scoped to a project (local read). */
export async function listTasks(projectId?: Uuid | null): Promise<TaskRow[]> {
  const ctx = await getContext();
  if (projectId) {
    return select<TaskRow>(
      `SELECT * FROM tasks WHERE main_account_id = $1 AND project_id = $2 AND deleted_at IS NULL
        ORDER BY sort_order ASC, id DESC`,
      [ctx.mainAccountId, projectId],
    );
  }
  return select<TaskRow>(
    `SELECT * FROM tasks WHERE main_account_id = $1 AND deleted_at IS NULL
      ORDER BY sort_order ASC, id DESC`,
    [ctx.mainAccountId],
  );
}

/** One task by id, or null (local read). */
export async function getTask(id: Uuid): Promise<TaskRow | null> {
  const ctx = await getContext();
  const rows = await select<TaskRow>(
    `SELECT * FROM tasks WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, ctx.mainAccountId],
  );
  return rows[0] ?? null;
}

/** Create a task (local INSERT): validate → insert → audit → backup trigger. */
export async function createTask(draft: TaskDraft): Promise<TaskRow> {
  const ctx = await getContext();
  const input: TaskInput = taskSchema.parse({
    ...draft,
    id: draft.id ?? uuidv7(),
    main_account_id: ctx.mainAccountId,
  });
  const ts = now();
  await execute(
    `INSERT INTO tasks
       (id, main_account_id, project_id, name, description, default_billable,
        default_hourly_rate_cents, default_day_rate_cents, cost_center, color,
        status, sort_order, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      input.id,
      ctx.mainAccountId,
      input.project_id ?? null,
      input.name,
      input.description ?? null,
      input.default_billable ? 1 : 0,
      input.default_hourly_rate_cents ?? null,
      input.default_day_rate_cents ?? null,
      input.cost_center ?? null,
      input.color ?? null,
      input.status,
      input.sort_order,
      ts,
      ts,
    ],
  );
  await writeAudit({
    action: "entry_updated",
    entity_type: "task",
    entity_id: input.id,
    after: input as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return (await getTask(input.id))!;
}

/** Patch a task's whitelisted columns (local SQL). Returns the fresh row. */
export async function updateTask(id: Uuid, patch: Partial<TaskInput>): Promise<TaskRow> {
  const before = await getTask(id);
  if (!before) throw new Error(`updateTask: Aufgabe ${id} nicht gefunden`);
  await applyPatch("tasks", id, patch, PATCHABLE);
  const after = await getTask(id);
  await writeAudit({
    action: "entry_updated",
    entity_type: "task",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return after!;
}

/** Soft-delete (archive) a task: set `deleted_at` + status archived. */
export async function archiveTask(id: Uuid): Promise<void> {
  const ctx = await getContext();
  const ts = now();
  await execute(
    `UPDATE tasks SET deleted_at = $1, status = 'archived', updated_at = $2
      WHERE id = $3 AND main_account_id = $4`,
    [ts, ts, id, ctx.mainAccountId],
  );
  await writeAudit({ action: "entry_deleted", entity_type: "task", entity_id: id });
  await notifyChange();
}
