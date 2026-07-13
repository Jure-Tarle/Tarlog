import {
  ONBOARDING_VERSION,
  completeOnboardingProgress,
  createOnboardingProgress,
  normalizeOnboardingProgress,
  onboardingStepIndex,
  resolveOnboardingLaunch,
  type OnboardingLaunch,
  type OnboardingProgress,
  type OnboardingStep,
} from "@tarlog/core";

export type OnboardingMutation =
  | {
      action: "progress";
      step: OnboardingStep;
      customerId?: string | null;
      projectId?: string | null;
    }
  | { action: "complete" };

/**
 * Web-specific launch decision. A workspace that predates onboarding and
 * already owns a project is treated as completed, so an upgrade never traps
 * an existing user in a first-run gate.
 */
export function resolveWebOnboardingLaunch(
  storedValue: unknown,
  legacyProjectId: string | null,
): OnboardingLaunch {
  const normalized = normalizeOnboardingProgress(storedValue);
  if (normalized === undefined && legacyProjectId) {
    return {
      show: false,
      required: false,
      progress: createOnboardingProgress({
        version: ONBOARDING_VERSION,
        status: "completed",
        step: "ready",
        customerId: null,
        projectId: legacyProjectId,
        // Sentinel for a pre-onboarding workspace. Persisted completed states
        // always require a finite completion timestamp.
        completedAt: 0,
      }),
    };
  }
  return resolveOnboardingLaunch(storedValue, Boolean(legacyProjectId));
}

/**
 * Apply a validated API mutation. Completed state is intentionally immutable:
 * replaying the tour changes only client-side presentation and can never put a
 * finished account back behind the onboarding gate.
 */
export function reduceOnboardingProgress(
  current: OnboardingProgress,
  mutation: OnboardingMutation,
  now: number = Date.now(),
): OnboardingProgress {
  if (current.status === "completed") return current;

  if (mutation.action === "complete") {
    if (!current.projectId) {
      throw new Error("project_required");
    }
    return completeOnboardingProgress(current, now);
  }

  const projectId = mutation.projectId === undefined
    ? current.projectId
    : mutation.projectId;
  const customerId = mutation.customerId === undefined
    ? current.customerId
    : mutation.customerId;

  if (onboardingStepIndex(mutation.step) >= onboardingStepIndex("live_tracking") && !projectId) {
    throw new Error("project_required");
  }

  return createOnboardingProgress({
    ...current,
    status: "in_progress",
    step: mutation.step,
    customerId,
    projectId,
    completedAt: null,
  });
}
