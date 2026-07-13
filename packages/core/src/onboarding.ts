/**
 * Versioned first-run state shared by desktop and web.
 *
 * The state deliberately contains only durable workflow progress. Form drafts
 * stay inside the current UI, while created customer/project ids survive a
 * restart so the assistant can resume without creating duplicate records.
 */
export const ONBOARDING_VERSION = 1 as const;

export const ONBOARDING_STEPS = [
  "welcome",
  "workspace",
  "live_tracking",
  "backdating",
  "sync",
  "ready",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "in_progress" | "completed";

export interface OnboardingProgress {
  version: typeof ONBOARDING_VERSION;
  status: OnboardingStatus;
  step: OnboardingStep;
  customerId: string | null;
  projectId: string | null;
  completedAt: number | null;
}

export interface OnboardingLaunch {
  /** Automatically present the assistant. */
  show: boolean;
  /** The assistant cannot be dismissed until the first-run tour is complete. */
  required: boolean;
  /** Normalized persisted progress, or a fresh state for a new workspace. */
  progress: OnboardingProgress;
}

export function createOnboardingProgress(
  patch: Partial<OnboardingProgress> = {},
): OnboardingProgress {
  return {
    status: "in_progress",
    step: "welcome",
    customerId: null,
    projectId: null,
    completedAt: null,
    ...patch,
    version: ONBOARDING_VERSION,
  };
}

/**
 * Decode untrusted JSON from a settings store.
 *
 * `undefined` is reserved for an actually missing setting row. `null` means a
 * row existed but its payload is invalid or belongs to an unsupported version.
 * Keeping those cases distinct lets launch resolution remain fail-closed for
 * corrupt persisted state without retroactively gating genuine legacy data.
 */
export function normalizeOnboardingProgress(
  value: unknown,
): OnboardingProgress | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== ONBOARDING_VERSION) return null;
  if (value.status !== "in_progress" && value.status !== "completed") return null;
  if (!isOnboardingStep(value.step)) return null;

  const customerId = nullableUuid(value.customerId);
  const projectId = nullableUuid(value.projectId);
  const completedAt = nullableFiniteNumber(value.completedAt);
  if (customerId === undefined || projectId === undefined || completedAt === undefined) return null;

  if (value.status === "completed") {
    if (value.step !== "ready" || projectId === null || completedAt === null) return null;
  } else {
    if (completedAt !== null) return null;
    if (onboardingStepIndex(value.step) >= onboardingStepIndex("live_tracking") && projectId === null) {
      return null;
    }
  }

  return {
    version: ONBOARDING_VERSION,
    status: value.status,
    step: value.step,
    customerId,
    projectId,
    completedAt,
  };
}

/**
 * First-run decision used after storage boot:
 * - incomplete persisted tours always resume;
 * - completed tours stay out of the way;
 * - legacy workspaces with a project are never blocked retroactively;
 * - a genuinely empty workspace must complete the assistant.
 */
export function resolveOnboardingLaunch(
  value: unknown,
  hasWorkspace: boolean,
): OnboardingLaunch {
  const progress = normalizeOnboardingProgress(value);
  if (progress?.status === "completed") {
    return { show: false, required: false, progress };
  }
  if (progress) {
    return { show: true, required: true, progress };
  }

  // A present but invalid row must never be mistaken for a legacy workspace:
  // recover with a required, clean first-run state even when projects exist.
  if (progress === null) {
    return { show: true, required: true, progress: createOnboardingProgress() };
  }

  return {
    show: !hasWorkspace,
    required: !hasWorkspace,
    progress: createOnboardingProgress(),
  };
}

export function onboardingStepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function nextOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = onboardingStepIndex(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)] ?? "ready";
}

export function previousOnboardingStep(step: OnboardingStep): OnboardingStep {
  const index = onboardingStepIndex(step);
  return ONBOARDING_STEPS[Math.max(index - 1, 0)] ?? "welcome";
}

export function completeOnboardingProgress(
  progress: OnboardingProgress,
  completedAt: number = Date.now(),
): OnboardingProgress {
  if (!progress.projectId) throw new Error("project_required");
  if (!Number.isFinite(completedAt)) throw new Error("invalid_completed_at");
  return createOnboardingProgress({
    ...progress,
    status: "completed",
    step: "ready",
    completedAt,
  });
}

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === "string" && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nullableUuid(value: unknown): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : undefined;
}

function nullableFiniteNumber(value: unknown): number | null | undefined {
  if (value == null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
