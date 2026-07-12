/**
 * ui.tsx — the shared primitive kit for every screen (doc 11 §1 Ledger look).
 *
 * These are the ONLY building blocks the screens use, so the design direction
 * (one accent, tabular numerics, hairline borders, no shadows, non-uniform
 * radii) is enforced in one place. Nothing here touches the DB or business
 * logic — pure presentation over `react-native` primitives.
 */
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { monoFamily, radius, space, useTheme } from "./theme";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Full-bleed page background with safe-area top/bottom insets. */
export function Screen({ children }: { children: ReactNode }): ReactNode {
  const { colors } = useTheme();
  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.flex, { backgroundColor: colors.bg }]}>
      {children}
    </SafeAreaView>
  );
}

/** Scrolling body with consistent gutters. */
export function Body({ children }: { children: ReactNode }): ReactNode {
  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.bodyContent}
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
}

/** A hairline-bordered surface card (no shadow — doc 11 §1). */
export function Card({
  children,
  active = false,
  style,
}: {
  children: ReactNode;
  /** Active = accent hairline + faint wash (running timer). */
  active?: boolean;
  style?: ViewStyle;
}): ReactNode {
  const { colors, hairline } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: active ? colors.accentSoft : colors.surface,
          borderColor: active ? colors.accent : colors.border,
          borderWidth: hairline,
          borderRadius: radius.lg,
          padding: space.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Uppercase section label above a group. */
export function SectionHeader({ children }: { children: ReactNode }): ReactNode {
  const { colors } = useTheme();
  return <Text style={[styles.section, { color: colors.textFaint }]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Body label text. `muted` for secondary. */
export function Label({
  children,
  muted = false,
  faint = false,
}: {
  children: ReactNode;
  muted?: boolean;
  faint?: boolean;
}): ReactNode {
  const { colors } = useTheme();
  const color = faint ? colors.textFaint : muted ? colors.textMuted : colors.text;
  return <Text style={[styles.label, { color }]}>{children}</Text>;
}

/**
 * Tabular numeric text — times and money. Always aligns in columns.
 * `size` scales the running-timer hero vs. inline figures.
 */
export function Mono({
  children,
  size = "md",
  tone = "text",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "hero";
  tone?: "text" | "muted" | "accent";
}): ReactNode {
  const { colors } = useTheme();
  const sz = { sm: 13, md: 15, lg: 20, hero: 56 }[size];
  const color =
    tone === "accent" ? colors.accent : tone === "muted" ? colors.textMuted : colors.text;
  return (
    <Text
      style={{
        fontFamily: monoFamily,
        fontVariant: ["tabular-nums"],
        fontSize: sz,
        lineHeight: size === "hero" ? 60 : sz + 4,
        letterSpacing: size === "hero" ? 1 : 0,
        color,
      }}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** primary = accent fill; secondary = bordered; danger = red bordered. */
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  /** Grow to fill a row. */
  grow?: boolean;
}

/** Tap target. One accent for `primary`; motion is a quiet opacity press. */
export function Button({
  label,
  onPress,
  variant = "secondary",
  disabled = false,
  grow = false,
}: ButtonProps): ReactNode {
  const { colors, hairline } = useTheme();
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  const bg = isPrimary ? colors.accent : "transparent";
  const borderColor = isPrimary ? colors.accent : isDanger ? colors.danger : colors.borderStrong;
  const fg = isPrimary ? colors.onAccent : isDanger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: hairline,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
          flexGrow: grow ? 1 : 0,
          flexBasis: grow ? 0 : "auto",
        },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Labeled text input in a hairline well. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline = false,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps["keyboardType"];
  multiline?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
}): ReactNode {
  const { colors, hairline } = useTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[
          styles.input,
          {
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
            borderWidth: hairline,
            color: colors.text,
            minHeight: multiline ? 76 : 44,
            textAlignVertical: multiline ? "top" : "center",
          },
        ]}
      />
    </View>
  );
}

