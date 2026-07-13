import type { TimerStatus } from "@tarlog/core";

export interface AppShellTimer {
  timer_id: string;
  project_id: string | null;
  task_id: string | null;
  status: TimerStatus;
  started_at: number | null;
  accumulated_pause_seconds: number | null;
  active_pause_started_at: number | null;
  projectName?: string | null;
  taskName?: string | null;
}

export const TIMER_STATUS_PRESENTATION = {
  idle: { label: "Bereit", fallback: "Timer starten", active: false, tone: "idle" },
  running: { label: "Läuft", fallback: "Aktiver Timer", active: true, tone: "active" },
  paused: { label: "Pausiert", fallback: "Pausierter Timer", active: true, tone: "active" },
  stopped: { label: "Gestoppt", fallback: "Timer starten", active: false, tone: "idle" },
  needs_description: { label: "Beschreibung fehlt", fallback: "Timer abschließen", active: false, tone: "attention" },
  sync_pending: { label: "Sync ausstehend", fallback: "Timer synchronisieren", active: false, tone: "attention" },
  conflict: { label: "Konflikt", fallback: "Timerkonflikt lösen", active: false, tone: "conflict" },
} satisfies Record<TimerStatus, {
  label: string;
  fallback: string;
  active: boolean;
  tone: "idle" | "active" | "attention" | "conflict";
}>;

/**
 * `/api/timer` liefert den Repository-Snapshot ohne Join-Namen. Namen dürfen
 * deshalb nur für dieselbe Projekt-/Aufgaben-ID aus dem letzten angereicherten
 * Layout-Snapshot übernommen werden. Explizite API-Namen (auch `null`) gewinnen.
 */
export function mergeTimerSnapshot(
  current: AppShellTimer | null,
  next: AppShellTimer | null,
): AppShellTimer | null {
  if (!next) return null;

  const carriesProjectName = Object.prototype.hasOwnProperty.call(next, "projectName");
  const carriesTaskName = Object.prototype.hasOwnProperty.call(next, "taskName");

  return {
    ...next,
    projectName: carriesProjectName
      ? next.projectName
      : next.project_id === current?.project_id
        ? current.projectName
        : null,
    taskName: carriesTaskName
      ? next.taskName
      : next.task_id === current?.task_id
        ? current.taskName
        : null,
  };
}
