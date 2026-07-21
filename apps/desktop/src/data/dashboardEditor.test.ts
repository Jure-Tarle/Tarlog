import { describe, expect, it } from "vitest";
import { addDashboardWidget, normalizeDashboardLayout, removeDashboardWidget } from "./dashboardLayout";
import {
  DASHBOARD_SAVE_ERROR,
  applyDashboardKeyboardAction,
  canEditDashboardLayout,
  cancelDashboardSession,
  commitDashboardChange,
  completeDashboardLayoutLoad,
  failDashboardLayoutLoad,
  pendingDashboardLayoutLoad,
  rejectDashboardSave,
  resetDashboardChange,
  undoDashboardChange,
} from "./dashboardEditor";

const only = (...visible: Array<"today" | "week" | "timer">) => normalizeDashboardLayout({ visible });

describe("dashboard editor session", () => {
  it("blocks editing until device layout loading establishes the baseline", () => {
    const pending = pendingDashboardLayoutLoad();
    expect(canEditDashboardLayout(pending)).toBe(false);
    const saved = only("week");
    const loaded = completeDashboardLayoutLoad(saved);
    expect(canEditDashboardLayout(loaded)).toBe(true);
    expect(loaded.layout.visible).toEqual(["week"]);
    expect(cancelDashboardSession(loaded.layout).current.visible).toEqual(["week"]);
  });

  it("unlocks an explicit normalized default only after a load failure", () => {
    const failed = failDashboardLayoutLoad();
    expect(canEditDashboardLayout(failed)).toBe(true);
    expect(failed.warning).not.toBe("");
    expect(failed.layout.visible.length).toBeGreaterThan(0);
  });

  it("records undo only when a change is committed", () => {
    const baseline = only("today");
    const unchanged = commitDashboardChange(baseline, [], baseline, "Unverändert");
    expect(unchanged.undo).toHaveLength(0);
    const changed = commitDashboardChange(baseline, [], addDashboardWidget(baseline, "week"), "Woche hinzugefügt.");
    expect(changed.undo).toHaveLength(1);
    expect(changed.message).toBe("Woche hinzugefügt.");
  });

  it("makes reset undoable and cancel restores the session baseline", () => {
    const baseline = only("today", "week");
    const customized = commitDashboardChange(baseline, [], removeDashboardWidget(baseline, "week"), "Woche entfernt.");
    const reset = resetDashboardChange(customized.current, customized.undo);
    expect(reset.undo.length).toBeGreaterThan(customized.undo.length);
    expect(undoDashboardChange(reset.current, reset.undo).current.visible).toEqual(["today"]);
    expect(cancelDashboardSession(baseline)).toMatchObject({ current: baseline, undo: [], message: "Änderungen verworfen." });
  });

  it("moves and resizes with keyboard actions and announces both operations", () => {
    const baseline = only("today", "week");
    const before = baseline.layouts.lg?.find((entry) => entry.i === "week");
    const moved = applyDashboardKeyboardAction(baseline, [], "lg", "week", "ArrowDown", false, "Woche");
    const afterMove = moved.current.layouts.lg?.find((entry) => entry.i === "week");
    expect(afterMove?.y).toBeGreaterThan(before?.y ?? 0);
    expect(moved.message).toBe("Woche verschoben.");
    const resized = applyDashboardKeyboardAction(moved.current, moved.undo, "lg", "week", "ArrowRight", true, "Woche");
    expect(resized.current.layouts.lg?.find((entry) => entry.i === "week")?.w).toBe((afterMove?.w ?? 0) + 1);
    expect(resized.message).toBe("Woche in der Größe geändert.");
  });

  it.each(["Delete", "Backspace"])("removes on %s and keeps an accessible message", (key) => {
    const removed = applyDashboardKeyboardAction(only("today", "week"), [], "lg", "week", key, false, "Woche");
    expect(removed.current.visible).toEqual(["today"]);
    expect(removed.message).toBe("Woche entfernt.");
  });

  it("keeps edit mode and exposes an aria-live-ready message after a failed save", () => {
    expect(rejectDashboardSave()).toEqual({ editing: true, error: DASHBOARD_SAVE_ERROR, message: DASHBOARD_SAVE_ERROR });
  });
});
