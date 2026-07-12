/**
 * lib/invoice/audit.ts — Audit-Log-Schreiber für Abrechnung/Export (doc 10
 * §5.6, doc 06 audit_logs). Jede kritische Aktion (Rechnung erstellt/
 * finalisiert/storniert, Export erstellt, PDF erzeugt) schreibt einen
 * revisionsfähigen Eintrag mit before/after (doc 12 Testfall 32).
 *
 * Nimmt einen `pg`-Queryable (Pool oder PoolClient) entgegen, damit der Eintrag
 * bei Bedarf innerhalb derselben Transaktion wie die Mutation läuft.
 */
import { uuidv7 } from "uuidv7";
import type { Pool, PoolClient } from "pg";

/** Erlaubte Audit-Aktionen dieses Moduls (Teilmenge doc 06 audit_logs.action). */
export type AuditAction =
  | "invoice_created"
  | "invoice_finalized"
  | "invoice_cancelled"
  | "export_created"
  | "pdf_generated";

/** Pool oder PoolClient — beide haben `.query`. */
type Queryable = Pool | PoolClient;

export interface AuditInput {
  main_account_id: string;
  /** Urheber: user_id, sonst main_account_id (actor_id ist NOT NULL). */
  actor_id: string;
  device_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  source?: "ui" | "api" | "sync" | "system";
  correlation_id?: string | null;
}

/** Schreibt einen Audit-Eintrag (doc 06 audit_logs). */
export async function recordAudit(db: Queryable, input: AuditInput): Promise<void> {
  await db.query(
    `INSERT INTO audit_logs
       (id, actor_id, main_account_id, device_id, entity_type, entity_id, action,
        before_json, after_json, reason, timestamp, source, local_revision)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,0)`,
    [
      uuidv7(),
      input.actor_id,
      input.main_account_id,
      input.device_id ?? null,
      input.entity_type,
      input.entity_id,
      input.action,
      input.before ? JSON.stringify(input.before) : null,
      input.after ? JSON.stringify(input.after) : null,
      input.reason ?? null,
      Date.now(),
      input.source ?? "api",
    ],
  );
}
