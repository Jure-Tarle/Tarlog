import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizePairingCode,
  normalizeServerBaseUrl,
  pairDevice,
  ServerClient,
  ServerConflictError,
} from "./serverClient";
import type { PushRequest, ServerConfig } from "../sync/types";

const DEVICE_ID = "018f5df0-3a60-7c99-b75d-aec9c327f013";
const ACCOUNT_ID = "018f5df0-3a60-7c99-b75d-aec9c327f014";
const EVENT_ID = "018f5df0-3a60-7c99-b75d-aec9c327f015";
const ENTITY_ID = "018f5df0-3a60-7c99-b75d-aec9c327f016";

const config: ServerConfig = {
  baseUrl: "https://tarlog.example.test/",
  deviceToken: "secret-token",
  deviceId: DEVICE_ID,
  mainAccountId: ACCOUNT_ID,
};

const pushRequest: PushRequest = {
  device_id: DEVICE_ID,
  local_revision: 4,
  events: [{
    event_id: EVENT_ID,
    entity_type: "time_entries",
    entity_id: ENTITY_ID,
    operation: "update",
    payload: { description: "Korrigiert" },
    hlc: `${Date.now()}:0:${DEVICE_ID}`,
    local_revision: 4,
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop server transport contract", () => {
  it("validates URLs and human-readable pairing codes", () => {
    expect(normalizeServerBaseUrl(" https://tarlog.example.test/ ")).toBe(
      "https://tarlog.example.test",
    );
    expect(normalizePairingCode("abcd-ef23")).toBe("ABCDEF23");
    expect(normalizeServerBaseUrl("http://127.0.0.1:3001/")).toBe(
      "http://127.0.0.1:3001",
    );
    expect(normalizeServerBaseUrl("http://localhost:3001/tarlog/")).toBe(
      "http://localhost:3001/tarlog",
    );
    expect(() => normalizeServerBaseUrl("http://tarlog.example.test")).toThrow(
      "HTTPS",
    );
    expect(() => normalizeServerBaseUrl("file:///tmp/tarlog")).toThrow("http://");
    expect(() => normalizePairingCode("1234")).toThrow("acht");
  });

  it("pairs through /api/devices/connect with the server's flat schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      device_id: DEVICE_ID,
      main_account_id: ACCOUNT_ID,
      device_token: "device-token",
      token_prefix: "device-t",
      scopes: ["sync"],
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pairDevice({
      baseUrl: "https://tarlog.example.test/",
      pairingCode: "ABCD-EF23",
      device: {
        device_name: "Tarlog auf diesem Mac",
        platform: "macos",
        app_version: "0.0.2",
        local_db_version: 1,
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://tarlog.example.test/api/devices/connect");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "ABCDEF23",
      device_name: "Tarlog auf diesem Mac",
      platform: "macos",
      app_version: "0.0.2",
      local_db_version: 1,
    });
    expect(result).toMatchObject({
      device_id: DEVICE_ID,
      main_account_id: ACCOUNT_ID,
      device_token: "device-token",
      server_revision: 0,
    });
  });

  it("adapts desktop payload/accepted names to the web push contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accepted: [EVENT_ID],
      conflicts: [],
      rejected: [],
      server_revision: 17,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new ServerClient(config).pushEvents(pushRequest);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      events: [{
        event_id: EVENT_ID,
        entity_type: "time_entries",
        entity_id: ENTITY_ID,
        operation: "update",
        hlc: pushRequest.events[0]?.hlc,
        local_revision: 4,
        data: { description: "Korrigiert" },
      }],
    });
    expect(result).toEqual({
      accepted_event_ids: [EVENT_ID],
      conflicts: [],
      rejected: [],
      server_revision: 17,
    });
  });

  it("preserves accepted, rejected and conflict details from a 409", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accepted: [EVENT_ID],
      conflicts: [{
        event_id: EVENT_ID,
        conflict_case: 7,
        message: "Beschreibung divergiert.",
        server_version: { description: "Server" },
      }],
      rejected: [{ event_id: EVENT_ID, error: "validation_error" }],
      server_revision: 18,
    }), { status: 409 })));

    try {
      await new ServerClient(config).pushEvents(pushRequest);
      throw new Error("expected ServerConflictError");
    } catch (error) {
      expect(error).toBeInstanceOf(ServerConflictError);
      const conflict = error as ServerConflictError;
      expect(conflict.acceptedEventIds).toEqual([EVENT_ID]);
      expect(conflict.rejected).toHaveLength(1);
      expect(conflict.conflicts[0]).toMatchObject({
        entity_type: "time_entries",
        entity_id: ENTITY_ID,
        conflict_case: 7,
        local_version: { description: "Korrigiert" },
        server_version: { description: "Server" },
      });
    }
  });

  it("maps web delta data back to desktop payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      events: [{
        event_id: EVENT_ID,
        entity_type: "time_entries",
        entity_id: ENTITY_ID,
        operation: "update",
        data: { description: "Vom Server" },
        hlc: "1000:0:server",
        local_revision: 5,
        server_revision: 19,
        correlation_id: EVENT_ID,
        created_at: 1000,
      }],
      server_revision: 19,
      has_more: false,
    }), { status: 200 })));

    const result = await new ServerClient(config).getChanges(18);

    expect(result.events[0]).toMatchObject({
      event_id: EVENT_ID,
      operation: "update",
      payload: { description: "Vom Server" },
      server_revision: 19,
    });
  });
});
