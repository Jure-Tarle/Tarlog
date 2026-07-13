import { describe, expect, it } from "vitest";
import { completeOnboardingProgress, createOnboardingProgress } from "@tarlog/core";
import {
  createDesktopReplayProgress,
  shouldPersistDesktopCheckpoint,
} from "./useDesktopOnboarding";

describe("desktop onboarding replay", () => {
  it("starts a replay at welcome without discarding workspace references", () => {
    const completed = completeOnboardingProgress(createOnboardingProgress({
      customerId: "customer-1",
      projectId: "project-1",
    }), 1234);

    expect(createDesktopReplayProgress(completed)).toMatchObject({
      status: "in_progress",
      step: "welcome",
      customerId: "customer-1",
      projectId: "project-1",
      completedAt: null,
    });
  });

  it("never persists an in-progress replay checkpoint", () => {
    expect(shouldPersistDesktopCheckpoint(true)).toBe(false);
    expect(shouldPersistDesktopCheckpoint(false)).toBe(true);
  });
});
