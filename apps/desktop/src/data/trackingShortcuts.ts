import type { Uuid } from "@tarlog/core";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { trackingShortcutsReplace } from "../lib/bridge";
import { getDeviceSetting, setDeviceSetting } from "./settings";

export const TRACKING_SHORTCUTS_KEY = "tracking_shortcuts_v1";
export const TRACKING_SHORTCUT_EVENT = "shortcut://tracking";

export type TrackingShortcutAction = "toggle" | "start" | "stop";

export interface TrackingShortcut {
  id: string;
  projectId: Uuid;
  action: TrackingShortcutAction;
  accelerator: string;
}

export async function loadTrackingShortcuts(): Promise<TrackingShortcut[]> {
  const value = await getDeviceSetting<unknown>(TRACKING_SHORTCUTS_KEY);
  if (!Array.isArray(value)) return [];
  return value.filter(isTrackingShortcut);
}

export async function registerTrackingShortcuts(bindings: TrackingShortcut[]): Promise<void> {
  await trackingShortcutsReplace(bindings);
}

export async function saveTrackingShortcuts(bindings: TrackingShortcut[]): Promise<void> {
  validateTrackingShortcuts(bindings);
  // Register before persisting so a system conflict does not save a broken set.
  // The native API replaces the registration set; restore the last durable set
  // if another application already owns one of the requested combinations.
  const previous = await loadTrackingShortcuts();
  try {
    await registerTrackingShortcuts(bindings);
  } catch (error) {
    await registerTrackingShortcuts(previous).catch(() => {});
    throw error;
  }
  await setDeviceSetting(TRACKING_SHORTCUTS_KEY, bindings);
}

export function validateTrackingShortcuts(bindings: TrackingShortcut[]): void {
  const used = new Set<string>();
  for (const binding of bindings) {
    if (!binding.projectId) throw new Error("Bitte für jeden Kurzbefehl ein Projekt auswählen.");
    if (!binding.accelerator) throw new Error("Bitte jede Tastenkombination aufnehmen.");
    const key = binding.accelerator.toLowerCase();
    if (used.has(key)) throw new Error(`Die Tastenkombination ${formatAccelerator(binding.accelerator)} ist doppelt vergeben.`);
    used.add(key);
  }
}

export function acceleratorFromKeyboardEvent(event: KeyboardEvent | ReactKeyboardEvent): string | null {
  const key = normalizedKey(event.key);
  if (!key || ["Meta", "Control", "Alt", "Shift"].includes(key)) return null;
  // A global single-letter shortcut would interfere with normal typing.
  if (!event.metaKey && !event.ctrlKey && !event.altKey) return null;
  const modifiers: string[] = [];
  if (event.metaKey || event.ctrlKey) modifiers.push("CommandOrControl");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return [...modifiers, key].join("+");
}

function normalizedKey(key: string): string | null {
  if (key.length === 1 && /[a-z0-9]/i.test(key)) return key.toUpperCase();
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) return key;
  const names: Record<string, string> = {
    " ": "Space",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Enter: "Enter",
  };
  return names[key] ?? null;
}

export function formatAccelerator(accelerator: string): string {
  return accelerator
    .replace("CommandOrControl", navigator.platform.includes("Mac") ? "⌘" : "Ctrl")
    .replaceAll("+Alt", navigator.platform.includes("Mac") ? "⌥" : "+ Alt")
    .replaceAll("+Shift", navigator.platform.includes("Mac") ? "⇧" : "+ Shift")
    .replaceAll("+", " ");
}

function isTrackingShortcut(value: unknown): value is TrackingShortcut {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TrackingShortcut>;
  return typeof item.id === "string" && typeof item.projectId === "string" &&
    typeof item.accelerator === "string" &&
    (item.action === "toggle" || item.action === "start" || item.action === "stop");
}
