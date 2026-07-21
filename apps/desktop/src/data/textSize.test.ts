import { describe, expect, it } from "vitest";
import { normalizeTextSize, TEXT_SIZE_OPTIONS } from "./textSize";

describe("text size preference", () => {
  it("offers ordered, progressively larger stages", () => {
    expect(TEXT_SIZE_OPTIONS.map((option) => option.scale)).toEqual([0.92, 1, 1.12, 1.24]);
  });

  it("falls back safely for stale persisted values", () => {
    expect(normalizeTextSize("large")).toBe("large");
    expect(normalizeTextSize("unknown")).toBe("standard");
    expect(normalizeTextSize(null)).toBe("standard");
  });
});
