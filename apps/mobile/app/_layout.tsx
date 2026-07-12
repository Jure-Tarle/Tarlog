/**
 * Root layout (expo-router). Bootstraps the local DB (open + migrate) once,
 * then renders the tab navigator via a Stack. The persistent running-timer bar
 * (doc 11 §2) will be mounted here by the screen author above the Stack.
 */
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { initDb } from "../src/lib/db";

export default function RootLayout() {
  useEffect(() => {
    // Local-first bootstrap (doc 11 §7 nr. 15). Idempotent per app start.
    initDb();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </>
  );
}
