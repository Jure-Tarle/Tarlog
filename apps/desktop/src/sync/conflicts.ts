/**
 * sync/conflicts.ts — conflict persistence + UI view building (doc 04 §6).
 *
 * A conflict is NEVER auto-discarded. Every one is written to `conflict_records`
 * with both the local and the server version, then surfaced as a
 * {@link ConflictView} for the dialog (local, server, optional merge, field
 * diff — doc 04 §6.1). Resolution is always the user's decision.
 *
 * Backed by `src/lib/db.ts`; all access is failure-tolerant so a missing DB
 * never throws into the sync loop.
 */
import { uuidv7 } from "uuidv7";
import { execute, select } from "../lib/db";
import type {
  ConflictFieldDiff,
  ConflictPayload,
  ConflictResolution,
  ConflictView,
} from "./types";

/** Short German labels for the 10 conflict cases (doc 04 §6). */
const CASE_LABELS: Record<number, string> = {
  1: "Zwei aktive Timer",
  2: "Timer gestoppt vs. weitergelaufen",
  3: "Projekt gelöscht vs. Zeiterfassung",
  4: "Stundensatz geändert",
  5: "Rundungsregel geändert",
  6: "Eintrag doppelt bearbeitet",
  7: "Beschreibung divergiert",
  8: "Rechnung erstellt vs. neue Zeiten",
  9: "Eintrag gelöscht vs. bearbeitet",
  10: "Geräteuhr abweichend",
};

export function conflictCaseLabel(conflictCase: number): string {
  return CASE_LABELS[conflictCase] ?? `Konflikt ${conflictCase}`;
}

interface RawConflictRow {
  id: string;
  entity_type: string;
  entity_id: string;
  conflict_case: number;
  local_version_json: string | null;
  server_version_json: string | null;
  suggested_merge_json: string | null;
  resolution: ConflictResolution;
  reason: string | null;
  server_revision: number | null;
  created_at: number;
  resolved_at: number | null;
}

function parseObj(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseObjOrNull(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  const o = parseObj(raw);
  return Object.keys(o).length ? o : null;
}

/** Build the field-level diff between local and server versions (doc 04 §6.1 nr. 2). */
export function diffVersions(
  local: Record<string, unknown>,
  server: Record<string, unknown>,
): ConflictFieldDiff[] {
  const keys = new Set([...Object.keys(local), ...Object.keys(server)]);
  const diffs: ConflictFieldDiff[] = [];
  for (const field of keys) {
    const l = local[field];
    const s = server[field];
    const differs = JSON.stringify(l) !== JSON.stringify(s);
    if (differs) diffs.push({ field, local: l, server: s, differs });
  }
  return diffs;
}

/**
 * Persist a detected conflict (doc 04 §6.1 nr. 9). Returns the new
 * `conflict_records.id`, or null if persistence failed (the conflict is still
 * returned to the caller/UI so it is never lost).
 */
export async function recordConflict(
  mainAccountId: string,
  deviceId: string,
  payload: ConflictPayload,
  now: number,
): Promise<string | null> {
  const id = uuidv7();
  try {
    await execute(
      `INSERT INTO conflict_records
         (id, main_account_id, entity_type, entity_id, conflict_case,
          local_version_json, server_version_json, suggested_merge_json,
          resolution, reason, resolved_by_device, server_revision,
          correlation_id, created_at, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unresolved',$9,NULL,$10,NULL,$11,NULL)`,
      [
        id,
        mainAccountId,
        payload.entity_type,
        payload.entity_id,
        payload.conflict_case,
        JSON.stringify(payload.local_version ?? {}),
        JSON.stringify(payload.server_version ?? {}),
        payload.suggested_merge ? JSON.stringify(payload.suggested_merge) : null,
        payload.reason ?? null,
        payload.server_revision ?? null,
        now,
      ],
    );
    return id;
  } catch {
    return null;
  }
}

/** All unresolved conflicts as UI-ready views (doc 04 §6.1). [] on read failure. */
export async function listOpenConflicts(
  mainAccountId: string,
): Promise<ConflictView[]> {
  try {
    const rows = await select<RawConflictRow>(
      `SELECT id, entity_type, entity_id, conflict_case, local_version_json,
              server_version_json, suggested_merge_json, resolution, reason,
              server_revision, created_at, resolved_at
         FROM conflict_records
        WHERE main_account_id = $1 AND resolution = 'unresolved'
        ORDER BY created_at ASC`,
      [mainAccountId],
    );
    return rows.map(toView);
  } catch {
    return [];
  }
}

function toView(row: RawConflictRow): ConflictView {
  const local = parseObj(row.local_version_json);
  const server = parseObj(row.server_version_json);
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    conflict_case: row.conflict_case,
    case_label: conflictCaseLabel(row.conflict_case),
    local_version: local,
    server_version: server,
    suggested_merge: parseObjOrNull(row.suggested_merge_json),
    diffs: diffVersions(local, server),
    reason: row.reason,
    resolution: row.resolution,
    created_at: row.created_at,
    resolved_at: row.resolved_at,
  };
}

/**
 * Record the user's resolution (doc 04 §6.1 nr. 6/8). Marks the record and
 * stamps who/when. The actual data write (keep local / keep server / merged) is
 * emitted as a new outbox event by the caller so it re-syncs (nr. 10).
 */
export async function resolveConflict(
  conflictId: string,
  resolution: Exclude<ConflictResolution, "unresolved">,
  deviceId: string,
  now: number,
): Promise<void> {
  try {
    await execute(
      `UPDATE conflict_records
          SET resolution = $1, resolved_by_device = $2, resolved_at = $3
        WHERE id = $4`,
      [resolution, deviceId, now, conflictId],
    );
  } catch {
    // ignore — caller can retry; unresolved conflicts remain visible
  }
}
