/**
 * serverClient.ts — REST client for the OPTIONAL self-hosted sync server
 * (doc 04). Handles device pairing and the sync endpoints with a Bearer device
 * token. Native Tauri builds use the scoped Rust HTTP plugin; tests and
 * non-Tauri previews fall back to the platform `fetch` implementation.
 *
 * INERT WITHOUT A SERVER: this class is only constructed once a `ServerConfig`
 * exists. The local-first mode (doc 04 §1) never touches it — the {@link SyncEngine}
 * short-circuits when unconfigured, so pure local usage stays unaffected.
 *
 * Endpoints (doc 04):
 *   - POST /api/devices/connect — pairing (code → device_token)
 *   - POST /api/sync/events    — push outbox (local_revision + hlc)
 *   - GET  /api/sync/changes   — pull delta since a revision
 *   - GET  /api/sync/poll      — long-poll fallback for live updates
 *   - WS   /api/ws             — live channel (see sync/liveChannel.ts)
 */
import type {
  ChangesResponse,
  ConflictPayload,
  PairingInput,
  PairingResponse,
  PushRequest,
  PushRejection,
  PushResponse,
  ServerConfig,
  SyncOperation,
  WireEvent,
} from "../sync/types";
import { fetchSyncServer, NativeHttpTransportError } from "./nativeHttp";

/** Non-2xx server response (other than a 409 conflict). */
export class ServerHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`server ${status} for ${url}: ${body.slice(0, 200)}`);
    this.name = "ServerHttpError";
  }
}

/** Network-level failure (offline, DNS, TLS). Triggers offline buffering. */
export class ServerUnreachableError extends Error {
  constructor(
    readonly url: string,
    override readonly cause: unknown,
  ) {
    super(`server unreachable: ${url}`);
    this.name = "ServerUnreachableError";
  }
}

/** A successful HTTP response did not match the deployed Tarlog API contract. */
export class ServerProtocolError extends Error {
  constructor(
    readonly url: string,
    readonly detail: string,
  ) {
    super(`unexpected server response for ${url}: ${detail}`);
    this.name = "ServerProtocolError";
  }
}

/**
 * HTTP 409 on push — the server rejected part of the batch as conflicting
 * (doc 04 §6). Carries the conflict payloads so the engine can persist them to
 * `conflict_records` and open the dialog — NEVER a silent drop.
 */
export class ServerConflictError extends Error {
  constructor(
    readonly serverRevision: number,
    readonly conflicts: ConflictPayload[],
    readonly acceptedEventIds: string[] = [],
    readonly rejected: PushRejection[] = [],
  ) {
    super(`server conflict: ${conflicts.length} record(s)`);
    this.name = "ServerConflictError";
  }
}

/** Trim a trailing slash so URL joins are predictable. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  const octets = host.split(".");
  return octets.length === 4 && octets[0] === "127" && octets.every((part) => {
    const value = Number(part);
    return /^\d{1,3}$/.test(part) && value >= 0 && value <= 255;
  });
}

/** Validate and normalize the self-hosted Tarlog base URL before any request. */
export function normalizeServerBaseUrl(input: string): string {
  const value = input.trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Server-Adresse muss eine vollständige http(s)-URL sein.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Server-Adresse muss mit http:// oder https:// beginnen.");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("Außerhalb dieses Geräts ist für Sync eine HTTPS-Adresse erforderlich.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Server-Adresse darf keine Zugangsdaten enthalten.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Server-Adresse darf keine Query oder Raute enthalten.");
  }
  return normalizeBaseUrl(parsed.toString());
}

/** Normalize the human-friendly `ABCD-EF23` code and reject impossible codes. */
export function normalizePairingCode(input: string): string {
  const compact = input.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(compact)) {
    throw new Error("Pairing-Code muss aus acht gültigen Zeichen bestehen.");
  }
  return compact;
}

