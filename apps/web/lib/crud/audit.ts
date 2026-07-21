/**
 * lib/crud/audit.ts, Gemeinsamer Audit-Helper für alle CRUD-Stammdaten-Routen
 * (doc 06 §A.6 `audit_logs`, doc 10 §4.0 "Audit-Eintrag `Stundensatz geändert`").
 *
 * `audit_logs` ist append-only und revisionssicher (doc 06 §A.6). Die `action`
 * ist ein hartes Enum aus 25 Werten, für Stammdaten sind nur die relevanten
 * `rate_changed` (Satz-/Steuer-Änderung an Kunde/Projekt/`billing_rates`) und
 * `rounding_rule_changed` (`rounding_rules`, Projekt-Rundungsregel) zutreffend
 * (doc 06 customers/projects Meta: "Audit-Pflicht: ja (Stundensatz/Steuer- bzw.
 * Satz-/Rundungsregel-Änderung)"). `tasks`/`tags` haben Audit-Pflicht: nein.
 *
 * VERTRAG für die CRUD-Routen:
 *   await writeAudit(tx, {
 *     actor_id, main_account_id, device_id,
 *     entity_type: "billing_rates", entity_id,
 *     action: "rate_changed",
 *     before_json, after_json, reason, source: "api",
 *   });
 *
 * `db` darf die reguläre `Db`-Instanz ODER eine offene Transaktion sein, beide
 * erfüllen `Pick<Db, "insert">`, sodass der Audit-Insert atomar mit der Mutation
 * committet werden kann.
 */
import { uuidv7 } from "uuidv7";
import type { InferInsertModel } from "drizzle-orm";
import { schema, type Db } from "@/lib/db";

/** Ausführungs-Handle: reguläre DB-Instanz oder eine offene Transaktion. */
export type Executor = Pick<Db, "insert">;

type AuditInsert = InferInsertModel<typeof schema.auditLogs>;

/** Die für Stammdaten relevanten `audit_logs.action`-Werte (Teilmenge der 25). */
export type AuditAction = AuditInsert["action"];
/** `audit_logs.source` (ui | api | sync | system). */
export type AuditSource = AuditInsert["source"];

export interface WriteAuditInput {
  /** Urheber: `users.id` (Team) oder `main_accounts.id` (Solo). NOT NULL. */
  actor_id: string;
  main_account_id: string;
  /** Urheber-Gerät (aus AuthContext); bei Cookie-Session ggf. null. */
  device_id?: string | null;
  /** @tarlog/db-Tabellenname der Entität (z. B. "customers"). */
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  before_json?: Record<string, unknown> | null;
  after_json?: Record<string, unknown> | null;
  reason?: string | null;
  source?: AuditSource;
  correlation_id?: string | null;
}

/**
 * Schreibt einen append-only `audit_logs`-Eintrag (doc 06 §A.6). Wird von allen
 * CRUD-Routen mit Audit-Pflicht genutzt. Läuft idealerweise innerhalb der
 * Mutations-Transaktion, damit Datenänderung und Audit gemeinsam committen.
 */
export async function writeAudit(
  db: Executor,
  input: WriteAuditInput,
): Promise<void> {
  await db.insert(schema.auditLogs).values({
    id: uuidv7(),
    actor_id: input.actor_id,
    organization_id: null,
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
    server_revision: null,
    local_revision: 0,
    correlation_id: input.correlation_id ?? null,
  });
}
