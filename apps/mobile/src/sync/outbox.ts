/**
 * outbox.ts — the durable offline queue, backed by the local `sync_events`
 * table (doc 04 §1 grundsatz 2, "Outbox-Muster").
 *
 * Every local mutation writes a row here transactionally with the data change
 * (the data-layer author calls `enqueue` inside the same DB transaction that
 * writes the entity). Unsent rows have `applied = 0` and a NULL
 * `server_revision`; they survive app crashes and offline periods and are
 * flushed in HLC order on reconnect. Idempotency is the row `id` (UUIDv7),
 * which the server dedups as `correlation_id`.
 *
 * This module only reads/writes the queue table — it performs NO network I/O
 * and NO business logic.
 */
import type { SQLiteDatabase } from "expo-sqlite";
import { newId } from "../lib/ids";
import type { SyncEventInput } from "../lib/serverClient";

/** A queued outbox row (subset of `sync_events` the client needs). */
export interface OutboxRow {
  id: string;
  main_account_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  payload_json: string;
  hlc: string;
  local_revision: number;
  server_revision: number | null;
  correlation_id: string | null;
  applied: number;
  created_at: number;
}

/** Fields required to enqueue a mutation (identity comes from the caller). */
export interface EnqueueInput {
  main_account_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  data: Record<string, unknown>;
  hlc: string;
  local_revision: number;
}

/**
 * Append a mutation to the outbox. Returns the generated event id (UUIDv7 =
 * idempotency key). Call inside the transaction that writes the entity so no
 * event is ever lost between the data write and the send.
 */
export function enqueue(db: SQLiteDatabase, input: EnqueueInput): string {
  const id = newId();
  const now = Date.now();
  db.runSync(
    `INSERT INTO sync_events
       (id, main_account_id, device_id, entity_type, entity_id, operation,
        payload_json, hlc, local_revision, server_revision, correlation_id,
        applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?)`,
    [
      id,
      input.main_account_id,
      input.device_id,
      input.entity_type,
      input.entity_id,
      input.operation,
      JSON.stringify(input.data),
      input.hlc,
      input.local_revision,
      id, // correlation_id = own event id (client idempotency key)
      now,
    ],
  );
  return id;
}

/** All un-sent events (applied = 0), oldest first (HLC/creation order). */
export function pending(db: SQLiteDatabase, limit = 500): OutboxRow[] {
  return db.getAllSync<OutboxRow>(
    `SELECT id, main_account_id, device_id, entity_type, entity_id, operation,
            payload_json, hlc, local_revision, server_revision, correlation_id,
            applied, created_at
       FROM sync_events
      WHERE applied = 0
      ORDER BY hlc ASC, created_at ASC
      LIMIT ?`,
    [limit],
  );
}

/** Count of pending (un-sent) events — for the sync status screen. */
export function pendingCount(db: SQLiteDatabase): number {
  const row = db.getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_events WHERE applied = 0`,
  );
  return row?.n ?? 0;
}

/** Map an outbox row into the wire shape for POST /api/sync/events. */
export function toEventInput(row: OutboxRow, baseVersion?: number | null): SyncEventInput {
  return {
    event_id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    hlc: row.hlc,
    local_revision: row.local_revision,
    base_version: baseVersion ?? null,
    data: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
}

/**
 * Mark events accepted by the server: set `applied = 1` and stamp the
 * account-wide `server_revision` high-water the push returned. Idempotent.
 */
export function markAccepted(
  db: SQLiteDatabase,
  eventIds: string[],
  serverRevision: number,
): void {
  if (eventIds.length === 0) return;
  const placeholders = eventIds.map(() => "?").join(",");
  db.runSync(
    `UPDATE sync_events
        SET applied = 1, server_revision = ?
      WHERE id IN (${placeholders})`,
    [serverRevision, ...eventIds],
  );
}
