/** Resolve the workspace used when an introduction reaches the project step. */
import {
  createOnboardingProgress,
  nextOnboardingStep,
  type OnboardingProgress,
  type ProjectInput,
} from "@tarlog/core";

export function resolveOnboardingProjectId(
  projects: readonly { id: string }[],
  preferredProjectId: string | null,
): string {
  return projects.find((project) => project.id === preferredProjectId)?.id
    ?? projects[0]?.id
    ?? "";
}

export type OnboardingCustomerSetup = "created" | "first" | "existing";

/** Keep first-run customer creation distinct from selection in populated workspaces. */
export function resolveOnboardingCustomerSetup(
  customerCount: number,
  persistedCustomerId: string | null,
): OnboardingCustomerSetup {
  if (persistedCustomerId) return "created";
  return customerCount > 0 ? "existing" : "first";
}

export type OnboardingBillingType = Extract<
  ProjectInput["billing_type"],
  "hourly" | "fixed_fee" | "non_billable"
>;

/** Map the single visible onboarding amount to the matching project column. */
export function onboardingProjectRates(
  billingType: OnboardingBillingType,
  amountCents: number | null,
): Pick<ProjectInput, "hourly_rate_cents" | "fixed_fee_cents"> {
  return {
    hourly_rate_cents: billingType === "hourly" ? amountCents : null,
    fixed_fee_cents: billingType === "fixed_fee" ? amountCents : null,
  };
}

/** Completion checkpoint used after an atomic workspace create operation. */
export function completedWorkspaceProgress(
  progress: OnboardingProgress,
  patch: Pick<OnboardingProgress, "projectId" | "customerId">,
): OnboardingProgress {
  return createOnboardingProgress({
    ...progress,
    ...patch,
    step: nextOnboardingStep("workspace"),
    status: "in_progress",
    completedAt: null,
  });
}
