import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
  tauriFetch: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}));

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mocks.tauriFetch,
}));

import {
  fetchSyncServer,
  NativeHttpTransportError,
  resetNativeHttpApprovals,
} from "./nativeHttp";

const BASE_URL = "https://tarlog.example.test";
const API_URL = `${BASE_URL}/api/sync/changes?since=0`;

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauri.mockReset();
  mocks.tauriFetch.mockReset();
  resetNativeHttpApprovals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("native sync HTTP transport", () => {
  it("keeps browser fetch as the non-Tauri fallback", async () => {
    const response = new Response("ok");
    const browserFetch = vi.fn().mockResolvedValue(response);
    mocks.isTauri.mockReturnValue(false);
    vi.stubGlobal("fetch", browserFetch);

    await expect(fetchSyncServer(BASE_URL, API_URL)).resolves.toBe(response);
    expect(browserFetch).toHaveBeenCalledWith(API_URL, {});
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.tauriFetch).not.toHaveBeenCalled();
  });

  it("approves one user base URL and performs Rust-backed requests without redirects", async () => {
    const response = new Response("ok");
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(BASE_URL);
    mocks.tauriFetch.mockResolvedValue(response);

    await expect(fetchSyncServer(BASE_URL, API_URL, { method: "GET" })).resolves.toBe(response);
    await fetchSyncServer(BASE_URL, `${BASE_URL}/api/sync/poll?since=0`);

    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith("allow_sync_server_http", {
      baseUrl: BASE_URL,
    });
    expect(mocks.tauriFetch).toHaveBeenNthCalledWith(1, API_URL, {
      method: "GET",
      maxRedirections: 0,
      connectTimeout: 15_000,
    });
  });

  it("reports capability/IPC failures separately from offline network failures", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValueOnce(new Error("command allow_sync_server_http not found"));

    await expect(fetchSyncServer(BASE_URL, API_URL)).rejects.toBeInstanceOf(
      NativeHttpTransportError,
    );

    resetNativeHttpApprovals();
    mocks.invoke.mockResolvedValueOnce(BASE_URL);
    mocks.tauriFetch.mockRejectedValueOnce(new TypeError("network error"));
    await expect(fetchSyncServer(BASE_URL, API_URL)).rejects.toThrow("network error");
  });
});
