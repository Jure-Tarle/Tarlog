import { beforeEach, describe, expect, it, vi } from "vitest";

const outbox = vi.hoisted(() => ({
  loadPendingEvents: vi.fn(),
  markEventsPushed: vi.fn(),
  markIncomingEventsApplied: vi.fn(),
  stageIncomingEvent: vi.fn(),
}));

vi.mock("./outbox", () => ({
  loadPendingEvents: outbox.loadPendingEvents,
  markEventsPushed: outbox.markEventsPushed,
  markIncomingEventsApplied: outbox.markIncomingEventsApplied,
  stageIncomingEvent: outbox.stageIncomingEvent,
  toWireEvent: vi.fn((event: unknown) => event),
}));

import {
  SyncEngine,
  SyncMergeFailedError,
  SyncMergeRequiredError,
} from "./engine";
import { EMPTY_SYNC_STATE, MemorySyncStore } from "./store";
import type { ChangesResponse, ServerConfig, WireEvent } from "./types";

const CONFIG: ServerConfig = {
  baseUrl: "https://tarlog.example.test",
  deviceToken: "secret",
  deviceId: "018f5df0-3a60-7c99-b75d-aec9c327f013",
  mainAccountId: "018f5df0-3a60-7c99-b75d-aec9c327f014",
};

const EVENT: WireEvent = {
  event_id: "018f5df0-3a60-7c99-b75d-aec9c327f015",
  entity_type: "time_entries",
  entity_id: "018f5df0-3a60-7c99-b75d-aec9c327f016",
  operation: "update",
  payload: { description: "Vom Server" },
  hlc: "1000:0:server",
  local_revision: 4,
  server_revision: 7,
};

const PAGE: ChangesResponse = {
  events: [EVENT],
  server_revision: 7,
  has_more: false,
};

function configuredStore(): MemorySyncStore {
  const store = new MemorySyncStore();
  store.save({ ...EMPTY_SYNC_STATE, config: CONFIG });
  return store;
}

function installPullClient(engine: SyncEngine, page: ChangesResponse = PAGE): void {
  const target = engine as unknown as {
    client: { getChanges(sinceRevision: number): Promise<ChangesResponse> };
  };
  target.client = { getChanges: vi.fn().mockResolvedValue(page) };
}

beforeEach(() => {
  outbox.loadPendingEvents.mockReset().mockResolvedValue([]);
  outbox.markEventsPushed.mockReset().mockResolvedValue(undefined);
  outbox.markIncomingEventsApplied.mockReset().mockResolvedValue(undefined);
  outbox.stageIncomingEvent.mockReset().mockResolvedValue(true);
});

describe("safe incoming pull staging", () => {
  it("stages but rejects the round without a merge adapter or cursor progress", async () => {
    const store = configuredStore();
    const engine = new SyncEngine({ store, now: () => 1234 });
    installPullClient(engine);

    await expect(engine.sync()).rejects.toBeInstanceOf(SyncMergeRequiredError);

    expect(outbox.stageIncomingEvent).toHaveBeenCalledOnce();
    expect(outbox.markIncomingEventsApplied).not.toHaveBeenCalled();
    expect(store.load()).toMatchObject({
      lastPulledRevision: 0,
      lastSuccessfulSyncAt: null,
    });
  });

  it("awaits a successful merge before acknowledging and advancing", async () => {
    let finishMerge!: () => void;
    const mergeGate = new Promise<void>((resolve) => {
      finishMerge = resolve;
    });
    const merge = vi.fn(() => mergeGate);
    const store = configuredStore();
    const engine = new SyncEngine({ store, onChanges: merge });
    installPullClient(engine);

    const pull = engine.pull();
    await vi.waitFor(() => expect(merge).toHaveBeenCalledWith([EVENT]));
    expect(outbox.markIncomingEventsApplied).not.toHaveBeenCalled();

    finishMerge();
    await expect(pull).resolves.toMatchObject({ ok: true, count: 1, serverRevision: 7 });
    expect(outbox.markIncomingEventsApplied).toHaveBeenCalledWith([EVENT.event_id]);
    expect(store.load().lastPulledRevision).toBe(7);
  });

  it("keeps staged rows pending and the cursor fixed when the merge fails", async () => {
    const store = configuredStore();
    const engine = new SyncEngine({
      store,
      onChanges: vi.fn().mockRejectedValue(new Error("merge failed")),
    });
    installPullClient(engine);

    await expect(engine.pull()).rejects.toBeInstanceOf(SyncMergeFailedError);
    expect(outbox.markIncomingEventsApplied).not.toHaveBeenCalled();
    expect(store.load().lastPulledRevision).toBe(0);
  });

  it("propagates a staging write failure without calling the merge or moving the cursor", async () => {
    outbox.stageIncomingEvent.mockRejectedValueOnce(new Error("sqlite unavailable"));
    const merge = vi.fn();
    const store = configuredStore();
    const engine = new SyncEngine({ store, onChanges: merge });
    installPullClient(engine);

    await expect(engine.pull()).rejects.toThrow("sqlite unavailable");
    expect(merge).not.toHaveBeenCalled();
    expect(outbox.markIncomingEventsApplied).not.toHaveBeenCalled();
    expect(store.load().lastPulledRevision).toBe(0);
  });

  it("does not move the cursor when the post-merge acknowledgement fails", async () => {
    outbox.markIncomingEventsApplied.mockRejectedValueOnce(new Error("ack failed"));
    const store = configuredStore();
    const engine = new SyncEngine({ store, onChanges: vi.fn() });
    installPullClient(engine);

    await expect(engine.pull()).rejects.toThrow("ack failed");
    expect(store.load().lastPulledRevision).toBe(0);
  });

  it("does not merge an already-applied staged event again on cursor retry", async () => {
    outbox.stageIncomingEvent.mockResolvedValue(false);
    const store = configuredStore();
    const engine = new SyncEngine({ store });
    installPullClient(engine);

    await expect(engine.pull()).resolves.toMatchObject({ ok: true, count: 1 });
    expect(outbox.markIncomingEventsApplied).not.toHaveBeenCalled();
    expect(store.load().lastPulledRevision).toBe(7);
  });
});
