/**
 * Tab navigator (expo-router). The iOS app keeps the five daily destinations in
 * the Tab-Bar (doc 11 §9); the secondary sync status opens from Settings. Order
 * mirrors the daily workflow: Timer first.
 *
 * Areas here map to doc 11 §2: Timer, Heute, Woche, Nachträge and Einstellungen.
 */
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useTheme } from "../../src/components/theme";

type IoniconName = NonNullable<ComponentProps<typeof Ionicons>["name"]>;

const TAB_ICONS = {
  index: "timer-outline",
  today: "today-outline",
  week: "calendar-outline",
  backdate: "add-circle-outline",
  settings: "settings-outline",
} as const satisfies Record<string, IoniconName>;

function TabIcon({ name, color, size }: { name: IoniconName; color: ColorValue; size: number }): React.ReactElement {
  return <Ionicons accessible={false} name={name} color={color} size={size} />;
}

export default function TabsLayout() {
  const { navigation } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: navigation.bg },
        headerTintColor: navigation.text,
        tabBarActiveTintColor: navigation.accent,
        tabBarInactiveTintColor: navigation.textMuted,
        tabBarStyle: { backgroundColor: navigation.surface, borderTopColor: navigation.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Timer", tabBarIcon: ({ color, size }) => <TabIcon name={TAB_ICONS.index} color={color} size={size} /> }} />
      <Tabs.Screen name="today" options={{ title: "Heute", tabBarIcon: ({ color, size }) => <TabIcon name={TAB_ICONS.today} color={color} size={size} /> }} />
      <Tabs.Screen name="week" options={{ title: "Woche", tabBarIcon: ({ color, size }) => <TabIcon name={TAB_ICONS.week} color={color} size={size} /> }} />
      <Tabs.Screen name="backdate" options={{ title: "Nachtrag", tabBarIcon: ({ color, size }) => <TabIcon name={TAB_ICONS.backdate} color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Einstellungen", tabBarIcon: ({ color, size }) => <TabIcon name={TAB_ICONS.settings} color={color} size={size} /> }} />
      <Tabs.Screen name="sync" options={{ title: "Synchronisierung", href: null }} />
    </Tabs>
  );
}
