import type { RoundingResult } from "@tarlog/core";
import { t } from "../i18n";

export interface RoundingPresentation {
  label: string;
  detail: string;
}

export function presentRounding(result: RoundingResult | null): RoundingPresentation {
  if (!result) return { label: t("Wird berechnet"), detail: "," };
  const [mode, rawSeconds] = result.rounding_reason.split(":");
  const seconds = Number.parseInt(rawSeconds ?? "0", 10) || 0;
  const minutes = Math.round(seconds / 60);
  const interval = minutes > 0 ? t("{n} Minuten", { n: minutes }) : t("das Regelintervall");
  const labels: Record<string, string> = {
    none: t("Keine Rundung"),
    exact: t("Keine Rundung"),
    ceil_started_interval: t("Auf {interval} aufgerundet", { interval }),
    floor_started_interval: t("Auf {interval} abgerundet", { interval }),
    nearest_started_interval: t("Auf {interval} gerundet", { interval }),
    minimum_billable: t("Mindestdauer {interval}", { interval }),
  };
  const delta = result.rounding_delta_seconds;
  const deltaMinutes = Math.round(Math.abs(delta) / 60);
  const detail = delta === 0
    ? t("Netto- und Abrechnungszeit sind identisch")
    : t("{sign}{n} Min. gegenüber der Nettozeit", { sign: delta > 0 ? "+" : "−", n: deltaMinutes });
  return { label: labels[mode ?? ""] ?? t("Projektregel angewendet"), detail };
}
