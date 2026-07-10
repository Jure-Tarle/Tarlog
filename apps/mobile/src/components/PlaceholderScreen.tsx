/**
 * PlaceholderScreen — neutral scaffold screen (doc 11 §1 Ledger aesthetic).
 *
 * The screen author replaces each route body with the real UI. This keeps the
 * skeleton type-checking and visually labeled without committing to any layout
 * the design pass will own. Deliberately minimal: no default shadows, no
 * decorative color — only a title, a short purpose line, and a tabular note.
 */
import { StyleSheet, Text, View } from "react-native";

export interface PlaceholderScreenProps {
  /** Area title, e.g. "Heute". */
  title: string;
  /** One-line purpose, mirrors doc 11 §2 area purpose. */
  subtitle: string;
}

export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.note}>Bildschirm folgt (Screen-Autor).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 15,
    opacity: 0.7,
    textAlign: "center",
  },
  note: {
    fontSize: 13,
    opacity: 0.5,
    fontVariant: ["tabular-nums"],
    marginTop: 8,
  },
});
