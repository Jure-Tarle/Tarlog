/**
 * sync/types.ts — wire + local types for the OPTIONAL server-connection mode
 * (doc 04). Field names mirror `@ptl/db` sqlite (`sync_events`,
 * `conflict_records`, `sync_states`) and doc 06 EXACTLY so the client never
 * drifts from the data model.
 *
 * Everything here is inert without a server connection: the local-first mode
 * (doc 04 §1) is unaffected — these types only describe what crosses the wire
 * once a server is paired.
 */
import type { EpochMs, Uuid } from "@ptl/core";

// ---------------------------------------------------------------------------
// Connection / pairing (doc 04 §2 device model)
// ---------------------------------------------------------------------------

/** Live-channel kind, mirrors `devices.live_channel_status` (doc 04 §5.1). */
export type LiveChannelStatus = "websocket" | "sse" | "polling" | "none";

/** Everything needed to talk to a paired server. Absent ⇒ pure local mode. */
export interface ServerConfig {
  /** Server origin, e.g. "https://ptl.example.com" (no trailing slash). */
  baseUrl: string;
  /** Bearer device token issued at pairing (doc 04 §2, doc 09 sessions). */
  deviceToken: string;
  /** This device's UUIDv7 (`devices.device_id`). */
  deviceId: Uuid;
  /** Owning main account (`main_accounts.id`). */
  mainAccountId: Uuid;
}

/** Local description of this device sent when pairing (doc 04 §2). */
export interface DeviceInfo {
  device_name: string;
  platform: "macos" | "windows" | "web" | "ios";
  app_version: string;
}

/** Pairing input: the short code the user enters + how to reach the server. */
export interface PairingInput {
  baseUrl: string;
  /** One-time pairing code shown by the server UI. */
  pairingCode: string;
  device: DeviceInfo;
}

/** Server response to `POST /api/devices` (pairing). */
export interface PairingResponse {
  device_id: Uuid;
  device_token: string;
  main_account_id: Uuid;
  /** Server's current high-water revision at pairing time. */
  server_revision: number;
}

// ---------------------------------------------------------------------------
// Sync events (outbox row = `sync_events`, doc 04 §1.2/§1.3)
// ---------------------------------------------------------------------------

export type SyncOperation = "create" | "update" | "delete";

/** One local outbox event, shaped exactly like the `sync_events` row. */
export interface SyncEventRecord {
  id: Uuid;
  main_account_id: Uuid;
  device_id: Uuid;
  entity_type: string;
  entity_id: Uuid;
  operation: SyncOperation;
  /** Field-level delta (doc 04 §1.3). */
  payload_json: Record<string, unknown>;
  /** Hybrid Logical Clock stamp (doc 04 §1.1). */
  hlc: string;
  local_revision: number;
  server_revision: number | null;
  correlation_id: string | null;
  applied: boolean;
  created_at: EpochMs;
}

/** Event body as sent to / received from the server (JSON already parsed). */
export interface WireEvent {
  event_id: Uuid;
  entity_type: string;
  entity_id: Uuid;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  hlc: string;
  local_revision?: number;
  server_revision?: number;
}

/** `POST /api/sync/events` request body (doc 04 §1.4). */
export interface PushRequest {
  device_id: Uuid;
  /** Highest local_revision contained in this batch. */
  local_revision: number;
  events: WireEvent[];
}

/** `POST /api/sync/events` success body (200). */
export interface PushResponse {
  /** New canonical high-water mark (doc 04 §1.2 `server_revision`). */
  server_revision: number;
  accepted_event_ids: Uuid[];
  /** Conflicts the server auto-detected while accepting the batch. */
  conflicts?: ConflictPayload[];
}

/** `GET /api/sync/changes?since=` / `poll` body (doc 04 §1 step 7-8). */
export interface ChangesResponse {
  server_revision: number;
  events: WireEvent[];
  /** More deltas remain past this batch ⇒ pull again. */
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Conflicts (doc 04 §6) — NEVER silently drop a value
// ---------------------------------------------------------------------------

/** Server/detected conflict payload → persisted into `conflict_records`. */
export interface ConflictPayload {
  entity_type: string;
  entity_id: Uuid;
  /** Conflict case number 1..10 (doc 04 §6). */
  conflict_case: number;
  local_version: Record<string, unknown>;
  server_version: Record<string, unknown>;
  /** Optional auto-merge proposal (doc 04 §6.1 nr. 5). */
  suggested_merge?: Record<string, unknown>;
  reason?: string;
  server_revision?: number;
}

/** Resolution choices, mirrors `conflict_records.resolution`. */
export type ConflictResolution =
  | "unresolved"
  | "keep_local"
  | "keep_server"
  | "merged"
  | "manual";

/** One field-level difference for the conflict dialog (doc 04 §6.1 nr. 2). */
export interface ConflictFieldDiff {
  field: string;
  local: unknown;
  server: unknown;
  /** Values differ (true) vs. only present on one side. */
  differs: boolean;
}

/**
 * UI-ready view of a conflict (doc 04 §6.1): local version, server version,
 * optional combined proposal and a field diff. Feeds the conflict dialog so no
 * value is ever silently overwritten (grundsatz nr. 7).
 */
export interface ConflictView {
  id: Uuid;
  entity_type: string;
  entity_id: Uuid;
  conflict_case: number;
  /** Human label for the case, e.g. "Beschreibung divergiert". */
  case_label: string;
  local_version: Record<string, unknown>;
  server_version: Record<string, unknown>;
  suggested_merge: Record<string, unknown> | null;
  diffs: ConflictFieldDiff[];
  reason: string | null;
  resolution: ConflictResolution;
  created_at: EpochMs;
  resolved_at: EpochMs | null;
}

// ---------------------------------------------------------------------------
// Live channel (doc 04 §5.2) — the 14 live-update event types
// ---------------------------------------------------------------------------

/** The 14 live-update events (doc 04 §5.2). */
export type LiveEventType =
  | "timer_started"
  | "timer_paused"
  | "timer_resumed"
  | "timer_stopped"
  | "timer_description_added"
  | "project_changed"
  | "task_changed"
  | "break_added"
  | "entry_backdated"
  | "entry_updated"
  | "invoice_created"
  | "export_created"
  | "conflict_detected"
  | "sync_completed";

/** A message received over the live channel (WS / SSE / poll). */
export interface LiveEvent {
  type: LiveEventType;
  entity_type?: string;
  entity_id?: Uuid;
  /** Full or partial state to mirror locally (e.g. timer_states row). */
  payload?: Record<string, unknown>;
  hlc?: string;
  server_revision?: number;
}

// ---------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------

/**
 * Result of a push/pull round. Compatible in spirit with bridge `SyncResult`
 * (doc 04) — `serverRevision` is the new high-water mark.
 */
export interface SyncOutcome {
  ok: boolean;
  /** Events pushed (push) or pulled (pull). */
  count: number;
  serverRevision: number;
  /** Conflicts detected this round (doc 04 §6). */
  conflicts: number;
  /** True when the client was offline / not configured ⇒ buffered, no-op. */
  buffered: boolean;
}
