/**
 * lib/sync/mutation.ts — kanonische Mutations-Klammer (doc 04 §1, §6.1).
 *
 * Jede sync-pflichtige Server-Mutation läuft durch `applyMutation`:
 *   1. Pro-Account-Serialisierung via `pg_advisory_xact_lock` (Single-Timer +
 *      monotone Revisionsvergabe ohne Races).
 *   2. Nächste kanonische `server_revision` (Hochwassermarke, doc 04 §1.2).
 *   3. Fachliche Entitäts-Mutation (Callback) IN derselben Transaktion.
 *   4. `audit_logs`-Eintrag (before/after/reason) IN derselben Transaktion.
 *   5. COMMIT.
 *   6. `publishEvent` (sync_events + pg_notify Live-Kanal) NACH Commit; die
 *      erzeugten `sync_events` bekommen dieselbe `server_revision` gesetzt,
 *      damit `GET /api/sync/changes?since=` sie als Delta zieht.
 *
 * Revisionsquelle ist `audit_logs.server_revision` (wird IN der gesperrten
 * Transaktion geschrieben), nicht `sync_events` (wird erst nach Commit
 * publiziert) — so bleibt die Vergabe unter dem Advisory-Lock kollisionsfrei.
 */
import type { PoolClient } from "pg";
import { uuidv7 } from "uuidv7";
import { pool } from "@/lib/db";
import {
  publishEvent,
  type PtlEventType,
  type PtlOperation,
} from "@/lib/events";
import { serverReceiveHlc, serverSendHlc } from "./hlc.js";

