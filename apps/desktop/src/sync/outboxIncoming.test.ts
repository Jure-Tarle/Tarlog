import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../lib/db", () => ({
  execute: db.execute,
  select: db.select,
}));

import {
  countPendingEvents,
  loadPendingEvents,
  markEventsPushed,
  markIncomingEventsApplied,
  stageIncomingEvent,
} from "./outbox";
import type { WireEvent } from "./types";

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

beforeEach(() => {
  db.execute.mockReset().mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  db.select.mockReset().mockResolvedValue([{ applied: 0 }]);
});

describe("incoming event staging", () => {
  it("persists raw data as applied=0 and reports that a merge is needed", async () => {
    await expect(stageIncomingEvent("account", "device", EVENT, 1234)).resolves.toBe(true);

    const [sql] = db.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("applied, created_at");
    expect(sql).toContain("0,$12");
    expect(db.select).toHaveBeenCalledWith(
      expect.stringContaining("SELECT applied"),
      [EVENT.event_id],
    );
  });

  it("recognizes an already-applied retry without downgrading it", async () => {
    db.select.mockResolvedValueOnce([{ applied: 1 }]);

    await expect(stageIncomingEvent("account", "device", EVENT, 1234)).resolves.toBe(false);
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("COALESCE(sync_events.server_revision"),
      expect.any(Array),
    );
  });

  it("propagates staging failures instead of pretending the event was stored", async () => {
    db.execute.mockRejectedValueOnce(new Error("sqlite unavailable"));

    await expect(stageIncomingEvent("account", "device", EVENT, 1234)).rejects.toThrow(
      "sqlite unavailable",
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("acknowledges only a complete merged batch", async () => {
    db.execute.mockResolvedValueOnce({ rowsAffected: 0, lastInsertId: 0 });

    await expect(markIncomingEventsApplied([EVENT.event_id])).rejects.toThrow(
      "Nicht alle eingehenden Sync-Events",
    );
  });
});

describe("outgoing event integrity", () => {
  it("propagates pending reads instead of presenting a locked DB as empty", async () => {
    db.select.mockRejectedValueOnce(new Error("database is locked"));
    await expect(loadPendingEvents("account")).rejects.toThrow("database is locked");

    db.select.mockRejectedValueOnce(new Error("database is locked"));
    await expect(countPendingEvents("account")).rejects.toThrow("database is locked");
  });

  it("requires every unique accepted event to be durably acknowledged", async () => {
    db.execute.mockResolvedValueOnce({ rowsAffected: 1, lastInsertId: 0 });

    await expect(markEventsPushed(["event-a", "event-b", "event-a"], 9)).rejects.toThrow(
      "Nicht alle gesendeten Sync-Events",
    );
    expect(db.execute).toHaveBeenCalledWith(
      expect.stringContaining("id IN ($2, $3)"),
      [9, "event-a", "event-b"],
    );
  });

  it("propagates acknowledgement write failures", async () => {
    db.execute.mockRejectedValueOnce(new Error("database is locked"));

    await expect(markEventsPushed(["event-a"], 9)).rejects.toThrow("database is locked");
  });
});
