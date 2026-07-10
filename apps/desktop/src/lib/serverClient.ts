/**
 * serverClient.ts — REST client for the OPTIONAL self-hosted sync server
 * (doc 04). Handles device pairing and the sync endpoints with a Bearer device
 * token. Pure `fetch`; no Tauri dependency, so it also runs under test/node.
 *
 * INERT WITHOUT A SERVER: this class is only constructed once a `ServerConfig`
 * exists. The local-first mode (doc 04 §1) never touches it — the {@link SyncEngine}
 * short-circuits when unconfigured, so pure local usage stays unaffected.
 *
 * Endpoints (doc 04):
 *   - POST /api/devices        — pairing (code → device_token)
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
  PushResponse,
  ServerConfig,
} from "../sync/types";

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

/**
 * HTTP 409 on push — the server rejected part of the batch as conflicting
 * (doc 04 §6). Carries the conflict payloads so the engine can persist them to
 * `conflict_records` and open the dialog — NEVER a silent drop.
 */
export class ServerConflictError extends Error {
  constructor(
    readonly serverRevision: number,
    readonly conflicts: ConflictPayload[],
  ) {
    super(`server conflict: ${conflicts.length} record(s)`);
    this.name = "ServerConflictError";
  }
}

/** Trim a trailing slash so URL joins are predictable. */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Derive the ws(s):// origin for the live channel from an http(s) base URL. */
export function toWebSocketUrl(baseUrl: string, path = "/api/ws"): string {
  const base = normalizeBaseUrl(baseUrl);
  const wsBase = base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}${path}`;
}

/**
 * Pair this device with a server. `POST /api/devices` with the one-time code;
 * the server returns a durable `device_token` used as the Bearer thereafter
 * (doc 04 §2). Standalone (no token yet), so it is a static factory.
 */
export async function pairDevice(input: PairingInput): Promise<PairingResponse> {
  const base = normalizeBaseUrl(input.baseUrl);
  const url = `${base}/api/devices`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pairing_code: input.pairingCode,
        device: input.device,
      }),
    });
  } catch (cause) {
    throw new ServerUnreachableError(url, cause);
  }
  if (!res.ok) {
    throw new ServerHttpError(res.status, url, await safeText(res));
  }
  return (await res.json()) as PairingResponse;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
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
  ): Promise<{ status: number; json: T }> {
    const url = `${this.base}${path}`;
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: this.headers() });
    } catch (cause) {
      throw new ServerUnreachableError(url, cause);
    }
    if (res.status === 409) {
      const body = (await res.json()) as {
        server_revision: number;
        conflicts: ConflictPayload[];
      };
      throw new ServerConflictError(
        body.server_revision ?? 0,
        body.conflicts ?? [],
      );
    }
    if (!res.ok) {
      throw new ServerHttpError(res.status, url, await safeText(res));
    }
    return { status: res.status, json: (await res.json()) as T };
  }

  /** Push the outbox batch (doc 04 §1.4). Throws {@link ServerConflictError} on 409. */
  async pushEvents(req: PushRequest): Promise<PushResponse> {
    const { json } = await this.fetchJson<PushResponse>("/api/sync/events", {
      method: "POST",
      body: JSON.stringify(req),
    });
    return json;
  }

  /** Pull the server delta since a revision (doc 04 §1 step 8). */
  async getChanges(sinceRevision: number): Promise<ChangesResponse> {
    const { json } = await this.fetchJson<ChangesResponse>(
      `/api/sync/changes?since=${encodeURIComponent(sinceRevision)}`,
      { method: "GET" },
    );
    return json;
  }

  /**
   * Long-poll fallback for live updates (doc 04 §5.1). Blocks server-side until
   * a change or timeout; pass an `AbortSignal` to cancel on teardown.
   */
  async poll(
    sinceRevision: number,
    signal?: AbortSignal,
  ): Promise<ChangesResponse> {
    const { json } = await this.fetchJson<ChangesResponse>(
      `/api/sync/poll?since=${encodeURIComponent(sinceRevision)}`,
      { method: "GET", signal },
    );
    return json;
  }

  /** The ws(s):// URL for the live channel, token in the query for WS auth. */
  webSocketUrl(): string {
    const url = toWebSocketUrl(this.config.baseUrl);
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${encodeURIComponent(this.config.deviceToken)}&device_id=${encodeURIComponent(this.config.deviceId)}`;
  }
}
