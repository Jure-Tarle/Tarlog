import { describe, expect, it } from "vitest";
import { applyRequirementTemplate, EMPTY_REQUIREMENTS } from "./projectWorkspace";

describe("applyRequirementTemplate", () => {
  it("fills empty requirement prompts", () => {
    const result = applyRequirementTemplate({ ...EMPTY_REQUIREMENTS }, "lastenheft");
    expect(result.goal).toContain("Problem");
    expect(result.functional).toBe("");
  });

  it("never overwrites user-authored content", () => {
    const result = applyRequirementTemplate({ ...EMPTY_REQUIREMENTS, goal: "Kundenportal modernisieren" }, "lastenheft");
    expect(result.goal).toBe("Kundenportal modernisieren");
  });
});
