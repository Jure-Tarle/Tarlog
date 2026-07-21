/**
 * audit.ts, append-only local audit trail (doc 03 §Audit, doc 06 `audit_logs`).
 * Every mutating repository operation writes one row so timer/backdate/edit
 * actions are traceable. Direct SQL (local bookkeeping) via {@link ../lib/db}.
 */
import { execute } from "../lib/db";
import { getContext, now } from "./context";
import { uuidv7 } from "uuidv7";

/** The audit actions this app records (subset of doc 06 `audit_logs.action`). */
export type AuditAction =
  | "timer_started"
  | "timer_paused"
  | "timer_resumed"
  | "timer_stopped"
  | "entry_backdated"
  | "entry_updated"
  | "entry_deleted"
  | "description_changed"
  | "billability_changed"
  | "project_changed"
  | "task_changed"
  | "rate_changed"
  | "rounding_rule_changed";

export interface AuditInput {
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/**
 * Write one audit row. `local_revision` has no DB default (doc 06) so we set 0;
 * sync assigns the real revision later. `source` is always "ui" for repo calls.
 */
export async function writeAudit(input: AuditInput): Promise<string> {
  const ctx = await getContext();
  const id = uuidv7();
  await execute(
    `INSERT INTO audit_logs
       (id, actor_id, main_account_id, device_id, entity_type, entity_id,
        action, before_json, after_json, reason, timestamp, source, local_revision)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      ctx.mainAccountId,
      ctx.mainAccountId,
      ctx.deviceId,
      input.entity_type,
      input.entity_id,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.reason ?? null,
      now(),
      "ui",
      0,
    ],
  );
  return id;
}
