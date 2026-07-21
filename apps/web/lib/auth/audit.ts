/**
 * lib/auth/audit.ts, Audit-Log-Schreiber (doc 09 §5 Nr. 16, doc 06 `audit_logs`).
 *
 * Revisionssicheres Protokoll kritischer Änderungen. `action` ist an das
 * `audit_logs.action`-Enum (doc 06, 25 Events) gebunden, daher hier typsicher
 * aus dem Drizzle-Insert-Typ abgeleitet. Für Auth/Token existiert im Enum nur
 * `device_connected` / `device_disconnected`; Account-/Session-/Token-Mutationen
 * tragen ihre Historie in den Entitätsspalten selbst (`api_tokens.created_at/
 * revoked_at`, `sessions.revoked_at`, `devices.revoked`), offener Punkt: Enum
 * um Token-/Account-Aktionen erweitern (Datenmodell-Autor).
 */
import { uuidv7 } from "uuidv7";
import { db, schema } from "@/lib/db";

type AuditInsert = typeof schema.auditLogs.$inferInsert;
export type AuditAction = AuditInsert["action"];

export interface AuditLogInput {
  actor_id: string;
  main_account_id: string;
  device_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  reason?: string | null;
  source?: AuditInsert["source"];
  correlation_id?: string | null;
}

/** Schreibt einen append-only Audit-Datensatz. */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  await db.insert(schema.auditLogs).values({
    id: uuidv7(),
    actor_id: input.actor_id,
    main_account_id: input.main_account_id,
    device_id: input.device_id ?? null,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    action: input.action,
    before_json: input.before_json ?? null,
    after_json: input.after_json ?? null,
    reason: input.reason ?? null,
    timestamp: Date.now(),
    source: input.source ?? "api",
    local_revision: 0,
    correlation_id: input.correlation_id ?? null,
  });
}
