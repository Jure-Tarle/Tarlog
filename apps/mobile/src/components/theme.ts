/**
 * theme.ts, the single design-token source for the iOS app (doc 11 §1).
 *
 * Ledger direction: neutral warm-paper base, exactly ONE accent (active timer +
 * primary action), compliance traffic-light (green/yellow/red) as the only other
 * semantic color. Tabular/mono numerics for every time and amount. Hairline
 * borders instead of shadows. Dark + light are first-class.
 *
 * No component hard-codes a color; everything reads from `useTheme()`.
 */
import { Platform, PlatformColor, type ColorValue, useColorScheme } from "react-native";

/** The resolved color set for one appearance. */
export interface ThemePalette {
  /** Page background (warm paper / near-black). */
  bg: ColorValue;
  /** Raised surface (cards, rows). */
  surface: ColorValue;
  /** Secondary fill (input wells, alt rows). */
  surfaceAlt: ColorValue;
  /** Hairline divider. */
  border: ColorValue;
  /** Stronger divider / focused field. */
  borderStrong: ColorValue;
  /** Primary text. */
  text: ColorValue;
  /** Secondary text (labels). */
  textMuted: ColorValue;
  /** Tertiary text (hints, disabled). */
  textFaint: ColorValue;
  /** The single accent, active timer + primary action only. */
  accent: ColorValue;
  /** Text/icon on top of the accent fill. */
  onAccent: ColorValue;
  /** Faint accent wash for active backgrounds. */
  accentSoft: ColorValue;
  /** Compliance green. */
  ok: ColorValue;
  /** Compliance yellow. */
  warn: ColorValue;
  /** Compliance / destructive red. */
  danger: ColorValue;
}

const ios = (name: string, fallback: string): ColorValue =>
  Platform.OS === "ios" ? PlatformColor(name) : fallback;

const LIGHT: ThemePalette = {
  bg: ios("systemBackgroundColor", "#F2F2F7"),
  surface: ios("secondarySystemBackgroundColor", "#FFFFFF"),
  surfaceAlt: ios("tertiarySystemBackgroundColor", "#E5E5EA"),
  border: ios("separatorColor", "#D1D1D6"),
  borderStrong: ios("opaqueSeparatorColor", "#C7C7CC"),
  text: ios("labelColor", "#1C1C1E"),
  textMuted: ios("secondaryLabelColor", "#636366"),
  textFaint: ios("tertiaryLabelColor", "#8E8E93"),
  accent: ios("systemBlueColor", "#007AFF"),
  onAccent: "#FFFFFF",
  accentSoft: "#E5F1FF",
  ok: ios("systemGreenColor", "#248A3D"),
  warn: ios("systemOrangeColor", "#C93400"),
  danger: ios("systemRedColor", "#D70015"),
};

const DARK: ThemePalette = {
  bg: ios("systemBackgroundColor", "#000000"),
  surface: ios("secondarySystemBackgroundColor", "#1C1C1E"),
  surfaceAlt: ios("tertiarySystemBackgroundColor", "#2C2C2E"),
  border: ios("separatorColor", "#38383A"),
  borderStrong: ios("opaqueSeparatorColor", "#48484A"),
  text: ios("labelColor", "#FFFFFF"),
  textMuted: ios("secondaryLabelColor", "#AEAEB2"),
  textFaint: ios("tertiaryLabelColor", "#8E8E93"),
  accent: ios("systemBlueColor", "#0A84FF"),
  onAccent: "#FFFFFF",
  accentSoft: "#102A43",
  ok: ios("systemGreenColor", "#30D158"),
  warn: ios("systemOrangeColor", "#FF9F0A"),
  danger: ios("systemRedColor", "#FF453A"),
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
  /** String colors for navigation libraries whose types don't accept PlatformColor. */
  navigation: {
    bg: string;
    surface: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
  };
  scheme: "light" | "dark";
  /** Hairline width for the current display. */
  hairline: number;
}

/** Resolve the active theme from the OS appearance. */
export function useTheme(): Theme {
  const scheme = useColorScheme() ?? "light";
  const navigation = scheme === "dark"
    ? { bg: "#000000", surface: "#1C1C1E", border: "#38383A", text: "#FFFFFF", textMuted: "#AEAEB2", accent: "#0A84FF" }
    : { bg: "#F2F2F7", surface: "#FFFFFF", border: "#D1D1D6", text: "#1C1C1E", textMuted: "#636366", accent: "#007AFF" };
  return {
    colors: scheme === "dark" ? DARK : LIGHT,
    navigation,
    scheme,
    hairline: Platform.OS === "ios" ? 0.5 : 1,
  };
}
