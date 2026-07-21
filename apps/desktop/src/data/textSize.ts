export const TEXT_SIZE_STORAGE_KEY = "tarlog-text-size";

export type TextSize = "compact" | "standard" | "large" | "extra-large";

export const TEXT_SIZE_OPTIONS: ReadonlyArray<{
  value: TextSize;
  label: string;
  description: string;
  scale: number;
}> = [
  { value: "compact", label: "Klein", description: "Mehr Inhalt auf einmal", scale: 0.92 },
  { value: "standard", label: "Standard", description: "Empfohlene Größe", scale: 1 },
  { value: "large", label: "Groß", description: "Besser lesbar", scale: 1.12 },
  { value: "extra-large", label: "Sehr groß", description: "Maximale Lesbarkeit", scale: 1.24 },
];

export function normalizeTextSize(value: unknown): TextSize {
  return TEXT_SIZE_OPTIONS.some((option) => option.value === value) ? value as TextSize : "standard";
}

export function loadTextSize(): TextSize {
  try { return normalizeTextSize(window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY)); }
  catch { return "standard"; }
}

export function applyTextSize(value: TextSize) {
  const normalized = normalizeTextSize(value);
  document.documentElement.dataset.textSize = normalized;
  const option = TEXT_SIZE_OPTIONS.find((item) => item.value === normalized)!;
  document.documentElement.style.setProperty("--text-size-scale", String(option.scale));
}

export function saveTextSize(value: TextSize) {
  const normalized = normalizeTextSize(value);
  applyTextSize(normalized);
  try { window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, normalized); }
  catch { /* The preference remains active for this session. */ }
}

export function applyStoredTextSize() { applyTextSize(loadTextSize()); }
