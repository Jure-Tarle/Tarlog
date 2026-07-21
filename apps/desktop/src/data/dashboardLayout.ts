import type { LayoutItem, ResponsiveLayouts } from "react-grid-layout";
import { getDeviceSetting, setDeviceSetting } from "./settings";

export const DASHBOARD_LAYOUT_KEY = "dashboard_layout_v1";

export const DASHBOARD_WIDGET_IDS = [
  "timer",
  "today",
  "week",
  "month",
  "entriesToday",
  "billable",
  "nonBillable",
  "activeProjects",
  "activeDays",
  "focusToday",
  "compliance",
  "quickStart",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];
export type DashboardBreakpoint = "lg" | "md" | "sm";
export type DashboardLayouts = ResponsiveLayouts<DashboardBreakpoint>;

const DASHBOARD_LAYOUT_VERSION = 2 as const;

export interface DashboardLayoutState {
  version: typeof DASHBOARD_LAYOUT_VERSION;
  visible: DashboardWidgetId[];
  layouts: DashboardLayouts;
}

export const DASHBOARD_COLS: Record<DashboardBreakpoint, number> = { lg: 12, md: 6, sm: 1 };

const SIZE: Record<DashboardWidgetId, Pick<LayoutItem, "minW" | "minH" | "maxH">> = {
  timer: { minW: 1, minH: 4, maxH: 8 },
  today: { minW: 2, minH: 3, maxH: 4 },
  week: { minW: 2, minH: 3, maxH: 4 },
  month: { minW: 2, minH: 3, maxH: 4 },
  entriesToday: { minW: 2, minH: 3, maxH: 4 },
  billable: { minW: 2, minH: 3, maxH: 4 },
  nonBillable: { minW: 2, minH: 3, maxH: 4 },
  activeProjects: { minW: 2, minH: 3, maxH: 4 },
  activeDays: { minW: 2, minH: 3, maxH: 4 },
  focusToday: { minW: 2, minH: 3, maxH: 4 },
  compliance: { minW: 2, minH: 3, maxH: 4 },
  quickStart: { minW: 1, minH: 4, maxH: 10 },
};

const item = (i: DashboardWidgetId, x: number, y: number, w: number, h: number): LayoutItem => ({
  i,
  x,
  y,
  w,
  h,
  ...SIZE[i],
});

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutState = {
  version: DASHBOARD_LAYOUT_VERSION,
  visible: [...DASHBOARD_WIDGET_IDS],
  layouts: {
    lg: [
      item("today", 0, 0, 3, 3),
      item("week", 3, 0, 3, 3),
      item("month", 6, 0, 3, 3),
      item("entriesToday", 9, 0, 3, 3),
      item("billable", 0, 3, 3, 3),
      item("nonBillable", 3, 3, 3, 3),
      item("activeProjects", 6, 3, 3, 3),
      item("activeDays", 9, 3, 3, 3),
      item("timer", 0, 6, 6, 5),
      item("quickStart", 6, 6, 6, 5),
      item("focusToday", 0, 11, 6, 3),
      item("compliance", 6, 11, 6, 3),
    ],
    md: [
      item("today", 0, 0, 3, 3),
      item("week", 3, 0, 3, 3),
      item("month", 0, 3, 3, 3),
      item("entriesToday", 3, 3, 3, 3),
      item("billable", 0, 6, 3, 3),
      item("nonBillable", 3, 6, 3, 3),
      item("activeProjects", 0, 9, 3, 3),
      item("activeDays", 3, 9, 3, 3),
      item("timer", 0, 12, 3, 5),
      item("quickStart", 3, 12, 3, 5),
      item("focusToday", 0, 17, 3, 3),
      item("compliance", 3, 17, 3, 3),
    ],
    sm: DASHBOARD_WIDGET_IDS.reduce<LayoutItem[]>((layout, id) => {
      const height = id === "timer" || id === "quickStart" ? 5 : 3;
      const y = layout.reduce((bottom, entry) => Math.max(bottom, entry.y + entry.h), 0);
      layout.push(item(id, 0, y, 1, height));
      return layout;
    }, []),
  },
};

function isWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);
}

