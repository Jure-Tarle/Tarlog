/**
 * serverClient.ts — optional REST client against the self-hosted `apps/web` API
 * (doc 04 §1, §5; doc 05 §5.1, §9.3).
 *
 * Local-first is the rule: the mobile app is fully functional WITHOUT a server.
 * This client is the ONLY edge that talks to the server, and it stays INERT
 * until a device has been paired. When no server is configured every transport
 * call throws `ServerNotConfiguredError`, which the sync engine treats as
 * "offline / local-only" — it never surfaces to the user as an error.
 *
 * Authentication is a Bearer **device_token** (an `api_tokens` row on the
 * server) obtained once via the pairing flow (`POST /api/devices/connect` with
 * a short-lived pairing code). The token plus its identity (`device_id`,
 * `main_account_id`, `baseUrl`) is persisted in `expo-secure-store` — the token
 * is a credential and never touches AsyncStorage or the SQLite DB.
 *
 * This module contains ZERO business logic (no rounding/billing/compliance).
 * It is pure transport + credential storage. All field names mirror the server
 * contract in `apps/web/lib/sync/*` and `apps/web/lib/auth/*` exactly.
 */
import * as SecureStore from "expo-secure-store";

// ---------------------------------------------------------------------------
// Wire contract — mirrors apps/web/lib/sync/{schemas,service}.ts exactly.
// ---------------------------------------------------------------------------

/** One client mutation to upload (POST /api/sync/events). */
export interface SyncEventInput {
  /** UUIDv7 idempotency key (server dedups on correlation_id = event_id). */
  event_id: string;
  /** `@ptl/db` table name of the entity, e.g. "time_entries". */
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete";
  /** HLC timestamp `physical_ms:logical:device_id`. */
  hlc?: string | null;
  local_revision?: number | null;
  /** sync_version/server_revision base of the local change (LWW / conflict). */
  base_version?: number | null;
  data: Record<string, unknown>;
}

/** A field-level conflict the server refused to auto-resolve (never silent). */
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

/** Result of POST /api/sync/events (200) or its body on a 409 conflict. */
export interface PushResult {
  accepted: string[];
  conflicts: PushConflict[];
  rejected: PushRejection[];
  server_revision: number;
}

/** One change pulled from another device (GET /api/sync/changes|poll). */
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

/** GET /api/sync/poll adds `timed_out` to the changes result. */
export interface PollResult extends ChangesResult {
  timed_out: boolean;
}

/** One paired device as returned by GET /api/devices (non-sensitive fields). */
export interface DeviceSummary {
  id: string;
  device_name: string;
  platform: "macos" | "windows" | "web" | "ios";
  app_version: string;
  last_sync_at: number | null;
  sync_status: string;
  server_connected: boolean;
  permission_status: string;
  revoked: boolean;
  live_channel_status: string | null;
  connected_at: number | null;
}

/** Body for POST /api/devices/connect (public, pairing-code secured). */
export interface DeviceConnectInput {
  code: string;
  device_name: string;
  app_version: string;
  /** local schema/migration version (see lib/db SCHEMA_VERSION). */
  local_db_version?: number;
}

/** Response of a successful pairing — the device_token is returned ONCE. */
export interface DeviceConnectResult {
  device_id: string;
  main_account_id: string;
  device_token: string;
  token_prefix: string;
  scopes: string[];
}

/** Persisted server identity for this device (secure-store). */
export interface ServerConfig {
  /** Base URL of the self-hosted server, e.g. "https://ledger.example.com". */
  baseUrl: string;
  deviceToken: string;
  deviceId: string;
  mainAccountId: string;
}

// ---------------------------------------------------------------------------
// Typed errors — let the sync engine branch without string matching.
// ---------------------------------------------------------------------------

/** No server paired yet → the app runs purely local. NOT a user-facing error. */
export class ServerNotConfiguredError extends Error {
  readonly kind = "not_configured" as const;
  constructor() {
    super("Kein Server gekoppelt (lokaler Modus).");
    this.name = "ServerNotConfiguredError";
  }
}

