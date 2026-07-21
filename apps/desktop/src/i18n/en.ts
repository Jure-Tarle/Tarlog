/**
 * English dictionary, aggregated from per-domain modules. Keys are the exact
 * German source strings used in `t("…")` calls; values are the English
 * translations. `{name}` placeholders must match between key and value.
 */
import { app } from "./en/app";
import { onboarding } from "./en/onboarding";
import { settingsSync } from "./en/settings-sync";
import { time } from "./en/time";
import { dashboardReports } from "./en/dashboard-reports";
import { projects } from "./en/projects";
import { data } from "./en/data";

export const en: Record<string, string> = {
  ...app,
  ...onboarding,
  ...settingsSync,
  ...time,
  ...dashboardReports,
  ...projects,
  ...data,
};
