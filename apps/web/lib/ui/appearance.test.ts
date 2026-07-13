import { describe, expect, it } from "vitest";
import { nextAppearance, normalizeAppearance, resolveAppearance } from "./appearance";

describe("appearance preferences", () => {
  it("uses the operating system when no explicit preference exists", () => {
    expect(normalizeAppearance(null)).toBe("system");
    expect(resolveAppearance("system", false)).toBe("light");
    expect(resolveAppearance("system", true)).toBe("dark");
  });

  it("keeps explicit light and dark preferences independent of the system", () => {
    expect(resolveAppearance("light", true)).toBe("light");
    expect(resolveAppearance("dark", false)).toBe("dark");
  });

  it("cycles through all three choices for compact controls", () => {
    expect(nextAppearance("system")).toBe("light");
    expect(nextAppearance("light")).toBe("dark");
    expect(nextAppearance("dark")).toBe("system");
  });
});
