import {
  DASHBOARD_COLS,
  DEFAULT_DASHBOARD_LAYOUT,
  cloneDashboardLayout,
  dashboardLayoutsEqual,
  normalizeBreakpointLayout,
  normalizeDashboardLayout,
  removeDashboardWidget,
  type DashboardBreakpoint,
  type DashboardLayoutState,
  type DashboardWidgetId,
} from "./dashboardLayout";
import { t } from "../i18n";

export interface DashboardEditorChange {
  current: DashboardLayoutState;
  undo: DashboardLayoutState[];
  message: string;
}

export interface DashboardLayoutLoadState {
  ready: boolean;
  layout: DashboardLayoutState;
  warning: string;
}

export const DASHBOARD_SAVE_ERROR = "Dashboard konnte nicht gespeichert werden. Deine Änderungen bleiben erhalten.";
export const DASHBOARD_LOAD_WARNING = "Die gespeicherte Dashboard-Anordnung konnte nicht geladen werden. Die Standardanordnung wird verwendet.";

export function pendingDashboardLayoutLoad(): DashboardLayoutLoadState {
  return { ready: false, layout: cloneDashboardLayout(DEFAULT_DASHBOARD_LAYOUT), warning: "" };
}

export function completeDashboardLayoutLoad(value: unknown): DashboardLayoutLoadState {
  return { ready: true, layout: normalizeDashboardLayout(value), warning: "" };
}

export function failDashboardLayoutLoad(): DashboardLayoutLoadState {
  return { ready: true, layout: cloneDashboardLayout(DEFAULT_DASHBOARD_LAYOUT), warning: t(DASHBOARD_LOAD_WARNING) };
}

export function canEditDashboardLayout(load: DashboardLayoutLoadState): boolean {
  return load.ready;
}

export function commitDashboardChange(
  current: DashboardLayoutState,
  undo: DashboardLayoutState[],
  next: DashboardLayoutState,
  message: string,
): DashboardEditorChange {
  const normalized = normalizeDashboardLayout(next);
  if (dashboardLayoutsEqual(current, normalized)) return { current, undo, message: "" };
  return { current: normalized, undo: [...undo, cloneDashboardLayout(current)], message };
}

export function undoDashboardChange(current: DashboardLayoutState, undo: DashboardLayoutState[]): DashboardEditorChange {
  const previous = undo.at(-1);
  if (!previous) return { current, undo, message: "" };
  return {
    current: cloneDashboardLayout(previous),
    undo: undo.slice(0, -1),
    message: t("Letzte Änderung rückgängig gemacht."),
  };
}

export function resetDashboardChange(current: DashboardLayoutState, undo: DashboardLayoutState[]): DashboardEditorChange {
  return commitDashboardChange(current, undo, cloneDashboardLayout(DEFAULT_DASHBOARD_LAYOUT), t("Standardanordnung wiederhergestellt."));
}

export function cancelDashboardSession(baseline: DashboardLayoutState): DashboardEditorChange {
  return { current: cloneDashboardLayout(baseline), undo: [], message: t("Änderungen verworfen.") };
}

export function rejectDashboardSave(): { editing: true; error: string; message: string } {
  return { editing: true, error: t(DASHBOARD_SAVE_ERROR), message: t(DASHBOARD_SAVE_ERROR) };
}

export function applyDashboardKeyboardAction(
  current: DashboardLayoutState,
  undo: DashboardLayoutState[],
  breakpoint: DashboardBreakpoint,
  id: DashboardWidgetId,
  key: string,
  shiftKey: boolean,
  label: string,
): DashboardEditorChange {
  if (key === "Delete" || key === "Backspace") {
    const next = removeDashboardWidget(current, id);
    return next === current
      ? { current, undo, message: t("Mindestens ein Widget muss sichtbar bleiben.") }
      : commitDashboardChange(current, undo, next, t("{label} entfernt.", { label }));
  }

  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
    return { current, undo, message: "" };
  }
  const entries = current.layouts[breakpoint] ?? [];
  const target = entries.find((entry) => entry.i === id);
  if (!target) return { current, undo, message: "" };
  const deltaX = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
  const deltaY = key === "ArrowUp" ? -1 : key === "ArrowDown" ? 1 : 0;
  const cols = DASHBOARD_COLS[breakpoint];
  const changed = entries.map((entry) => entry.i === id
    ? shiftKey
      ? {
          ...entry,
          w: Math.min(cols, Math.max(entry.minW ?? 1, entry.w + deltaX)),
          h: Math.min(entry.maxH ?? Number.POSITIVE_INFINITY, Math.max(entry.minH ?? 1, entry.h + deltaY)),
        }
      : { ...entry, x: entry.x + deltaX, y: entry.y + deltaY }
    : entry);
  const visibleWithTargetFirst = [id, ...current.visible.filter((widgetId) => widgetId !== id)];
  const layout = normalizeBreakpointLayout(changed, breakpoint, visibleWithTargetFirst);
  return commitDashboardChange(
    current,
    undo,
    { ...current, layouts: { ...current.layouts, [breakpoint]: layout } },
    shiftKey ? t("{label} in der Größe geändert.", { label }) : t("{label} verschoben.", { label }),
  );
}
