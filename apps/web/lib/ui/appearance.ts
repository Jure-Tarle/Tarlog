export type AppearancePreference = "system" | "light" | "dark";
export type ResolvedAppearance = "light" | "dark";

export const APPEARANCE_STORAGE_KEY = "tarlog-theme";
export const APPEARANCE_CHANGE_EVENT = "tarlog:appearance-change";

const APPEARANCE_ORDER: AppearancePreference[] = ["system", "light", "dark"];

export function normalizeAppearance(value: string | null | undefined): AppearancePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveAppearance(
  preference: AppearancePreference,
  systemPrefersDark: boolean,
): ResolvedAppearance {
  if (preference === "system") return systemPrefersDark ? "dark" : "light";
  return preference;
}

export function nextAppearance(preference: AppearancePreference): AppearancePreference {
  const index = APPEARANCE_ORDER.indexOf(preference);
  return APPEARANCE_ORDER[(index + 1) % APPEARANCE_ORDER.length] ?? "system";
}
