import type { TimeEntry } from "./repositories";
import { t } from "../i18n";

export interface ActivitySummary {
  key: string;
  label: string;
  seconds: number;
  entries: number;
  share: number;
}

function normalizeDescription(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") || t("Ohne Beschreibung");
}

function rank(
  entries: TimeEntry[],
  keyFor: (entry: TimeEntry) => string,
  labelFor: (entry: TimeEntry) => string,
): ActivitySummary[] {
  const total = entries.reduce((sum, entry) => sum + (entry.net_work_duration_seconds ?? 0), 0);
  const groups = new Map<string, Omit<ActivitySummary, "share">>();
  for (const entry of entries) {
    const key = keyFor(entry);
    const existing = groups.get(key);
    if (existing) {
      existing.seconds += entry.net_work_duration_seconds ?? 0;
      existing.entries += 1;
    } else {
      groups.set(key, {
        key,
        label: labelFor(entry),
        seconds: entry.net_work_duration_seconds ?? 0,
        entries: 1,
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({ ...group, share: total > 0 ? group.seconds / total : 0 }))
    .sort((a, b) => b.seconds - a.seconds || b.entries - a.entries || a.label.localeCompare(b.label));
}

export function activitiesByDescription(entries: TimeEntry[]): ActivitySummary[] {
  return rank(entries, (entry) => normalizeDescription(entry.description).toLocaleLowerCase("de"), (entry) => normalizeDescription(entry.description));
}

export function activitiesByTask(entries: TimeEntry[], taskNames: Map<string, string>): ActivitySummary[] {
  return rank(
    entries,
    (entry) => entry.task_id ?? "__none",
    (entry) => entry.task_id ? taskNames.get(entry.task_id) ?? t("Unbekannte Aufgabe") : t("Ohne Aufgabe"),
  );
}

export function activeDayCount(entries: TimeEntry[], timezone: string): number {
  const days = new Set(
    entries.map((entry) => new Intl.DateTimeFormat("sv-SE", { timeZone: entry.timezone || timezone }).format(entry.actual_started_at)),
  );
  return days.size;
}

/** Effective revenue per worked hour for fixed-price projects. */
export function effectiveFixedHourlyCents(fixedFeeCents: number | null | undefined, netSeconds: number): number | null {
  if (fixedFeeCents == null || netSeconds <= 0) return null;
  return Math.round((fixedFeeCents * 3600) / netSeconds);
}
