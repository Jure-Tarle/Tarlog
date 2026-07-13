import { describe, expect, it } from "vitest";
import {
  completeOnboardingProgress,
  createOnboardingProgress,
  nextOnboardingStep,
  normalizeOnboardingProgress,
  previousOnboardingStep,
  resolveOnboardingLaunch,
} from "../src/onboarding.js";

const PROJECT_ID = "019f5a31-3f55-78e1-8f8a-a0c65d6275f1";

describe("onboarding progress", () => {
  it("requires the assistant for a genuinely empty first run", () => {
    const launch = resolveOnboardingLaunch(undefined, false);
    expect(launch).toMatchObject({ show: true, required: true });
    expect(launch.progress.step).toBe("welcome");
  });

  it("does not block a legacy workspace that already has a project", () => {
    const launch = resolveOnboardingLaunch(undefined, true);
    expect(launch).toMatchObject({ show: false, required: false });
  });

  it("resumes an interrupted first-run tour", () => {
    const saved = createOnboardingProgress({ step: "backdating", projectId: PROJECT_ID });
    const launch = resolveOnboardingLaunch(saved, true);
    expect(launch).toMatchObject({ show: true, required: true });
    expect(launch.progress.projectId).toBe(PROJECT_ID);
  });

  it("keeps a completed tour out of the way", () => {
    const completed = completeOnboardingProgress(
      createOnboardingProgress({ projectId: PROJECT_ID }),
      1234,
    );
    const launch = resolveOnboardingLaunch(completed, false);
    expect(launch).toMatchObject({ show: false, required: false });
    expect(launch.progress.completedAt).toBe(1234);
  });

  it("cannot construct completed state without a project", () => {
    expect(() => completeOnboardingProgress(createOnboardingProgress(), 1234))
      .toThrow("project_required");
    expect(() => completeOnboardingProgress(
      createOnboardingProgress({ projectId: PROJECT_ID }),
      Number.NaN,
    )).toThrow("invalid_completed_at");
  });

  it("distinguishes a missing row from malformed and future-version state", () => {
    expect(normalizeOnboardingProgress(undefined)).toBeUndefined();
    expect(normalizeOnboardingProgress(null)).toBeNull();
    expect(normalizeOnboardingProgress({ version: 2, status: "completed", step: "ready" })).toBeNull();
    expect(normalizeOnboardingProgress({ version: 1, status: "wat", step: "ready" })).toBeNull();
    expect(normalizeOnboardingProgress({ version: 1, status: "completed", step: "missing" })).toBeNull();
  });

  it("rejects completed state without all completion invariants", () => {
    const base = {
      version: 1,
      status: "completed",
      step: "ready",
      customerId: null,
      projectId: PROJECT_ID,
      completedAt: 1234,
    };
    expect(normalizeOnboardingProgress({ ...base, step: "sync" })).toBeNull();
    expect(normalizeOnboardingProgress({ ...base, projectId: null })).toBeNull();
    expect(normalizeOnboardingProgress({ ...base, completedAt: null })).toBeNull();
    expect(normalizeOnboardingProgress({ ...base, projectId: "not-a-uuid" })).toBeNull();
    expect(normalizeOnboardingProgress(base)).toEqual(base);
  });

  it("rejects inconsistent in-progress state", () => {
    const base = {
      version: 1,
      status: "in_progress",
      step: "workspace",
      customerId: null,
      projectId: null,
      completedAt: null,
    };
    expect(normalizeOnboardingProgress({ ...base, completedAt: 1234 })).toBeNull();
    expect(normalizeOnboardingProgress({ ...base, step: "live_tracking" })).toBeNull();
    expect(normalizeOnboardingProgress({ ...base, step: "ready" })).toBeNull();
    expect(normalizeOnboardingProgress(base)).toEqual(base);
  });

  it("fails closed for an invalid persisted row even when a project exists", () => {
    const launch = resolveOnboardingLaunch({ version: 2 }, true);
    expect(launch).toMatchObject({ show: true, required: true });
    expect(launch.progress).toMatchObject({ status: "in_progress", step: "welcome" });
  });

  it("bounds previous and next navigation", () => {
    expect(previousOnboardingStep("welcome")).toBe("welcome");
    expect(nextOnboardingStep("welcome")).toBe("workspace");
    expect(previousOnboardingStep("sync")).toBe("backdating");
    expect(nextOnboardingStep("ready")).toBe("ready");
  });
});