/** Single-select segmented control (small option sets). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}): ReactNode {
  const { colors, hairline } = useTheme();
  return (
    <View style={styles.fieldWrap}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text> : null}
      <View
        style={[
          styles.segment,
          { borderColor: colors.border, borderWidth: hairline, backgroundColor: colors.surfaceAlt },
        ]}
      >
        {options.map((opt) => {
          const on = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.segmentItem, on && { backgroundColor: colors.accent }]}
            >
              <Text
                style={{
                  color: on ? colors.onAccent : colors.textMuted,
                  fontSize: 13,
                  fontWeight: on ? "600" : "500",
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// List rows + status
// ---------------------------------------------------------------------------

/** A single hairline-separated ledger row: left stack + right figure. */
export function Row({
  primary,
  secondary,
  figure,
  figureSub,
  onPress,
  accent = false,
}: {
  primary: string;
  secondary?: string;
  /** Right-aligned tabular figure (time or amount). */
  figure?: string;
  figureSub?: string;
  onPress?: () => void;
  accent?: boolean;
}): ReactNode {
  const { colors, hairline } = useTheme();
  const inner = (
    <View style={[styles.row, { borderColor: colors.border, borderBottomWidth: hairline }]}>
      <View style={styles.flex}>
        <Text style={[styles.rowPrimary, { color: colors.text }]} numberOfLines={1}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={[styles.rowSecondary, { color: colors.textMuted }]} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>
      {figure ? (
        <View style={styles.rowFigure}>
          <Mono size="md" tone={accent ? "accent" : "text"}>
            {figure}
          </Mono>
          {figureSub ? (
            <Text style={[styles.rowSecondary, { color: colors.textFaint }]}>{figureSub}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {inner}
    </Pressable>
  );
}

/** Compliance / sync traffic-light dot + text. */
export function StatusDot({
  status,
  children,
}: {
  status: "ok" | "warn" | "danger" | "idle";
  children: ReactNode;
}): ReactNode {
  const { colors } = useTheme();
  const dot =
    status === "ok"
      ? colors.ok
      : status === "warn"
        ? colors.warn
        : status === "danger"
          ? colors.danger
          : colors.textFaint;
  return (
    <View style={styles.statusWrap}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.label, { color: colors.textMuted }]}>{children}</Text>
    </View>
  );
}

/** Neutral empty / loading / not-implemented state (no red alarm in scaffold). */
export function Placeholder({
  loading = false,
  title,
  detail,
}: {
  loading?: boolean;
  title: string;
  detail?: string;
}): ReactNode {
  const { colors } = useTheme();
  return (
    <View style={styles.placeholder}>
      {loading ? <ActivityIndicator color={colors.textMuted} /> : null}
      <Text style={[styles.placeholderTitle, { color: colors.textMuted }]}>{title}</Text>
      {detail ? (
        <Text style={[styles.placeholderDetail, { color: colors.textFaint }]}>{detail}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bodyContent: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: space.xs,
  },
  label: { fontSize: 15 },
  button: {
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  fieldWrap: { gap: space.xs },
  fieldLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  input: {
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 15,
  },
  segment: { flexDirection: "row", borderRadius: radius.md, padding: 3, gap: 3 },
  segmentItem: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space.md,
    gap: space.md,
  },
  rowPrimary: { fontSize: 15, fontWeight: "500" },
  rowSecondary: { fontSize: 12, marginTop: 2 },
  rowFigure: { alignItems: "flex-end" },
  statusWrap: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 9, height: 9, borderRadius: radius.pill },
  placeholder: { alignItems: "center", justifyContent: "center", paddingVertical: space.xxl, gap: space.sm },
  placeholderTitle: { fontSize: 15, fontWeight: "500" },
  placeholderDetail: { fontSize: 13, textAlign: "center", maxWidth: 260 },
});