/** Numerik-Coercion: pg liefert BIGINT als String — überall zu number machen. */
export function toNum(v: unknown): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/** Wie `toNum`, erhält aber NULL. */
export function toNumOrNull(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

/** Alle Audit-Aktionen (doc 06 `audit_logs.action`). */
export type AuditAction =
  | "timer_started"
  | "timer_paused"
  | "timer_resumed"
  | "timer_stopped"
  | "entry_backdated"
  | "entry_updated"
  | "entry_deleted"
  | "start_time_corrected"
  | "end_time_corrected"
  | "break_changed"
  | "description_changed"
  | "billability_changed"
  | "project_changed"
  | "task_changed"
  | "rate_changed"
  | "rounding_rule_changed"
  | "invoice_created"
  | "invoice_finalized"
  | "invoice_cancelled"
  | "export_created"
  | "pdf_generated"
  | "compliance_override"
  | "sync_conflict_resolved"
  | "device_connected"
  | "device_disconnected";

/** Audit-Quelle (doc 06 `audit_logs.source`). */
export type AuditSource = "ui" | "api" | "sync" | "system";

/** Ein Audit-Eintrag, den die Mutation erzeugt. */
export interface AuditSpec {
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
}

/** Ein Live-/Sync-Event, das die Mutation publiziert. */
export interface EventSpec {
  type: PtlEventType;
  entity_type: string;
  entity_id: string;
  operation: PtlOperation;
  data: Record<string, unknown>;
}

/** Kontext, den der Mutations-Callback nutzt (Transaktion, Revision, HLC). */
export interface MutationContext {
  client: PoolClient;
  rev: number;
  hlc: string;
  now: number;
}

/** Rückgabe des Callbacks: fachliches Resultat + Audit(s) + optionale Event(s). */
export interface MutationOutput<T> {
  result: T;
  audit: AuditSpec | AuditSpec[];
  event?: EventSpec | EventSpec[];
}

export interface ApplyMutationInput<T> {
  main_account_id: string;
  device_id: string;
  /** Für audit_logs.actor_id (NOT NULL). */
  actor_id: string;
  correlation_id?: string | null;
  local_revision?: number;
  /** Client-HLC (Sync-Push) → serverReceiveHlc; sonst serverSendHlc. */
  client_hlc?: string | null;
  source?: AuditSource;
  run: (ctx: MutationContext) => Promise<MutationOutput<T>>;
}

export interface ApplyMutationResult<T> {
  result: T;
  server_revision: number;
  hlc: string;
}

async function insertAudit(
  client: PoolClient,
  input: {
    main_account_id: string;
    device_id: string;
    actor_id: string;
    source: AuditSource;
    rev: number;
    local_revision: number;
    correlation_id: string | null;
    now: number;
    spec: AuditSpec;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO audit_logs
       (id, actor_id, main_account_id, device_id, entity_type, entity_id,
        action, before_json, after_json, reason, timestamp, source,
        server_revision, local_revision, correlation_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      uuidv7(),
      input.actor_id,
      input.main_account_id,
      input.device_id,
      input.spec.entity_type,
      input.spec.entity_id,
      input.spec.action,
      input.spec.before != null ? JSON.stringify(input.spec.before) : null,
      input.spec.after != null ? JSON.stringify(input.spec.after) : null,
      input.spec.reason ?? null,
      input.now,
      input.source,
      input.rev,
      input.local_revision,
      input.correlation_id,
    ],
  );
}

/**
 * Führt eine kanonische Mutation atomar aus (siehe Modul-Doku). Wirft der
 * Callback (z. B. `ApiError`), wird die Transaktion zurückgerollt und kein
 * Event publiziert.
 */
export async function applyMutation<T>(
  input: ApplyMutationInput<T>,
): Promise<ApplyMutationResult<T>> {
  const now = Date.now();
  const hlc = input.client_hlc
    ? serverReceiveHlc(input.client_hlc)
    : serverSendHlc();
  const source = input.source ?? "api";
  const localRevision = input.local_revision ?? 0;
  const correlationId = input.correlation_id ?? null;

  const client = await pool.connect();
  let result: T;
  let rev: number;
  const events: EventSpec[] = [];
  try {
    await client.query("BEGIN");
    // Pro-Account serialisieren (Auto-Release bei COMMIT/ROLLBACK).
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      input.main_account_id,
    ]);
    // Nächste kanonische Revision aus der in-Transaktion geschriebenen Quelle.
    const revRes = await client.query<{ next: string | number }>(
      `SELECT COALESCE(MAX(server_revision), 0) + 1 AS next
         FROM audit_logs WHERE main_account_id = $1`,
      [input.main_account_id],
    );
    rev = toNum(revRes.rows[0]?.next ?? 1);

    const out = await input.run({ client, rev, hlc, now });
    result = out.result;

    const audits = Array.isArray(out.audit) ? out.audit : [out.audit];
    for (const spec of audits) {
      await insertAudit(client, {
        main_account_id: input.main_account_id,
        device_id: input.device_id,
        actor_id: input.actor_id,
        source,
        rev,
        local_revision: localRevision,
        correlation_id: correlationId,
        now,
        spec,
      });
    }

    if (out.event) {
      const evList = Array.isArray(out.event) ? out.event : [out.event];
      events.push(...evList);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Live-Kanal + Outbox NACH Commit; Event bekommt dieselbe Revision.
  for (const ev of events) {
    const envelope = await publishEvent({
      type: ev.type,
      main_account_id: input.main_account_id,
      device_id: input.device_id,
      entity_type: ev.entity_type,
      entity_id: ev.entity_id,
      operation: ev.operation,
      data: ev.data,
      correlation_id: correlationId ?? undefined,
      hlc,
      local_revision: localRevision,
    });
    await pool.query(
      `UPDATE sync_events SET server_revision = $1 WHERE id = $2`,
      [rev, envelope.event_id],
    );
  }

  return { result, server_revision: rev, hlc };
}

/** Grund-Codes für conflict_records.reason (doc 04 §6). */
export type ConflictReason =
  | "single_timer_violation"
  | "timer_stopped_remote"
  | "field_lww"
  | "description_divergence"
  | "delete_vs_edit"
  | "project_deleted_conflict"
  | "clock_skew";

/**
 * Schreibt einen `conflict_records`-Eintrag IN der laufenden Transaktion
 * (doc 04 §6.1 Nr. 8/9). Gibt die Conflict-ID zurück. `conflict_case` = die
 * Nummer 1–10 aus doc 04 §6.
 */
export async function insertConflictRecord(
  ctx: MutationContext,
  params: {
    main_account_id: string;
    entity_type: string;
    entity_id: string;
    conflict_case: number;
    local_version: Record<string, unknown>;
    server_version: Record<string, unknown>;
    suggested_merge?: Record<string, unknown> | null;
    reason: ConflictReason;
    correlation_id?: string | null;
  },
): Promise<string> {
  const id = uuidv7();
  await ctx.client.query(
    `INSERT INTO conflict_records
       (id, main_account_id, entity_type, entity_id, conflict_case,
        local_version_json, server_version_json, suggested_merge_json,
        resolution, reason, server_revision, correlation_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unresolved',$9,$10,$11,$12)`,
    [
      id,
      params.main_account_id,
      params.entity_type,
      params.entity_id,
      params.conflict_case,
      JSON.stringify(params.local_version),
      JSON.stringify(params.server_version),
      params.suggested_merge != null
        ? JSON.stringify(params.suggested_merge)
        : null,
      params.reason,
      ctx.rev,
      params.correlation_id ?? null,
      ctx.now,
    ],
  );
  return id;
}
