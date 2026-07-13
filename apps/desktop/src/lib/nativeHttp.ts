/**
 * Native HTTP edge for the optional desktop sync transport.
 *
 * In Tauri, requests use the official Rust-backed HTTP plugin so they are not
 * subject to WebView CORS. Before each origin is used, a Rust command adds a
 * runtime capability restricted to the user-approved base URL's `/api/*`
 * namespace. Plain browser `fetch` remains only for tests/non-Tauri previews.
 */
import { invoke, isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

export class NativeHttpTransportError extends Error {
  constructor(
    readonly baseUrl: string,
    override readonly cause: unknown,
  ) {
    super("Nativer HTTP-Transport konnte nicht freigegeben werden.");
    this.name = "NativeHttpTransportError";
  }
}

const approved = new Set<string>();

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function looksLikeNativeSetupFailure(error: unknown): boolean {
  return /(not allowed|url.*allow|scope|plugin[: -]?http|command.*http|ipc)/i.test(
    messageOf(error),
  );
}

async function approveBaseUrl(baseUrl: string): Promise<string> {
  if (approved.has(baseUrl)) return baseUrl;
  try {
    const normalized = await invoke<string>("allow_sync_server_http", { baseUrl });
    approved.add(normalized);
    approved.add(baseUrl);
    return normalized;
  } catch (cause) {
    throw new NativeHttpTransportError(baseUrl, cause);
  }
}

/** Fetch through Rust in Tauri; use standard fetch only outside Tauri. */
export async function fetchSyncServer(
  baseUrl: string,
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!isTauri()) return globalThis.fetch(input, init);

  await approveBaseUrl(baseUrl);
  try {
    return await tauriFetch(input, {
      ...init,
      // Do not let a server redirect a scoped request to an unapproved origin.
      maxRedirections: 0,
      connectTimeout: 15_000,
    });
  } catch (cause) {
    if (looksLikeNativeSetupFailure(cause)) {
      throw new NativeHttpTransportError(baseUrl, cause);
    }
    throw cause;
  }
}

/** Test-only reset for the module-local approval memoization. */
export function resetNativeHttpApprovals(): void {
  approved.clear();
}