function finiteInt(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

function collides(a: LayoutItem, b: LayoutItem): boolean {
  return a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function migrateLegacyDesktopLayout(value: unknown, storedVersion: unknown): unknown {
  if (storedVersion !== 1 || !Array.isArray(value)) return value;

  const layout = value.map((entry) => entry && typeof entry === "object" ? { ...entry } : entry);
  const timer = layout.find((entry) => entry && typeof entry === "object" && (entry as { i?: unknown }).i === "timer") as Partial<LayoutItem> | undefined;
  const quickStart = layout.find((entry) => entry && typeof entry === "object" && (entry as { i?: unknown }).i === "quickStart") as Partial<LayoutItem> | undefined;
  const isLegacySplit = timer?.x === 0
    && timer.w === 5
    && quickStart?.x === 5
    && quickStart.w === 7
    && timer.y === quickStart.y
    && timer.h === quickStart.h;

  if (!isLegacySplit) return layout;
  timer.w = 6;
  quickStart.x = 6;
  quickStart.w = 6;
  return layout;
}

export function normalizeBreakpointLayout(
  value: unknown,
  breakpoint: DashboardBreakpoint,
  visible: readonly DashboardWidgetId[],
): LayoutItem[] {
  const cols = DASHBOARD_COLS[breakpoint];
  const source = Array.isArray(value) ? value : [];
  const defaults = new Map((DEFAULT_DASHBOARD_LAYOUT.layouts[breakpoint] ?? []).map((entry) => [entry.i, entry]));
  const byId = new Map<string, unknown>();
  for (const entry of source) {
    if (entry && typeof entry === "object" && isWidgetId((entry as { i?: unknown }).i) && !byId.has((entry as { i: string }).i)) {
      byId.set((entry as { i: string }).i, entry);
    }
  }

  const normalized: LayoutItem[] = [];
  for (const id of visible) {
    const fallback = defaults.get(id) ?? item(id, 0, normalized.length * 3, cols, SIZE[id].minH ?? 3);
    const raw = (byId.get(id) ?? fallback) as Partial<LayoutItem>;
    const minW = Math.min(cols, SIZE[id].minW ?? 1);
    const minH = SIZE[id].minH ?? 1;
    const w = Math.min(cols, Math.max(minW, finiteInt(raw.w, fallback.w)));
    const h = Math.min(SIZE[id].maxH ?? Number.POSITIVE_INFINITY, Math.max(minH, finiteInt(raw.h, fallback.h)));
    const next: LayoutItem = {
      i: id,
      x: Math.min(Math.max(0, finiteInt(raw.x, fallback.x)), cols - w),
      y: finiteInt(raw.y, fallback.y),
      w,
      h,
      minW,
      minH,
      maxW: cols,
      maxH: SIZE[id].maxH,
      isBounded: true,
    };
    while (normalized.some((other) => collides(next, other))) next.y += 1;
    normalized.push(next);
  }
  return normalized;
}

export function normalizeDashboardLayout(value: unknown): DashboardLayoutState {
  const raw = value && typeof value === "object" ? value as Partial<DashboardLayoutState> : {};
  const storedVersion = value && typeof value === "object" ? (value as { version?: unknown }).version : undefined;
  const visible = Array.isArray(raw.visible)
    ? [...new Set(raw.visible.filter(isWidgetId))]
    : [...DASHBOARD_WIDGET_IDS];
  const safeVisible = visible.length ? visible : [...DASHBOARD_WIDGET_IDS];
  return {
    version: DASHBOARD_LAYOUT_VERSION,
    visible: safeVisible,
    layouts: {
      lg: normalizeBreakpointLayout(migrateLegacyDesktopLayout(raw.layouts?.lg, storedVersion), "lg", safeVisible),
      md: normalizeBreakpointLayout(raw.layouts?.md, "md", safeVisible),
      sm: normalizeBreakpointLayout(raw.layouts?.sm, "sm", safeVisible),
    },
  };
}

export function addDashboardWidget(state: DashboardLayoutState, id: DashboardWidgetId): DashboardLayoutState {
  if (state.visible.includes(id)) return state;
  const visible = [...state.visible, id];
  return normalizeDashboardLayout({ ...state, visible });
}

export function removeDashboardWidget(state: DashboardLayoutState, id: DashboardWidgetId): DashboardLayoutState {
  if (!state.visible.includes(id) || state.visible.length === 1) return state;
  const visible = state.visible.filter((widgetId) => widgetId !== id);
  return normalizeDashboardLayout({ ...state, visible });
}

export async function loadDashboardLayout(): Promise<DashboardLayoutState> {
  return normalizeDashboardLayout(await getDeviceSetting<unknown>(DASHBOARD_LAYOUT_KEY));
}

export async function saveDashboardLayout(value: unknown): Promise<DashboardLayoutState> {
  const normalized = normalizeDashboardLayout(value);
  await setDeviceSetting(DASHBOARD_LAYOUT_KEY, normalized);
  return normalized;
}

export function cloneDashboardLayout(state: DashboardLayoutState): DashboardLayoutState {
  return normalizeDashboardLayout(structuredClone(state));
}

export function dashboardLayoutsEqual(a: DashboardLayoutState, b: DashboardLayoutState): boolean {
  return JSON.stringify(normalizeDashboardLayout(a)) === JSON.stringify(normalizeDashboardLayout(b));
}
