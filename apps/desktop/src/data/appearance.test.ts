import { describe, expect, it } from "vitest";
import { normalizeAppearance } from "./appearance";

describe("appearance", () => {
  it("keeps supported choices and falls back to the system", () => {
    expect(normalizeAppearance("light")).toBe("light");
    expect(normalizeAppearance("dark")).toBe("dark");
    expect(normalizeAppearance("system")).toBe("system");
    expect(normalizeAppearance("blue")).toBe("system");
    expect(normalizeAppearance(null)).toBe("system");
  });
});
