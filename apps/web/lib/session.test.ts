import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("./db.js", () => ({
  pool: { query: dbMocks.query },
}));

import {
  tokenAllowsRest,
  tokenAllowsScope,
  verifyDeviceToken,
  verifySession,
} from "./session";

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    main_account_id: "account-1",
    user_id: null,
    device_id: "device-1",
    expires_at: Date.now() + 60_000,
    revoked_at: null,
    resolved_device_id: "device-1",
    device_revoked: false,
    device_deleted_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.query.mockReset();
});

describe("verifySession Gerätebindung", () => {
  it("akzeptiert eine aktive gebundene Session", async () => {
    dbMocks.query
      .mockResolvedValueOnce({ rows: [sessionRow()] })
      .mockResolvedValueOnce({ rows: [{ id: "session-1" }] });

    await expect(verifySession("raw-token")).resolves.toMatchObject({
      main_account_id: "account-1",
      session_id: "session-1",
      device_id: "device-1",
    });
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });

  it("lehnt eine Session eines widerrufenen Geräts ab", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [sessionRow({ device_revoked: true })],
    });

    await expect(verifySession("raw-token")).resolves.toBeNull();
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });

  it("lehnt eine Session eines gelöschten Geräts ab", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [sessionRow({ device_deleted_at: Date.now() })],
    });

    await expect(verifySession("raw-token")).resolves.toBeNull();
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });

  it("lehnt eine Session mit nicht mehr vorhandenem Gerät ab", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [sessionRow({ resolved_device_id: null })],
    });

    await expect(verifySession("raw-token")).resolves.toBeNull();
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });
});

describe("Bearer-Token-Scopes", () => {
  it("trennt Realtime-Zugang von allgemeinen REST-Scopes", () => {
    expect(tokenAllowsRest(["realtime"])).toBe(false);
    expect(tokenAllowsRest(["sync", "realtime"])).toBe(true);
    expect(tokenAllowsScope(["sync"], "sync")).toBe(true);
    expect(tokenAllowsScope(["sync"], "timer")).toBe(false);
    expect(tokenAllowsScope(["*"], "invoices")).toBe(true);
  });

  it("lehnt ein kurzlebiges Realtime-Token als REST-Bearer ab", async () => {
    dbMocks.query.mockResolvedValueOnce({
      rows: [{
        id: "token-1",
        main_account_id: "account-1",
        device_id: "device-1",
        device_revoked: false,
        scopes: ["realtime"],
      }],
    });

    await expect(verifyDeviceToken("realtime-token")).resolves.toBeNull();
    expect(dbMocks.query).toHaveBeenCalledTimes(1);
  });

  it("liefert zulässige REST-Scopes im Auth-Kontext zurück", async () => {
    dbMocks.query
      .mockResolvedValueOnce({
        rows: [{
          id: "token-2",
          main_account_id: "account-1",
          device_id: "device-1",
          device_revoked: false,
          scopes: ["sync"],
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    await expect(verifyDeviceToken("sync-token")).resolves.toMatchObject({
      main_account_id: "account-1",
      device_id: "device-1",
      token_scopes: ["sync"],
    });
    expect(dbMocks.query).toHaveBeenCalledTimes(2);
  });
});
