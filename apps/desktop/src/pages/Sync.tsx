/**
 * Sync — Bereich 15 (doc 04). Zeigt den Betriebsmodus (lokal vs. selbst
 * gehosteter Server), den letzten Sync und erlaubt das Umschalten auf den
 * Server-Verbindungsmodus. Im lokalen Modus arbeitet die App vollständig offline;
 * die eigentliche Sync-Engine liegt in src/sync und wird erst im Server-Modus aktiv.
 */
import { useState } from "react";
import { Page, Card, Button, Field, FormRow, TextInput, StatGrid, StatTile, Tag, ErrorNote } from "../components/ui";
import { useAsync } from "../data/hooks";
import { getSetting, setSetting } from "../data/settings";

export default function Sync() {
  const mode = useAsync(() => getSetting<string>("server_mode"), []);
  const baseUrl = useAsync(() => getSetting<string>("server_base_url"), []);
  const lastSync = useAsync(() => getSetting<number>("last_sync_at"), []);

  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isServer = (mode.data ?? "local") === "server";

  async function connect() {
    setError(null);
    if (!url.trim()) { setError("Server-Adresse erforderlich."); return; }
    setBusy(true);
    try {
      await setSetting("server_base_url", url.trim());
      await setSetting("server_mode", "server");
      mode.reload();
      baseUrl.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await setSetting("server_mode", "local");
      mode.reload();
    } finally { setBusy(false); }
  }

  return (
    <Page title="Sync" hint="Betriebsmodus & Geräte">
      <StatGrid>
        <StatTile
          label="Modus"
          value={isServer ? <Tag tone="accent">Server</Tag> : <Tag tone="muted">Lokal</Tag>}
          sub={isServer ? "synchronisiert" : "vollständig offline"}
        />
        <StatTile label="Server" value={baseUrl.data ? baseUrl.data : "—"} />
        <StatTile label="Letzter Sync" value={lastSync.data ? new Date(lastSync.data).toLocaleString("de-DE") : "nie"} />
      </StatGrid>

      {error ? <ErrorNote error={error} /> : null}

      {isServer ? (
        <Card title="Server-Verbindung" subtitle="Dieses Gerät synchronisiert mit dem eigenen Server.">
          <p className="muted">
            Verbunden mit <strong>{baseUrl.data}</strong>. Änderungen werden über das
            lokale Ereignisprotokoll (Event-Log + HLC) mit dem Server abgeglichen; Konflikte
            werden erkannt und nie still verworfen.
          </p>
          <Button variant="ghost" disabled={busy} onClick={() => void disconnect()}>Verbindung trennen (lokaler Modus)</Button>
        </Card>
      ) : (
        <Card title="Mit eigenem Server verbinden" subtitle="Optional — self-hosted, doc 04 Hybrid-Modus">
          <FormRow>
            <Field label="Server-Adresse" hint="z. B. https://ptl.example.com">
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </FormRow>
          <Button variant="primary" disabled={busy} onClick={() => void connect()}>Verbinden</Button>
        </Card>
      )}
    </Page>
  );
}
