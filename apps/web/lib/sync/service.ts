/**
 * lib/sync/service.ts, Sync-Protokoll (doc 04 §1, §5).
 *
 * push  (POST /api/sync/events): idempotente Anwendung von Client-Events
 *   (Dedup über correlation_id = Client-event_id). Zeiteinträge/Pausen werden
 *   über den kanonischen Zeiteintrag-Service angewandt (inkl. Feld-Level-LWW-
 *   Konflikterkennung → conflict_records). Konflikt → in `conflicts` mit
 *   lokaler + Server-Version; die Route antwortet dann 409.
 * changes (GET /api/sync/changes?since=): Delta-Pull der sync_events fremder
 *   Geräte ab `since` (server_revision-Hochwassermarke).
 * poll    (GET /api/sync/poll): Long-Poll ≤25s über denselben Delta-Query
 *   (Polling-Fallback der Live-Kanal-Kaskade, doc 04 §5.1).
 */
import { uuidv7 } from "uuidv7";
import { pool } from "@/lib/db";
import { publishEvent } from "@/lib/events";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import { MutationAlreadyAppliedError, toNum } from "./mutation.js";
import { timeEntryCreateSchema, timeEntryUpdateSchema } from "@/lib/timer/schemas";
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
} from "@/lib/timer/entries";
import { loadBreaksForEntry } from "@/lib/timer/repository";
import type { SyncEventInput } from "./schemas.js";

async function alreadyApplied(mainAccountId: string, correlationId: string): Promise<boolean> {
  const r = await pool.query(
    `SELECT 1 FROM sync_events WHERE main_account_id=$1 AND correlation_id=$2 LIMIT 1`,
    [mainAccountId, correlationId],
  );
  return (r.rowCount ?? 0) > 0;
}

async function highWater(mainAccountId: string): Promise<number> {
  const r = await pool.query<{ hw: string | number }>(
    `SELECT COALESCE(MAX(server_revision),0) AS hw FROM sync_events WHERE main_account_id=$1`,
    [mainAccountId],
  );
  return toNum(r.rows[0]?.hw ?? 0);
}

export interface PushConflict {
  event_id: string;
  conflict_case: number;
  conflict_id?: string;
  message: string;
  server_version?: unknown;
}

export interface PushRejection {
  event_id: string;
  error: string;
}

export interface PushResult {
  accepted: string[];
  conflicts: PushConflict[];
  rejected: PushRejection[];
  server_revision: number;
}

/** Baut ein `TimeEntryUpdateBody`-artiges Objekt aus einem Sync-Event. */
function updateBody(ev: SyncEventInput): Record<string, unknown> {
  return {
    ...ev.data,
    expected_sync_version:
      ev.base_version ?? (ev.data.expected_sync_version as number | undefined),
    correlation_id: ev.event_id,
    hlc: ev.hlc ?? undefined,
    local_revision: ev.local_revision ?? undefined,
  };
}

function createBody(ev: SyncEventInput): Record<string, unknown> {
  return {
    ...ev.data,
    source: (ev.data.source as string | undefined) ?? "manual_backdated",
    correlation_id: ev.event_id,
    hlc: ev.hlc ?? undefined,
    local_revision: ev.local_revision ?? undefined,
  };
}

async function applyBreakCreate(auth: AuthContext, ev: SyncEventInput): Promise<void> {
  const entryId = (ev.data.time_entry_id as string | undefined) ?? ev.entity_id;
  const started = ev.data.started_at as number | undefined;
  const ended = ev.data.ended_at as number | undefined;
  if (!entryId || started == null || ended == null) {
    throw new ApiError("validation_error", "Pause benötigt time_entry_id, started_at, ended_at.");
  }
  const existing = await loadBreaksForEntry(pool, entryId);
  const merged = [...existing, { started_at: started, ended_at: ended }].map((b) => ({
    started_at: b.started_at,
    ended_at: b.ended_at as number,
  }));
  await updateTimeEntry(auth, entryId, {
    breaks: merged,
    correlation_id: ev.event_id,
    hlc: ev.hlc ?? undefined,
    local_revision: ev.local_revision ?? undefined,
  } as Parameters<typeof updateTimeEntry>[2]);
}

/** Wendet ein einzelnes Sync-Event an. Wirft ApiError('conflict') bei Konflikt. */
async function applyEvent(auth: AuthContext, ev: SyncEventInput): Promise<void> {
  switch (ev.entity_type) {
    case "time_entries": {
      if (ev.operation === "create") {
        const parsed = timeEntryCreateSchema.safeParse(createBody(ev));
        if (!parsed.success) {
          throw new ApiError("validation_error", "Ungültiges create-Event.", parsed.error.issues);
        }
        await createTimeEntry(auth, parsed.data);
        return;
      }
      if (ev.operation === "update") {
        const parsed = timeEntryUpdateSchema.safeParse(updateBody(ev));
        if (!parsed.success) {
          throw new ApiError("validation_error", "Ungültiges update-Event.", parsed.error.issues);
        }
        await updateTimeEntry(auth, ev.entity_id, parsed.data);
        return;
      }
      // delete
      await deleteTimeEntry(auth, ev.entity_id, ev.event_id, ev.local_revision ?? undefined);
      return;
    }
    case "time_entry_breaks": {
      if (ev.operation === "create") {
        await applyBreakCreate(auth, ev);
        return;
      }
      throw new ApiError("bad_request", `time_entry_breaks-Operation '${ev.operation}' nicht unterstützt.`);
    }
    default:
      throw new ApiError(
        "bad_request",
        `Sync für entity_type '${ev.entity_type}' nicht unterstützt (Timer-States laufen über die Timer-REST-Ops).`,
      );
  }
}