/** Derive the ws(s):// origin for the live channel from an http(s) base URL. */
export function toWebSocketUrl(baseUrl: string, path = "/api/ws"): string {
  const base = normalizeBaseUrl(baseUrl);
  const wsBase = base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}${path}`;
}

/**
 * Pair this device with a server. `POST /api/devices/connect` with the one-time code;
 * the server returns a durable `device_token` used as the Bearer thereafter
 * (doc 04 §2). Standalone (no token yet), so it is a static factory.
 */
export async function pairDevice(input: PairingInput): Promise<PairingResponse> {
  const base = normalizeServerBaseUrl(input.baseUrl);
  const code = normalizePairingCode(input.pairingCode);
  const url = `${base}/api/devices/connect`;
  let res: Response;
  try {
    res = await fetchSyncServer(base, url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        device_name: input.device.device_name,
        platform: input.device.platform,
        app_version: input.device.app_version,
        ...(input.device.local_db_version === undefined
          ? {}
          : { local_db_version: input.device.local_db_version }),
      }),
    });
  } catch (cause) {
    if (cause instanceof NativeHttpTransportError) throw cause;
    throw new ServerUnreachableError(url, cause);
  }
  if (!res.ok) {
    throw new ServerHttpError(res.status, url, await safeText(res));
  }
  const body = await readJson(res, url);
  if (!isRecord(body)) {
    throw new ServerProtocolError(url, "JSON-Objekt erwartet");
  }
  const deviceId = requiredString(body, "device_id", url);
  const deviceToken = requiredString(body, "device_token", url);
  const mainAccountId = requiredString(body, "main_account_id", url);
  return {
    device_id: deviceId,
    device_token: deviceToken,
    main_account_id: mainAccountId,
    // The current connect route does not expose a high-water mark. Starting at
    // zero is safe: the first pull obtains the complete delta.
    server_revision: numberOr(body.server_revision, 0),
  } as PairingResponse;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function readJson(res: Response, url: string): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new ServerProtocolError(url, "ungültiges JSON");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  url: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new ServerProtocolError(url, `Feld '${key}' fehlt`);
  }
  return field;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

interface ApiPushConflict {
  event_id: string;
  conflict_case: number;
  message: string;
  server_version?: unknown;
}

interface ApiPushResponse {
  accepted: string[];
  conflicts: ApiPushConflict[];
  rejected: PushRejection[];
  server_revision: number;
}

interface ApiChangeEvent {
  event_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  data: Record<string, unknown>;
  hlc: string | null;
  local_revision: number;
  server_revision: number;
}

interface ApiChangesResponse {
  events: ApiChangeEvent[];
  server_revision: number;
  has_more: boolean;
}

function objectVersion(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : value === undefined ? {} : { value };
}

function parsePushResponse(
  body: unknown,
  req: PushRequest,
  url: string,
): PushResponse {
  if (!isRecord(body)) {
    throw new ServerProtocolError(url, "Push-Antwort ist kein JSON-Objekt");
  }
  if (!Array.isArray(body.accepted) || !Array.isArray(body.conflicts) || !Array.isArray(body.rejected)) {
    throw new ServerProtocolError(url, "Push-Antwort enthält keine Ergebnislisten");
  }
  const serverRevision = numberOr(body.server_revision, Number.NaN);
  if (!Number.isFinite(serverRevision)) {
    throw new ServerProtocolError(url, "Feld 'server_revision' fehlt");
  }

  const accepted = body.accepted.filter((id): id is string => typeof id === "string");
  const rejected = body.rejected.flatMap((raw): PushRejection[] => {
    if (!isRecord(raw) || typeof raw.event_id !== "string" || typeof raw.error !== "string") return [];
    return [{ event_id: raw.event_id, error: raw.error } as PushRejection];
  });
  const byId = new Map(req.events.map((event) => [event.event_id, event]));
  const conflicts = body.conflicts.flatMap((raw): ConflictPayload[] => {
    if (!isRecord(raw) || typeof raw.event_id !== "string") return [];
    const source = byId.get(raw.event_id);
    if (!source) return [];
    const apiConflict = raw as unknown as ApiPushConflict;
    return [{
      entity_type: source.entity_type,
      entity_id: source.entity_id,
      conflict_case: numberOr(apiConflict.conflict_case, 0),
      local_version: source.payload,
      server_version: objectVersion(apiConflict.server_version),
      reason: typeof apiConflict.message === "string" ? apiConflict.message : undefined,
      server_revision: serverRevision,
    }];
  });

  return {
    server_revision: serverRevision,
    accepted_event_ids: accepted,
    conflicts,
    rejected,
  };
}

function parseOperation(value: string, url: string): SyncOperation {
  if (value === "create" || value === "update" || value === "delete") return value;
  throw new ServerProtocolError(url, `unbekannte Sync-Operation '${value}'`);
}

function parseChangesResponse(body: unknown, url: string): ChangesResponse {
  if (!isRecord(body) || !Array.isArray(body.events) || typeof body.has_more !== "boolean") {
    throw new ServerProtocolError(url, "Delta-Antwort ist unvollständig");
  }
  const serverRevision = numberOr(body.server_revision, Number.NaN);
  if (!Number.isFinite(serverRevision)) {
    throw new ServerProtocolError(url, "Feld 'server_revision' fehlt");
  }

  const api = body as unknown as ApiChangesResponse;
  const events: WireEvent[] = api.events.map((event) => {
    if (
      !isRecord(event) ||
      typeof event.event_id !== "string" ||
      typeof event.entity_type !== "string" ||
      typeof event.entity_id !== "string" ||
      !isRecord(event.data)
    ) {
      throw new ServerProtocolError(url, "Delta enthält ein ungültiges Event");
    }
    return {
      event_id: event.event_id,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      operation: parseOperation(event.operation, url),
      payload: event.data,
      hlc: typeof event.hlc === "string" ? event.hlc : "",
      local_revision: numberOr(event.local_revision, 0),
      server_revision: numberOr(event.server_revision, serverRevision),
    } as WireEvent;
  });
  return { events, server_revision: serverRevision, has_more: api.has_more };
}

/** Authenticated REST client bound to one paired server. */
export class ServerClient {
  private readonly base: string;

  constructor(private readonly config: ServerConfig) {
    this.base = normalizeBaseUrl(config.baseUrl);
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.config.deviceToken}`,
    };
  }

  private async fetchJson<T>(
    path: string,
    init: RequestInit,
    allowConflict = false,
  ): Promise<{ status: number; json: T; url: string }> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await fetchSyncServer(this.base, url, {
        ...init,
        headers: this.headers(),
      });
    } catch (cause) {
      if (cause instanceof NativeHttpTransportError) throw cause;
      throw new ServerUnreachableError(url, cause);
    }
    if (!res.ok && !(allowConflict && res.status === 409)) {
      throw new ServerHttpError(res.status, url, await safeText(res));
    }
    return { status: res.status, json: (await readJson(res, url)) as T, url };
  }

  /** Push the outbox batch (doc 04 §1.4). Throws {@link ServerConflictError} on 409. */
  async pushEvents(req: PushRequest): Promise<PushResponse> {
    const body = {
      events: req.events.map((event) => ({
        event_id: event.event_id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        operation: event.operation,
        hlc: event.hlc,
        local_revision: event.local_revision,
        data: event.payload,
      })),
    };
    const { status, json, url } = await this.fetchJson<ApiPushResponse>("/api/sync/events", {
      method: "POST",
      body: JSON.stringify(body),
    }, true);
    const parsed = parsePushResponse(json, req, url);
    if (status === 409) {
      if (parsed.conflicts?.length === 0) {
        throw new ServerHttpError(status, url, JSON.stringify(json));
      }
      throw new ServerConflictError(
        parsed.server_revision,
        parsed.conflicts ?? [],
        parsed.accepted_event_ids,
        parsed.rejected,
      );
    }
    return parsed;
  }

  /** Pull the server delta since a revision (doc 04 §1 step 8). */
  async getChanges(sinceRevision: number): Promise<ChangesResponse> {
    const { json, url } = await this.fetchJson<ApiChangesResponse>(
      `/api/sync/changes?since=${encodeURIComponent(sinceRevision)}`,
      { method: "GET" },
    );
    return parseChangesResponse(json, url);
  }

  /**
   * Long-poll fallback for live updates (doc 04 §5.1). Blocks server-side until
   * a change or timeout; pass an `AbortSignal` to cancel on teardown.
   */
  async poll(
    sinceRevision: number,
    signal?: AbortSignal,
  ): Promise<ChangesResponse> {
    const { json, url } = await this.fetchJson<ApiChangesResponse>(
      `/api/sync/poll?since=${encodeURIComponent(sinceRevision)}`,
      { method: "GET", signal },
    );
    return parseChangesResponse(json, url);
  }

  /** The ws(s):// URL for the live channel, token in the query for WS auth. */
  webSocketUrl(): string {
    const url = toWebSocketUrl(this.config.baseUrl);
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(this.config.deviceToken)}&device_id=${encodeURIComponent(this.config.deviceId)}`;
  }
}
