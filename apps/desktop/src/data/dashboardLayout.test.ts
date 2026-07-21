import { describe, expect, it } from "vitest";
import {
  DASHBOARD_WIDGET_IDS,
  DEFAULT_DASHBOARD_LAYOUT,
  addDashboardWidget,
  normalizeDashboardLayout,
  removeDashboardWidget,
} from "./dashboardLayout";

describe("dashboard layout", () => {
  it("recovers from corrupt storage with complete bounded defaults", () => {
    const value = normalizeDashboardLayout({ visible: ["today", "today", "invalid"], layouts: { lg: [{ i: "today", x: 99, y: -3, w: 99, h: 0 }] } });
    expect(value.visible).toEqual(["today"]);
    expect(value.layouts.lg).toHaveLength(1);
    expect(value.layouts.lg?.[0]).toMatchObject({ i: "today", x: 0, y: 0, w: 12, h: 3 });
  });

  it("restores all widgets when persisted visibility is unusable", () => {
    expect(normalizeDashboardLayout({ visible: [] }).visible).toEqual(DASHBOARD_WIDGET_IDS);
    expect(normalizeDashboardLayout(null).visible).toEqual(DASHBOARD_WIDGET_IDS);
  });

  it("adds without duplicates and keeps at least one widget", () => {
    const onlyToday = normalizeDashboardLayout({ visible: ["today"] });
    expect(addDashboardWidget(onlyToday, "today")).toBe(onlyToday);
    expect(removeDashboardWidget(onlyToday, "today")).toBe(onlyToday);
    expect(addDashboardWidget(onlyToday, "week").visible).toEqual(["today", "week"]);
  });

  it("normalizes collisions and creates layouts for every breakpoint", () => {
    const value = normalizeDashboardLayout({
      ...DEFAULT_DASHBOARD_LAYOUT,
      visible: ["today", "week"],
      layouts: { lg: [
        { i: "today", x: 0, y: 0, w: 3, h: 2 },
        { i: "week", x: 0, y: 0, w: 3, h: 2 },
      ] },
    });
    expect(value.layouts.lg?.[1]?.y).toBeGreaterThanOrEqual(3);
    expect(value.layouts.md).toHaveLength(2);
    expect(value.layouts.sm?.every((entry) => entry.x === 0 && entry.w === 1)).toBe(true);
  });

  it("keeps metric widgets large enough for edit chrome and scaled text", () => {
    const value = normalizeDashboardLayout({
      visible: ["today"],
      layouts: { lg: [{ i: "today", x: 0, y: 0, w: 1, h: 1 }] },
    });
    expect(value.layouts.lg?.[0]).toMatchObject({ w: 2, h: 3, minW: 2, minH: 3 });
  });

  it("migrates the legacy 5/7 desktop hero split to the balanced 50/50 layout once", () => {
    const value = normalizeDashboardLayout({
      version: 1,
      visible: ["timer", "quickStart"],
      layouts: { lg: [
        { i: "timer", x: 0, y: 0, w: 5, h: 7 },
        { i: "quickStart", x: 5, y: 0, w: 7, h: 7 },
      ] },
    });

    expect(value.version).toBe(2);
    expect(value.layouts.lg).toEqual(expect.arrayContaining([
      expect.objectContaining({ i: "timer", x: 0, w: 6 }),
      expect.objectContaining({ i: "quickStart", x: 6, w: 6 }),
    ]));
  });
});
