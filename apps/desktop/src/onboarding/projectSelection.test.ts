import { describe, expect, it } from "vitest";
import { createOnboardingProgress } from "@tarlog/core";
import {
  completedWorkspaceProgress,
  onboardingProjectRates,
  resolveOnboardingCustomerSetup,
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

  it("offers customer creation instead of a meaningless selector on first run", () => {
    expect(resolveOnboardingCustomerSetup(0, null)).toBe("first");
  });

  it("shows customer selection only for a populated workspace", () => {
    expect(resolveOnboardingCustomerSetup(2, null)).toBe("existing");
    expect(resolveOnboardingCustomerSetup(2, "customer-1")).toBe("created");
  });

  it("stores onboarding prices only in the selected billing column", () => {
    expect(onboardingProjectRates("hourly", 8_500)).toEqual({
      hourly_rate_cents: 8_500,
      fixed_fee_cents: null,
    });
    expect(onboardingProjectRates("fixed_fee", 250_000)).toEqual({
      hourly_rate_cents: null,
      fixed_fee_cents: 250_000,
    });
    expect(onboardingProjectRates("non_billable", null)).toEqual({
      hourly_rate_cents: null,
      fixed_fee_cents: null,
    });
  });
});