export async function pushEvents(auth: AuthContext, events: SyncEventInput[]): Promise<PushResult> {
  const mainAccountId = auth.main_account_id;
  const accepted: string[] = [];
  const conflicts: PushConflict[] = [];
  const rejected: PushRejection[] = [];

  for (const ev of events) {
    if (await alreadyApplied(mainAccountId, ev.event_id)) {
      accepted.push(ev.event_id); // Idempotenz, bereits angewandt.
      continue;
    }
    try {
      await applyEvent(auth, ev);
      accepted.push(ev.event_id);
    } catch (err) {
      if (err instanceof MutationAlreadyAppliedError) {
        accepted.push(ev.event_id);
      } else if (err instanceof ApiError && err.code === "conflict") {
        const details = (err.details ?? {}) as Record<string, unknown>;
        conflicts.push({
          event_id: ev.event_id,
          conflict_case: (details.conflict_case as number) ?? 0,
          conflict_id: details.conflict_id as string | undefined,
          message: err.message,
          server_version: details.server_version,
        });
      } else if (err instanceof ApiError) {
        rejected.push({ event_id: ev.event_id, error: `${err.code}: ${err.message}` });
      } else {
        rejected.push({ event_id: ev.event_id, error: "internal_error" });
      }
    }
  }

  const hw = await highWater(mainAccountId);

  // Gerätestatus + Abschluss-Signal (doc 04 §5.2 Nr. 14).
  if (auth.device_id) {
    const now = Date.now();
    await pool.query(
      `UPDATE devices SET sync_status='synced', last_sync_at=$1, updated_at=$1 WHERE id=$2`,
      [now, auth.device_id],
    );
    await pool.query(
      `INSERT INTO sync_states (id, main_account_id, device_id, last_pushed_server_revision, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (device_id) DO UPDATE
         SET last_pushed_server_revision=EXCLUDED.last_pushed_server_revision,
             updated_at=EXCLUDED.updated_at`,
      [uuidv7(), mainAccountId, auth.device_id, hw, now],
    );
    await publishEvent({
      type: "sync.completed",
      main_account_id: mainAccountId,
      device_id: auth.device_id,
      entity_type: "sync_states",
      entity_id: auth.device_id,
      operation: "update",
      data: { device_id: auth.device_id, server_revision: hw, accepted: accepted.length },
    });
  }

  return { accepted, conflicts, rejected, server_revision: hw };
}

export interface ChangeEvent {
  event_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  data: Record<string, unknown>;
  hlc: string | null;
  local_revision: number;
  server_revision: number;
  correlation_id: string | null;
  created_at: number;
}

export interface ChangesResult {
  events: ChangeEvent[];
  server_revision: number;
  has_more: boolean;
}

/** Delta-Pull ab `since` (fremde Geräte). Aktualisiert die Pull-Hochwassermarke. */
export async function pullChanges(
  auth: AuthContext,
  params: { since: number; limit: number },
): Promise<ChangesResult> {
  const mainAccountId = auth.main_account_id;
  const values: unknown[] = [mainAccountId, params.since];
  let deviceClause = "";
  if (auth.device_id) {
    values.push(auth.device_id);
    deviceClause = `AND device_id <> $${values.length}`;
  }
  values.push(params.limit + 1);
  const res = await pool.query(
    `SELECT id, entity_type, entity_id, operation, payload_json, hlc, local_revision,
            server_revision, correlation_id, created_at
       FROM sync_events
      WHERE main_account_id=$1 AND server_revision IS NOT NULL AND server_revision > $2
        ${deviceClause}
      ORDER BY server_revision ASC
      LIMIT $${values.length}`,
    values,
  );
  const rows = res.rows;
  const hasMore = rows.length > params.limit;
  const sliced = hasMore ? rows.slice(0, params.limit) : rows;
  const events: ChangeEvent[] = sliced.map((r) => ({
    event_id: r.id,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
    operation: r.operation,
    data: (r.payload_json ?? {}) as Record<string, unknown>,
    hlc: r.hlc ?? null,
    local_revision: toNum(r.local_revision),
    server_revision: toNum(r.server_revision),
    correlation_id: r.correlation_id ?? null,
    created_at: toNum(r.created_at),
  }));

  const hw = await highWater(mainAccountId);
  if (auth.device_id) {
    const now = Date.now();
    const lastEvent = events.length > 0 ? events[events.length - 1] : undefined;
    const pulledTo = lastEvent
      ? lastEvent.server_revision
      : Math.min(params.since, hw);
    await pool.query(
      `INSERT INTO sync_states (id, main_account_id, device_id, last_pulled_server_revision, updated_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (device_id) DO UPDATE
         SET last_pulled_server_revision=GREATEST(sync_states.last_pulled_server_revision, EXCLUDED.last_pulled_server_revision),
             updated_at=EXCLUDED.updated_at`,
      [uuidv7(), mainAccountId, auth.device_id, pulledTo, now],
    );
  }
  return { events, server_revision: hw, has_more: hasMore };
}

const POLL_INTERVAL_MS = 1000;

/** Long-Poll: wartet bis Delta vorliegt oder `timeoutMs` (≤25s) abläuft. */
export async function pollChanges(
  auth: AuthContext,
  params: { since: number; limit: number; timeoutMs: number },
): Promise<ChangesResult & { timed_out: boolean }> {
  const deadline = Date.now() + Math.min(params.timeoutMs, 25000);
  // Erste Prüfung sofort.
  let result = await pullChanges(auth, { since: params.since, limit: params.limit });
  while (result.events.length === 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    result = await pullChanges(auth, { since: params.since, limit: params.limit });
  }
  return { ...result, timed_out: result.events.length === 0 };
}
