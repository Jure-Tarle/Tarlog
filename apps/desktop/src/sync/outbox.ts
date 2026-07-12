/**
 * sync/outbox.ts — the local event outbox, backed by the `sync_events` table
 * (doc 04 §1.2 outbox pattern). Every local mutation writes a row here
 * transactionally with its record; this module reads the pending rows to push
 * and marks them accepted once the server confirms.
 *
 * Reads/writes go through `src/lib/db.ts` (the shared SQLite surface). All
 * access is wrapped so a missing/locked DB degrades to "no pending events"
 * rather than throwing — the client must stay inert offline.
 *
 * NOTE: applying INCOMING server changes into the entity tables (time_entries,
 * timer_states, …) is the data-layer author's job; this module only persists
 * the raw incoming events and advances the high-water mark, then hands the
 * parsed events to the engine's `onChanges` callback.
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
 * IS NULL). Returns [] on any read failure (offline/no DB).
 */
export async function loadPendingEvents(
  mainAccountId: string,
  limit = 500,
): Promise<SyncEventRecord[]> {
  try {
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
  } catch {
    return [];
  }
}

/** Count of unpushed events — drives the per-device pending badge (doc 04 §2). */
export async function countPendingEvents(
  mainAccountId: string,
): Promise<number> {
  try {
    const rows = await select<{ n: number }>(
      `SELECT COUNT(*) AS n FROM sync_events
        WHERE main_account_id = $1 AND server_revision IS NULL`,
      [mainAccountId],
    );
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
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
  if (eventIds.length === 0) return;
  const placeholders = eventIds.map((_, i) => `$${i + 2}`).join(", ");
  try {
    await execute(
      `UPDATE sync_events
          SET server_revision = $1, applied = 1
        WHERE id IN (${placeholders})`,
      [serverRevision, ...eventIds],
    );
  } catch {
    // Best-effort: on failure the events stay pending and re-push next round
    // (idempotent via event id) — no data loss.
  }
}

/**
 * Persist an incoming server event locally (doc 04 §1 step 8). Stored with
 * `applied=1` and the server revision as the canonical marker. Merging into the
 * entity tables is the data layer's responsibility; this is the durable log.
 */
export async function recordIncomingEvent(
  mainAccountId: string,
  deviceId: string,
  e: WireEvent,
  now: number,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO sync_events
         (id, main_account_id, device_id, entity_type, entity_id, operation,
          payload_json, hlc, local_revision, server_revision, correlation_id,
          applied, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,$12)
       ON CONFLICT(id) DO UPDATE SET
         server_revision = excluded.server_revision,
         applied = 1`,
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
  } catch {
    // ignore — engine still surfaces the event via onChanges for the data layer
  }
}
