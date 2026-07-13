import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumePendingTimerStop,
  dispatchNavigationRequest,
  isNavigationRequest,
  queueNavigationRequest,
  TIMER_STATUS_LABELS,
} from "./timer";

describe("desktop timer navigation requests", () => {
  beforeEach(() => {
    consumePendingTimerStop();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puffert eine Stop-Aktion bis zum exakt einmaligen Consume", () => {
    queueNavigationRequest({ route: "timer", action: "stop" });

    expect(consumePendingTimerStop()).toBe(true);
    expect(consumePendingTimerStop()).toBe(false);
  });

  it("puffert den Stop vor dem Dispatch ohne ihn danach erneut einzureihen", () => {
    let consumedDuringDispatch = false;
    vi.stubGlobal("window", {
      dispatchEvent: () => {
        consumedDuringDispatch = consumePendingTimerStop();
        return true;
      },
    });

    dispatchNavigationRequest({ route: "timer", action: "stop" });

    expect(consumedDuringDispatch).toBe(true);
    expect(consumePendingTimerStop()).toBe(false);
  });

  it("puffert reine Navigation und fremde Routen nicht als Timer-Stop", () => {
    queueNavigationRequest({ route: "timer" });
    queueNavigationRequest({ route: "backdating" });

    expect(consumePendingTimerStop()).toBe(false);
  });

  it("akzeptiert nur bekannte Formen des Navigation-Events", () => {
    expect(isNavigationRequest({ route: "timer", action: "stop" })).toBe(true);
    expect(isNavigationRequest({ route: "backdating" })).toBe(true);
    expect(isNavigationRequest({ route: "timer", action: "start" })).toBe(false);
    expect(isNavigationRequest({ action: "stop" })).toBe(false);
  });
});

describe("desktop timer status labels", () => {
  it("bildet alle sieben fachlichen Statuswerte explizit ab", () => {
    expect(TIMER_STATUS_LABELS).toEqual({
      idle: "Bereit",
      running: "Läuft",
      paused: "Pausiert",
      stopped: "Gestoppt",
      needs_description: "Beschreibung fehlt",
      sync_pending: "Sync ausstehend",
      conflict: "Konflikt",
    });
  });
});
