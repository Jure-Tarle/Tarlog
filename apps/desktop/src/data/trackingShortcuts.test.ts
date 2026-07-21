import { describe, expect, it } from "vitest";
import {
  acceleratorFromKeyboardEvent,
  validateTrackingShortcuts,
  type TrackingShortcut,
} from "./trackingShortcuts";

function binding(accelerator: string, id = "one"): TrackingShortcut {
  return { id, projectId: "project-1", action: "toggle", accelerator };
}

describe("tracking shortcuts", () => {
  it("requires a modifier for normal keys", () => {
    expect(acceleratorFromKeyboardEvent({
      key: "k", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false,
    } as KeyboardEvent)).toBeNull();
  });

  it("normalizes macOS and Windows modifiers to a portable accelerator", () => {
    expect(acceleratorFromKeyboardEvent({
      key: "1", metaKey: true, ctrlKey: false, altKey: false, shiftKey: true,
    } as KeyboardEvent)).toBe("CommandOrControl+Shift+1");
    expect(acceleratorFromKeyboardEvent({
      key: "p", metaKey: false, ctrlKey: true, altKey: true, shiftKey: false,
    } as KeyboardEvent)).toBe("CommandOrControl+Alt+P");
  });

  it("rejects duplicate combinations before native registration", () => {
    expect(() => validateTrackingShortcuts([
      binding("CommandOrControl+Shift+1"),
      binding("commandorcontrol+shift+1", "two"),
    ])).toThrow(/doppelt vergeben/);
  });
});
