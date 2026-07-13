import { describe, expect, it } from "vitest";
import { createOnboardingProgress } from "@tarlog/core";
import {
  reduceOnboardingProgress,
  resolveWebOnboardingLaunch,
} from "./model";

const PROJECT_ID = "019f5a31-3f55-78e1-8f8a-a0c65d6275f1";

describe("Web onboarding state", () => {
  it("requires onboarding for a genuinely empty workspace", () => {
    const launch = resolveWebOnboardingLaunch(undefined, null);
    expect(launch.required).toBe(true);
    expect(launch.progress.step).toBe("welcome");
    expect(launch.progress.status).toBe("in_progress");
  });

  it("does not retroactively block a legacy workspace with a project", () => {
    const launch = resolveWebOnboardingLaunch(undefined, PROJECT_ID);
    expect(launch.required).toBe(false);
    expect(launch.show).toBe(false);
    expect(launch.progress).toMatchObject({
      status: "completed",
      step: "ready",
      projectId: PROJECT_ID,
      completedAt: 0,
    });
  });

  it("fails closed for malformed or future persisted state", () => {
    for (const stored of [null, { version: 2 }, { version: 1, status: "completed" }]) {
      const launch = resolveWebOnboardingLaunch(stored, PROJECT_ID);
      expect(launch).toMatchObject({ show: true, required: true });
      expect(launch.progress).toMatchObject({ status: "in_progress", step: "welcome" });
    }
  });

  it("resumes a persisted incomplete tour", () => {
    const progress = createOnboardingProgress({
      step: "backdating",
      projectId: PROJECT_ID,
    });
    const launch = resolveWebOnboardingLaunch(progress, PROJECT_ID);
    expect(launch.required).toBe(true);
    expect(launch.progress.step).toBe("backdating");
  });

  it("requires a project before capability steps", () => {
    expect(() =>
      reduceOnboardingProgress(
        createOnboardingProgress(),
        { action: "progress", step: "live_tracking" },
      ),
    ).toThrow("project_required");
  });

  it("completes only after a project was selected", () => {
    const completed = reduceOnboardingProgress(
      createOnboardingProgress({ step: "ready", projectId: PROJECT_ID }),
      { action: "complete" },
      1234,
    );
    expect(completed).toMatchObject({
      status: "completed",
      step: "ready",
      projectId: PROJECT_ID,
      completedAt: 1234,
    });
  });

  it("keeps completed state immutable while the introduction is replayed", () => {
    const current = createOnboardingProgress({
      status: "completed",
      step: "ready",
      projectId: PROJECT_ID,
      completedAt: 1234,
    });
    expect(
      reduceOnboardingProgress(current, {
        action: "progress",
        step: "workspace",
      }),
    ).toEqual(current);
  });
});