/** Transport failed (offline, DNS, timeout). Caller should buffer + retry. */
export class NetworkError extends Error {
  readonly kind = "network" as const;
  constructor(cause?: unknown) {
    super("Serververbindung fehlgeschlagen.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Token invalid/revoked (401/403). Caller should stop and re-pair. */
export class AuthError extends Error {
  readonly kind = "auth" as const;
  constructor(readonly status: number) {
    super(`Geräte-Token abgelehnt (${status}).`);
    this.name = "AuthError";
  }
}

/** 409 on push — the server returned conflicts that must be surfaced. */
export class ConflictError extends Error {
  readonly kind = "conflict" as const;
  constructor(readonly result: PushResult) {
    super(`Sync-Konflikt (${result.conflicts.length}).`);
    this.name = "ConflictError";
  }
}

/** Any other non-2xx server response. */
export class ServerError extends Error {
  readonly kind = "server" as const;
  constructor(readonly status: number, readonly body: string) {
    super(`Serverfehler ${status}.`);
    this.name = "ServerError";
  }
}

// ---------------------------------------------------------------------------
// Credential storage (expo-secure-store).
// ---------------------------------------------------------------------------

const CONFIG_KEY = "ptl.serverConfig" as const;

let cache: ServerConfig | null | undefined; // undefined = not yet loaded

/** Load (and memoize) the persisted server config, or null if unpaired. */
export async function getServerConfig(): Promise<ServerConfig | null> {
  if (cache !== undefined) return cache;
  const raw = await SecureStore.getItemAsync(CONFIG_KEY);
  cache = raw ? (JSON.parse(raw) as ServerConfig) : null;
  return cache;
}

/** True when a server has been paired (client is live). */
export async function isConfigured(): Promise<boolean> {
  return (await getServerConfig()) !== null;
}

/** Persist a paired server identity (called after a successful connect). */
export async function setServerConfig(config: ServerConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
  cache = config;
}

/** Forget the server (unpair / device revoked). Returns to local-only mode. */
export async function clearServerConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
  cache = null;
}

// ---------------------------------------------------------------------------
// HTTP core.
// ---------------------------------------------------------------------------

/** Default per-request timeout (ms). The long-poll passes its own budget. */
const DEFAULT_TIMEOUT_MS = 15_000;

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  timeoutMs?: number;
  /** Override auth (used by the public pairing route, which has no token). */
  baseUrl?: string;
  token?: string | null;
}

/**
 * Perform an authenticated request against the paired server. Resolves the
 * parsed JSON body. Throws the typed errors above; 409 is returned to the
 * caller (not thrown) so push can inspect the conflict body.
 */
async function request<T>(opts: RequestOptions): Promise<{ status: number; body: T }> {
  let baseUrl = opts.baseUrl;
  let token = opts.token;
  if (baseUrl === undefined) {
    const cfg = await getServerConfig();
    if (!cfg) throw new ServerNotConfiguredError();
    baseUrl = cfg.baseUrl;
    token = cfg.deviceToken;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(joinUrl(baseUrl, opts.path), {
      method: opts.method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal,
    });
  } catch (cause) {
    // Network failure or abort → buffer + retry later.
    throw new NetworkError(cause);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new AuthError(res.status);

  const text = await res.text();
  const parsed = (text ? JSON.parse(text) : {}) as T;

  if (res.status >= 200 && res.status < 300) return { status: res.status, body: parsed };
  if (res.status === 409) return { status: res.status, body: parsed };
  throw new ServerError(res.status, text);
}

// ---------------------------------------------------------------------------
// Public API surface.
// ---------------------------------------------------------------------------

/**
 * Pair this device against a server using a short-lived pairing code
 * (POST /api/devices/connect, public). On success persists the returned
 * device_token + identity and returns it. After this the client is live.
 */
export async function connectDevice(
  baseUrl: string,
  input: DeviceConnectInput,
): Promise<DeviceConnectResult> {
  const { body } = await request<DeviceConnectResult>({
    method: "POST",
    path: "/api/devices/connect",
    baseUrl,
    token: null,
    body: {
      code: input.code,
      device_name: input.device_name,
      platform: "ios",
      app_version: input.app_version,
      local_db_version: input.local_db_version,
    },
  });
  await setServerConfig({
    baseUrl,
    deviceToken: body.device_token,
    deviceId: body.device_id,
    mainAccountId: body.main_account_id,
  });
  return body;
}

/**
 * Upload local events (POST /api/sync/events). On a 409 the server returned
 * conflicts — this throws `ConflictError` carrying the full body so the caller
 * can persist accepted ids AND surface the conflicts (never silently drop).
 */
export async function pushEvents(events: SyncEventInput[]): Promise<PushResult> {
  if (events.length === 0) {
    return { accepted: [], conflicts: [], rejected: [], server_revision: 0 };
  }
  const { status, body } = await request<PushResult>({
    method: "POST",
    path: "/api/sync/events",
    body: { events },
  });
  if (status === 409) throw new ConflictError(body);
  return body;
}

/** Pull the delta of foreign-device changes since a high-water mark. */
export async function getChanges(since: number, limit = 200): Promise<ChangesResult> {
  const { body } = await request<ChangesResult>({
    method: "GET",
    path: `/api/sync/changes?since=${encodeURIComponent(since)}&limit=${encodeURIComponent(limit)}`,
  });
  return body;
}

/**
 * Long-poll for live changes since a high-water mark (GET /api/sync/poll). Used
 * to mirror a running timer across devices when WebSocket/SSE are unavailable.
 * `timeoutMs` is the server-side hold budget (≤25s); the client waits a little
 * longer before treating the request as a network timeout.
 */
export async function poll(since: number, timeoutMs = 25_000, limit = 200): Promise<PollResult> {
  const clamped = Math.min(Math.max(1000, timeoutMs), 25_000);
  const { body } = await request<PollResult>({
    method: "GET",
    path: `/api/sync/poll?since=${encodeURIComponent(since)}&timeout=${encodeURIComponent(clamped)}&limit=${encodeURIComponent(limit)}`,
    timeoutMs: clamped + 5_000,
  });
  return body;
}

/** List the account's paired devices (GET /api/devices). */
export async function listDevices(): Promise<DeviceSummary[]> {
  const { body } = await request<{ devices: DeviceSummary[] }>({
    method: "GET",
    path: "/api/devices",
  });
  return body.devices;
}
