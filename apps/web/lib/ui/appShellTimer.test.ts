import { describe, expect, it } from "vitest";
import {
  TIMER_STATUS_PRESENTATION,
  mergeTimerSnapshot,
  type AppShellTimer,
} from "./appShellTimer";

const base: AppShellTimer = {
  timer_id: "018f0000-0000-7000-8000-000000000001",
  project_id: "018f0000-0000-7000-8000-000000000002",
  task_id: "018f0000-0000-7000-8000-000000000003",
  status: "running",
  started_at: 1_700_000_000_000,
  accumulated_pause_seconds: 0,
  active_pause_started_at: null,
  projectName: "Atlas",
  taskName: "Konzeption",
};

describe("AppShell timer presentation", () => {
  it("deckt alle sieben fachlichen Timerstatus ab", () => {
    expect(Object.keys(TIMER_STATUS_PRESENTATION)).toEqual([
      "idle",
      "running",
      "paused",
      "stopped",
      "needs_description",
      "sync_pending",
      "conflict",
    ]);
    expect(TIMER_STATUS_PRESENTATION.sync_pending.label).toBe("Sync ausstehend");
    expect(TIMER_STATUS_PRESENTATION.conflict.label).toBe("Konflikt");
  });
});

describe("mergeTimerSnapshot", () => {
  it("erhält Join-Namen beim API-Poll mit identischen IDs", () => {
    const apiSnapshot = { ...base };
    delete apiSnapshot.projectName;
    delete apiSnapshot.taskName;

    expect(mergeTimerSnapshot(base, apiSnapshot)).toMatchObject({
      projectName: "Atlas",
      taskName: "Konzeption",
    });
  });

  it("verwirft nur den Namen, dessen fachliche ID gewechselt hat", () => {
    const apiSnapshot: AppShellTimer = {
      ...base,
      task_id: "018f0000-0000-7000-8000-000000000004",
    };
    delete apiSnapshot.projectName;
    delete apiSnapshot.taskName;

    expect(mergeTimerSnapshot(base, apiSnapshot)).toMatchObject({
      projectName: "Atlas",
      taskName: null,
    });
  });

  it("respektiert explizite API-Namen einschließlich null", () => {
    expect(mergeTimerSnapshot(base, { ...base, projectName: null, taskName: "Review" })).toMatchObject({
      projectName: null,
      taskName: "Review",
    });
  });

  it("löscht den Shell-Timer, wenn die API null liefert", () => {
    expect(mergeTimerSnapshot(base, null)).toBeNull();
  });
});
