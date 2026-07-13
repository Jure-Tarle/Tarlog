import { describe, expect, it } from "vitest";
import { nextPullCursor } from "./engine";
import type { ChangesResponse, WireEvent } from "./types";

function change(serverRevision: number): WireEvent {
  return {
    event_id: `018f5df0-3a60-7c99-b75d-aec9c327f0${serverRevision}`,
    entity_type: "time_entries",
    entity_id: "018f5df0-3a60-7c99-b75d-aec9c327f099",
    operation: "update",
    payload: {},
    hlc: "1:0:test",
    server_revision: serverRevision,
  };
}

function response(
  events: WireEvent[],
  serverRevision: number,
  hasMore: boolean,
): ChangesResponse {
  return { events, server_revision: serverRevision, has_more: hasMore };
}

describe("nextPullCursor", () => {
  it("uses the last delivered event while more pages remain", () => {
    expect(nextPullCursor(10, response([change(11), change(12)], 99, true))).toBe(12);
  });

  it("adopts the account high-water mark only after the final page", () => {
    expect(nextPullCursor(12, response([change(13)], 99, false))).toBe(99);
  });

  it("rejects a non-progressing paginated response instead of looping or skipping", () => {
    expect(() => nextPullCursor(12, response([], 99, true))).toThrow("fortschreitenden Cursor");
  });
});
