/**
 * Sync-Status (doc 04, doc 11 §7 nr. 14): Betriebsmodus (lokal vs. eigener
 * Server), letzter Sync und Verbindung. Im lokalen Modus arbeitet die App
 * vollständig offline; die Sync-Engine (src/sync) wird erst im Server-Modus aktiv.
 */
import { useState } from "react";
import { View } from "react-native";
import {
  Body,
  Button,
  Card,
  Field,
  Label,
  Mono,
  Row,
  Screen,
  SectionHeader,
  StatusDot,
} from "../../src/components/ui";
import { space } from "../../src/components/theme";
import { useStore } from "../../src/components/useStore";
import { settings as settingsStore } from "../../src/data";

export default function SyncScreen() {
  const mode = useStore<string | null>(() => settingsStore.get<string>("server_mode"), []);
  const baseUrl = useStore<string | null>(() => settingsStore.get<string>("server_base_url"), []);
  const lastSync = useStore<number | null>(() => settingsStore.get<number>("last_sync_at"), []);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isServer = (mode.data ?? "local") === "server";

  async function connect() {
    if (!url.trim()) {
      setMessage("Server-Adresse erforderlich.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await settingsStore.set("server_base_url", url.trim());
      await settingsStore.set("server_mode", "server");
      mode.reload();
      baseUrl.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await settingsStore.set("server_mode", "local");
      mode.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Body>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
            <StatusDot status={isServer ? "ok" : "idle"}>
              {isServer ? "Server-Modus, synchronisiert" : "Lokaler Modus, vollständig offline"}
            </StatusDot>
          </View>
          <View style={{ height: space.sm }} />
          <Label faint>Letzter Sync</Label>
          <Mono size="lg">
            {lastSync.data ? new Date(lastSync.data).toLocaleString("de-DE") : "nie"}
          </Mono>
        </Card>

        <View>
          <SectionHeader>Verbindung</SectionHeader>
          <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
            <Row primary="Modus" figure={isServer ? "Server" : "Lokal"} />
            <Row primary="Server" secondary={baseUrl.data ?? "nicht konfiguriert"} />
          </Card>
        </View>

        {isServer ? (
          <Card>
            <Label muted>
              Änderungen werden über das lokale Ereignisprotokoll (Event-Log + HLC) mit dem
              Server abgeglichen. Konflikte werden erkannt und nie still verworfen.
            </Label>
            <View style={{ height: space.sm }} />
            <Button label="Verbindung trennen" onPress={disconnect} disabled={busy} grow />
          </Card>
        ) : (
          <Card>
            <Field
              label="Server-Adresse"
              value={url}
              onChangeText={setUrl}
              placeholder="https://ptl.example.com"
              autoCapitalize="none"
            />
            <Button
              label={busy ? "Verbindet …" : "Mit eigenem Server verbinden"}
              onPress={connect}
              variant="primary"
              disabled={busy}
              grow
            />
          </Card>
        )}

        {message ? (
          <Card>
            <Label muted>{message}</Label>
          </Card>
        ) : null}
      </Body>
    </Screen>
  );
}
