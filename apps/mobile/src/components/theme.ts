/**
 * theme.ts — the single design-token source for the iOS app (doc 11 §1).
 *
 * Ledger direction: neutral warm-paper base, exactly ONE accent (active timer +
 * primary action), compliance traffic-light (green/yellow/red) as the only other
 * semantic color. Tabular/mono numerics for every time and amount. Hairline
 * borders instead of shadows. Dark + light are first-class.
 *
 * No component hard-codes a color; everything reads from `useTheme()`.
 */
import { Platform, useColorScheme } from "react-native";

/** The resolved color set for one appearance. */
export interface ThemePalette {
  /** Page background (warm paper / near-black). */
  bg: string;
  /** Raised surface (cards, rows). */
  surface: string;
  /** Secondary fill (input wells, alt rows). */
  surfaceAlt: string;
  /** Hairline divider. */
  border: string;
  /** Stronger divider / focused field. */
  borderStrong: string;
  /** Primary text. */
  text: string;
  /** Secondary text (labels). */
  textMuted: string;
  /** Tertiary text (hints, disabled). */
  textFaint: string;
  /** The single accent — active timer + primary action only. */
  accent: string;
  /** Text/icon on top of the accent fill. */
  onAccent: string;
  /** Faint accent wash for active backgrounds. */
  accentSoft: string;
  /** Compliance green. */
  ok: string;
  /** Compliance yellow. */
  warn: string;
  /** Compliance / destructive red. */
  danger: string;
}

const LIGHT: ThemePalette = {
  bg: "#FBFBF9",
  surface: "#FFFFFF",
  surfaceAlt: "#F3F3F0",
  border: "#E5E4DF",
  borderStrong: "#CFCEC8",
  text: "#1A1A17",
  textMuted: "#6C6B64",
  textFaint: "#9B9A92",
  accent: "#0F766E",
  onAccent: "#FFFFFF",
  accentSoft: "#E2F1EE",
  ok: "#15803D",
  warn: "#B45309",
  danger: "#B91C1C",
};

const DARK: ThemePalette = {
  bg: "#111110",
  surface: "#1B1B19",
  surfaceAlt: "#232320",
  border: "#2E2E2A",
  borderStrong: "#3C3B36",
  text: "#EDECE7",
  textMuted: "#9E9D95",
  textFaint: "#6F6E67",
  accent: "#2DD4BF",
  onAccent: "#07211D",
  accentSoft: "#132A26",
  ok: "#4ADE80",
  warn: "#FBBF24",
  danger: "#F87171",
};

/** 4-pt spacing scale (dense ledger rhythm). */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Deliberately non-uniform radii (doc 11 §1: no uniform radius). */
export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

/**
 * Monospaced family for times/amounts so columns align. iOS ships Menlo;
 * Android falls back to its monospace. Pair with `fontVariant: ["tabular-nums"]`.
 */
export const monoFamily = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
}) as string;

export interface Theme {
  colors: ThemePalette;
  scheme: "light" | "dark";
  /** Hairline width for the current display. */
  hairline: number;
}

/** Resolve the active theme from the OS appearance. */
export function useTheme(): Theme {
  const scheme = useColorScheme() ?? "light";
  return {
    colors: scheme === "dark" ? DARK : LIGHT,
    scheme,
    hairline: Platform.OS === "ios" ? 0.5 : 1,
  };
}
