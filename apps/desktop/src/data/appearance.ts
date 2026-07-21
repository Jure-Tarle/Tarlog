export const APPEARANCE_STORAGE_KEY = "tarlog-theme";
export const APPEARANCE_CHANGE_EVENT = "tarlog:appearance-change";

export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = Exclude<AppearancePreference, "system">;

export function normalizeAppearance(value: unknown): AppearancePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function readAppearancePreference(): AppearancePreference {
  try {
    return normalizeAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return "system";
  }
}

export function requestAppearance(preference: AppearancePreference): void {
  window.dispatchEvent(new CustomEvent(APPEARANCE_CHANGE_EVENT, { detail: preference }));
}
