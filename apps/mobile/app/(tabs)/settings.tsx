/**
 * Einstellungen (doc 09, doc 11 §7 nr. 16): Profil, Zeitzone, App-Sperre und
 * Datenschutz-Hinweise. Werte liegen in der lokalen `settings`-Tabelle; es
 * verlässt nichts das Gerät, solange kein Server verbunden ist.
 */
import { useState } from "react";
import { View } from "react-native";
import {
  Body,
  Button,
  Card,
  Label,
  Row,
  Screen,
  SectionHeader,
} from "../../src/components/ui";
import { space } from "../../src/components/theme";
import { useStore } from "../../src/components/useStore";
import { settings as settingsStore, customers as customerStore, projects as projectStore } from "../../src/data";
import { deviceTimezone } from "../../src/lib/time";
import type { Customer, Project } from "../../src/data";

export default function SettingsScreen() {
  const zone = deviceTimezone();
  const lock = useStore<boolean | null>(() => settingsStore.get<boolean>("app_lock_enabled"), []);
  const customers = useStore<Customer[]>(() => customerStore.list(), []);
  const projects = useStore<Project[]>(() => projectStore.list(), []);
  const [busy, setBusy] = useState(false);

  async function toggleLock() {
    setBusy(true);
    try {
      await settingsStore.set("app_lock_enabled", !(lock.data ?? false));
      lock.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Body>
        <Card>
          <Label muted>Profil</Label>
          <View style={{ height: space.sm }} />
          <Label faint>Lokales Hauptprofil — kein Cloud-Konto erforderlich.</Label>
        </Card>

        <View>
          <SectionHeader>Gerät</SectionHeader>
          <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
            <Row primary="Zeitzone" figure={zone} />
            <Row primary="Kunden" figure={String(customers.data?.length ?? 0)} />
            <Row primary="Projekte" figure={String(projects.data?.length ?? 0)} />
          </Card>
        </View>

        <View>
          <SectionHeader>Sicherheit</SectionHeader>
          <Card>
            <Label muted>
              Optionale App-Sperre beim Start (Face ID bzw. Gerätecode). Die lokale
              Datenbank bleibt auf dem Gerät.
            </Label>
            <View style={{ height: space.sm }} />
            <Button
              label={(lock.data ?? false) ? "App-Sperre deaktivieren" : "App-Sperre aktivieren"}
              onPress={toggleLock}
              disabled={busy}
              grow
            />
          </Card>
        </View>

        <View>
          <SectionHeader>Datenschutz</SectionHeader>
          <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
            <Row primary="Telemetrie" secondary="deaktiviert (Standard)" figure="aus" />
            <Row primary="Standort (GPS)" secondary="wird nicht erfasst" figure="aus" />
            <Row primary="Screenshots" secondary="keine Überwachung" figure="aus" />
          </Card>
        </View>

        <Card>
          <Label faint>
            Arbeitszeitregeln folgen dem deutschen Profil (ArbZG). Rechtliche Hinweise sind
            Produkt-Hinweise, keine Rechtsberatung.
          </Label>
        </Card>
      </Body>
    </Screen>
  );
}
