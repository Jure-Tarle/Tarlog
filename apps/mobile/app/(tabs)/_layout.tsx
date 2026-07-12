/**
 * Tab navigator (expo-router). The iOS app uses a Tab-Bar (doc 11 §9) covering
 * the core areas; the remaining 15 areas hang off a "Mehr"/More menu the screen
 * author adds later. Order mirrors the daily workflow: Timer first.
 *
 * Areas here map to doc 11 §2: Timer, Heute, Woche, Nachträge, Sync-Status,
 * Einstellungen.
 */
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Timer" }} />
      <Tabs.Screen name="today" options={{ title: "Heute" }} />
      <Tabs.Screen name="week" options={{ title: "Woche" }} />
      <Tabs.Screen name="backdate" options={{ title: "Nachtrag" }} />
      <Tabs.Screen name="sync" options={{ title: "Sync" }} />
      <Tabs.Screen name="settings" options={{ title: "Einstellungen" }} />
    </Tabs>
  );
}
