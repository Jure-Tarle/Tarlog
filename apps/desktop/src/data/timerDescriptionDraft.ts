import { getDeviceSetting, setDeviceSetting } from "./settings";

const TIMER_DESCRIPTION_DRAFT_KEY = "active_timer_description_draft_v1";

interface TimerDescriptionDraft {
  startedAt: number;
  description: string;
}

export async function saveTimerDescriptionDraft(
  startedAt: number | null | undefined,
  description: string | null | undefined,
): Promise<void> {
  const trimmed = description?.trim() ?? "";
  if (startedAt == null || !trimmed) {
    await clearTimerDescriptionDraft();
    return;
  }
  await setDeviceSetting(TIMER_DESCRIPTION_DRAFT_KEY, { startedAt, description: trimmed });
}

export async function loadTimerDescriptionDraft(
  startedAt: number | null | undefined,
): Promise<string> {
  const value = await getDeviceSetting<unknown>(TIMER_DESCRIPTION_DRAFT_KEY);
  return descriptionForTimer(value, startedAt);
}

export function clearTimerDescriptionDraft(): Promise<void> {
  return setDeviceSetting(TIMER_DESCRIPTION_DRAFT_KEY, null);
}

export function descriptionForTimer(
  value: unknown,
  startedAt: number | null | undefined,
): string {
  if (!value || typeof value !== "object" || startedAt == null) return "";
  const draft = value as Partial<TimerDescriptionDraft>;
  if (draft.startedAt !== startedAt || typeof draft.description !== "string") return "";
  return draft.description.trim();
}
