/** Resolve the workspace used when an introduction reaches the project step. */
import {
  createOnboardingProgress,
  nextOnboardingStep,
  type OnboardingProgress,
} from "@tarlog/core";

export function resolveOnboardingProjectId(
  projects: readonly { id: string }[],
  preferredProjectId: string | null,
): string {
  return projects.find((project) => project.id === preferredProjectId)?.id
    ?? projects[0]?.id
    ?? "";
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
