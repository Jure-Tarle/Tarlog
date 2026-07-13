/**
 * sync/outbox.ts — the local event outbox, backed by the `sync_events` table
 * (doc 04 §1.2 outbox pattern). This module reads the rows already produced by
 * integrated local mutation paths and marks them accepted once the server
 * confirms. Complete mutation-to-outbox wiring remains preview work.
 *
 * Reads/writes go through `src/lib/db.ts` (the shared SQLite surface). Database
 * failures propagate: a locked or unavailable outbox must never be presented
 * as an empty queue or a successful push.
 *
 * Incoming events follow a strict two-phase contract: stage the raw event with
 * `applied=0`, merge it into the entity tables through the engine callback,
 * then mark it `applied=1`. Staging/acknowledgement errors intentionally
 * propagate so the pull cursor can never advance past unpersisted data.
 */
import { execute, select } from "../lib/db";
import type { SyncEventRecord, SyncOperation, WireEvent } from "./types";

interface RawEventRow {
  id: string;
  main_account_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation: SyncOperation;
  payload_json: string | null;
  hlc: string;
  local_revision: number;
  server_revision: number | null;
  correlation_id: string | null;
  applied: number | null;
  created_at: number;
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toRecord(row: RawEventRow): SyncEventRecord {
  return {
    id: row.id,
    main_account_id: row.main_account_id,
    device_id: row.device_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    operation: row.operation,
    payload_json: parseJsonObject(row.payload_json),
    hlc: row.hlc,
    local_revision: row.local_revision,
    server_revision: row.server_revision,
    correlation_id: row.correlation_id,
    applied: !!row.applied,
    created_at: row.created_at,
  };
}

/**
 * Pending outbox events for a main account, HLC-ordered (doc 04 §1.4 push in
 * HLC order). "Pending" = not yet confirmed by the server (`server_revision`
 * IS NULL). Read failures propagate so callers cannot mistake an unavailable
 * database for an empty queue.
 */
export async function loadPendingEvents(
  mainAccountId: string,
  limit = 500,
): Promise<SyncEventRecord[]> {
  const rows = await select<RawEventRow>(
    `SELECT id, main_account_id, device_id, entity_type, entity_id, operation,
            payload_json, hlc, local_revision, server_revision, correlation_id,
            applied, created_at
       FROM sync_events
      WHERE main_account_id = $1 AND server_revision IS NULL
      ORDER BY local_revision ASC, hlc ASC
      LIMIT $2`,
    [mainAccountId, limit],
  );
  return rows.map(toRecord);
}

/** Count of unpushed events — drives the per-device pending badge (doc 04 §2). */
export async function countPendingEvents(
  mainAccountId: string,
): Promise<number> {
  const rows = await select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sync_events
      WHERE main_account_id = $1 AND server_revision IS NULL`,
    [mainAccountId],
  );
  return rows[0]?.n ?? 0;
}

/** A local event → wire shape (doc 04 §1.4). */
export function toWireEvent(e: SyncEventRecord): WireEvent {
  return {
    event_id: e.id,
    entity_type: e.entity_type,
    entity_id: e.entity_id,
    operation: e.operation,
    payload: e.payload_json,
    hlc: e.hlc,
    local_revision: e.local_revision,
  };
}

/**
 * Mark events accepted by the server: stamp `server_revision` and `applied=1`.
 * Idempotent — re-marking already-pushed events is harmless (doc 04 §1.4).
 */
export async function markEventsPushed(
  eventIds: string[],
  serverRevision: number,
): Promise<void> {
  const uniqueIds = [...new Set(eventIds)];
  if (uniqueIds.length === 0) return;
  const placeholders = uniqueIds.map((_, i) => `$${i + 2}`).join(", ");
  const result = await execute(
    `UPDATE sync_events
        SET server_revision = $1, applied = 1
      WHERE id IN (${placeholders})`,
    [serverRevision, ...uniqueIds],
  );
  if (result.rowsAffected !== uniqueIds.length) {
    throw new Error("Nicht alle gesendeten Sync-Events konnten bestätigt werden.");
  }
}

/**
 * Durably stage one incoming server event before any entity merge.
 *
 * Returns `true` while the event still needs to be applied. A retry of an event
 * already acknowledged with `applied=1` returns `false`, which keeps a failed
 * cursor write from causing the business mutation to run twice.
 *
 * Unlike the read-only local helpers above, this function MUST throw on every
 * database error. The engine then leaves its high-water cursor unchanged.
 */
export async function stageIncomingEvent(
  mainAccountId: string,
  deviceId: string,
  e: WireEvent,
  now: number,
): Promise<boolean> {
  await execute(
    `INSERT INTO sync_events
       (id, main_account_id, device_id, entity_type, entity_id, operation,
        payload_json, hlc, local_revision, server_revision, correlation_id,
        applied, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,$12)
     ON CONFLICT(id) DO UPDATE SET
       server_revision = COALESCE(sync_events.server_revision, excluded.server_revision)`,
    [
      e.event_id,
      mainAccountId,
      deviceId,
      e.entity_type,
      e.entity_id,
      e.operation,
      JSON.stringify(e.payload ?? {}),
      e.hlc,
      e.local_revision ?? 0,
      e.server_revision ?? null,
      null,
      now,
    ],
  );
  const rows = await select<{ applied: number | null }>(
    `SELECT applied FROM sync_events WHERE id = $1 LIMIT 1`,
    [e.event_id],
  );
  const staged = rows[0];
  if (!staged) {
    throw new Error(`Eingehendes Sync-Event '${e.event_id}' wurde nicht dauerhaft gespeichert.`);
  }
  return !Boolean(staged.applied);
}

/**
 * Acknowledge raw events only after the entity merge completed successfully.
 * Every requested event must still exist; otherwise the caller keeps the pull
 * cursor unchanged and can retry safely.
 */
export async function markIncomingEventsApplied(eventIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(eventIds)];
  if (uniqueIds.length === 0) return;
  const placeholders = uniqueIds.map((_, index) => `$${index + 1}`).join(", ");
  const result = await execute(
    `UPDATE sync_events SET applied = 1 WHERE id IN (${placeholders})`,
    uniqueIds,
  );
  if (result.rowsAffected !== uniqueIds.length) {
    throw new Error("Nicht alle eingehenden Sync-Events konnten bestätigt werden.");
  }
}
