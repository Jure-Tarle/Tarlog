import { describe, expect, it } from "vitest";
import { createOnboardingProgress } from "@tarlog/core";
import {
  completedWorkspaceProgress,
  resolveOnboardingProjectId,
} from "./projectSelection";

describe("desktop onboarding project selection", () => {
  const projects = [{ id: "project-1" }, { id: "project-2" }];

  it("keeps a persisted project when it is still available", () => {
    expect(resolveOnboardingProjectId(projects, "project-2")).toBe("project-2");
  });

  it("selects the first existing project for a legacy replay", () => {
    expect(resolveOnboardingProjectId(projects, null)).toBe("project-1");
  });

  it("falls back to the first project when a persisted reference is stale", () => {
    expect(resolveOnboardingProjectId(projects, "deleted-project")).toBe("project-1");
  });

  it("advances a newly created workspace in the same checkpoint", () => {
    const progress = createOnboardingProgress({ step: "workspace" });

    expect(completedWorkspaceProgress(progress, {
      customerId: "customer-1",
      projectId: "project-1",
    })).toMatchObject({
      step: "live_tracking",
      customerId: "customer-1",
      projectId: "project-1",
    });
  });
});
