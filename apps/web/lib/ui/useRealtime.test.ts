import { describe, expect, it } from "vitest";
import { nextRealtimePollCursor } from "./useRealtime";

describe("Realtime Long-Poll-Cursor", () => {
  it("verwendet bei weiteren Seiten nur die letzte gelieferte Revision", () => {
    expect(nextRealtimePollCursor(4, {
      events: [{ type: "timer.update", server_revision: 7 }],
      server_revision: 20,
      has_more: true,
    })).toBe(7);
  });

  it("übernimmt die Hochwassermarke erst nach der letzten Seite", () => {
    expect(nextRealtimePollCursor(7, {
      events: [],
      server_revision: 20,
      has_more: false,
    })).toBe(20);
  });

  it("lehnt eine nicht fortschreitende Folgeseite ab", () => {
    expect(() => nextRealtimePollCursor(7, {
      events: [],
      server_revision: 20,
      has_more: true,
    })).toThrow(/fortschreitenden Cursor/);
  });
});
