import { describe, expect, it } from "vitest";
import { classifySyncRound, type SyncRound } from "./presentation";

function round(
  push: Partial<SyncRound["push"]> = {},
  pull: Partial<SyncRound["pull"]> = {},
): SyncRound {
  const base = {
    ok: true,
    count: 0,
    serverRevision: 0,
    conflicts: 0,
    rejected: 0,
    buffered: false,
  };
  return { push: { ...base, ...push }, pull: { ...base, ...pull } };
}

describe("classifySyncRound", () => {
  it("reports synced only after two completed outcomes", () => {
    expect(classifySyncRound(round())).toBe("synced");
  });

  it("reports buffered transport without calling it synced", () => {
    expect(classifySyncRound(round({ buffered: true }))).toBe("buffered");
  });

  it("prioritizes persisted conflicts over generic errors", () => {
    expect(classifySyncRound(round({ ok: false, conflicts: 1, rejected: 1 }))).toBe("conflict");
  });

  it("reports server-side rejections as errors", () => {
    expect(classifySyncRound(round({ ok: false, rejected: 2 }))).toBe("error");
  });
});
