import { describe, expect, it } from "vitest";
import { descriptionForTimer } from "./timerDescriptionDraft";

describe("timer description draft", () => {
  it("restores a description only for the matching timer", () => {
    const draft = { startedAt: 1234, description: "  Konzept abgeschlossen  " };
    expect(descriptionForTimer(draft, 1234)).toBe("Konzept abgeschlossen");
    expect(descriptionForTimer(draft, 5678)).toBe("");
  });

  it("rejects malformed persisted values", () => {
    expect(descriptionForTimer(null, 1234)).toBe("");
    expect(descriptionForTimer({ startedAt: 1234, description: 42 }, 1234)).toBe("");
  });
});
