/**
 * Sync, optional, experimental self-hosted device sync.
 *
 * The engine configuration is the sole source of truth. A URL saved in general
 * settings is never treated as a connection, and "synchronisiert" is shown only
 * after a real, non-buffered push + pull round was confirmed by the server.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import packageJson from "../../package.json";
import {
  Button,
  Card,
  ErrorNote,
  Field,
  FormRow,
  Page,
  StatGrid,
  StatTile,
  Tag,
  TextInput,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { detectDesktopPlatform } from "../lib/platform";
import { t, getLocale } from "../i18n";
import {
  NativeHttpTransportError,
  ServerHttpError,
  ServerProtocolError,
  ServerUnreachableError,
  SyncMergeFailedError,
  SyncMergeRequiredError,
  classifySyncRound,
  countPendingEvents,
  getSyncEngine,
  normalizePairingCode,
  normalizeServerBaseUrl,
  type DeviceInfo,
  type ServerConfig,
  type SyncRound,
  type SyncUiPhase,
} from "../sync";

// Keep aligned with `src-tauri/src/db.rs::SCHEMA_VERSION`.
const LOCAL_DB_VERSION = 2;

const PHASE_COPY: Record<SyncUiPhase, { label: string; detail: string }> = {
  local: {
    label: "Lokal",
    detail: "Kein Server gekoppelt. Alle Daten bleiben auf diesem Gerät.",
  },
  configured: {
    label: "Gekoppelt",
    detail: "Konfiguration vorhanden; Erreichbarkeit wurde in dieser Sitzung noch nicht bestätigt.",
  },
  pairing: {
    label: "Koppeln …",
    detail: "Pairing-Code und Server werden geprüft.",
  },
  syncing: {
    label: "Abgleich läuft …",
    detail: "Lokale Änderungen werden gesendet und Serveränderungen abgerufen.",
  },
  synced: {
    label: "Transport bestätigt",
    detail: "Der Server hat Push und Pull bestätigt; die Datenanwendung bleibt experimentell.",
  },
  offline: {
    label: "Offline",
    detail: "Der Server war beim Koppeln nicht erreichbar; es wurde keine Verbindung gespeichert.",
  },
  buffered: {
    label: "Gepuffert",
    detail: "Der Server ist nicht erreichbar. Bereits erzeugte Outbox-Ereignisse bleiben retrybar.",
  },
  conflict: {
    label: "Konflikt",
    detail: "Mindestens eine Änderung benötigt eine bewusste Auflösung und wurde nicht überschrieben.",
  },
  error: {
    label: "Fehler",
    detail: "Der Abgleich wurde nicht als erfolgreich markiert.",
  },
};

function currentDeviceInfo(): DeviceInfo {
  const platform = detectDesktopPlatform();
  if (platform !== "macos" && platform !== "windows") {
    throw new Error(t("Geräte-Pairing wird derzeit nur unter macOS und Windows unterstützt."));
  }
  return {
    device_name: platform === "macos" ? t("Tarlog auf diesem Mac") : t("Tarlog auf diesem PC"),
    platform,
    app_version: packageJson.version,
    local_db_version: LOCAL_DB_VERSION,
  };
}

function describeError(error: unknown, duringPairing: boolean): string {
  if (error instanceof NativeHttpTransportError) {
    return t("Der native HTTP-Transport konnte nicht aktiviert werden. Bitte Tarlog neu starten und die Installation prüfen.");
  }
  if (error instanceof ServerUnreachableError) {
    return t("Server nicht erreichbar. Adresse, Netzwerk und TLS-Zertifikat prüfen.");
  }
  if (error instanceof ServerProtocolError) {
    return t("Der Server antwortet nicht mit einem kompatiblen Tarlog-Sync-Protokoll.");
  }
  if (error instanceof SyncMergeRequiredError) {
    return t("{message} Der Pull-Cursor bleibt unverändert; es gehen keine Serverdaten verloren.", { message: error.message });
  }
  if (error instanceof SyncMergeFailedError) {
    return t("{message} Der Pull-Cursor bleibt unverändert und der Vorgang kann erneut versucht werden.", { message: error.message });
  }
  if (error instanceof ServerHttpError) {
    if (error.status === 401 && duringPairing) {
      return t("Pairing-Code ungültig oder abgelaufen. Bitte in der Webanwendung einen neuen Code erzeugen.");
    }
    if (error.status === 401 || error.status === 403) {
      return t("Der Gerätezugang wurde abgelehnt oder widerrufen. Bitte neu koppeln.");
    }
    if (error.status === 429) return t("Zu viele Pairing-Versuche. Bitte kurz warten und erneut versuchen.");
    if (error.status === 422) return t("Server-Adresse oder Pairing-Daten wurden vom Server abgelehnt.");
    return t("Serverfehler {status}. Der Abgleich wurde nicht bestätigt.", { status: error.status });
  }
  return error instanceof Error ? error.message : String(error);
}

function roundMessage(round: SyncRound, phase: SyncUiPhase): string {
  const conflicts = round.push.conflicts + round.pull.conflicts;
  const rejected = round.push.rejected + round.pull.rejected;
  if (phase === "conflict") {
    const word = conflicts === 1 ? t("Konflikt") : t("Konflikte");
    return t("{n} {word} erkannt. Keine Version wurde still verworfen.", { n: conflicts, word });
  }
  if (phase === "error") {
    if (rejected > 0) {
      const word = rejected === 1 ? t("Änderung wurde") : t("Änderungen wurden");
      return t("{n} {word} vom Server abgelehnt und bleibt lokal ausstehend.", { n: rejected, word });
    }
    return t("Der Server hat den Abgleich nicht vollständig bestätigt.");
  }
  if (phase === "buffered") {
    return t("Netzwerk nicht erreichbar. Bereits vorhandene Outbox-Ereignisse bleiben retrybar; lokale Fachmutationen sind in dieser Vorschau noch nicht vollständig angebunden.");
  }
  const word = round.push.count === 1 ? t("Event") : t("Events");
  return t("{n} {word} gesendet, {m} empfangen.", { n: round.push.count, word, m: round.pull.count });
}

export default function Sync() {
  const engine = useMemo(() => getSyncEngine(), []);
  const initialConfig = engine.config;
  const [config, setConfig] = useState<ServerConfig | null>(initialConfig);
  const [phase, setPhase] = useState<SyncUiPhase>(initialConfig ? "configured" : "local");
  const [url, setUrl] = useState(initialConfig?.baseUrl ?? "");
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState(
    engine.lastSuccessfulSyncAt,
  );

  const pending = useAsync(
    () => config ? countPendingEvents(config.mainAccountId) : Promise.resolve(0),
    [config?.mainAccountId],
  );
  const conflicts = useAsync(
    () => config ? engine.openConflicts() : Promise.resolve([]),
    [config?.mainAccountId],
  );

  useEffect(() => {
    if (config) engine.connect();
  }, [config, engine]);

  async function applySyncRound(): Promise<void> {
    setPhase("syncing");
    const round = await engine.sync();
    const nextPhase = classifySyncRound(round);
    setPhase(nextPhase);
    setStatusMessage(roundMessage(round, nextPhase));
    setLastSuccessfulSyncAt(engine.lastSuccessfulSyncAt);
    pending.reload();
    conflicts.reload();
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setStatusMessage(null);
    setUrlError(null);
    setCodeError(null);

    let normalizedUrl: string | null = null;
    let normalizedCode: string | null = null;
    try {
      normalizedUrl = normalizeServerBaseUrl(url);
    } catch (validationError) {
      setUrlError(describeError(validationError, true));
    }
    try {
      normalizedCode = normalizePairingCode(pairingCode);
    } catch (validationError) {
      setCodeError(describeError(validationError, true));
    }
    if (!normalizedUrl || !normalizedCode) return;

    setBusy(true);
    setPhase("pairing");
    try {
      const paired = await engine.pair({
        baseUrl: normalizedUrl,
        pairingCode: normalizedCode,
        device: currentDeviceInfo(),
      });
      setConfig(paired);
      setUrl(paired.baseUrl);
      setPairingCode("");
      await applySyncRound();
    } catch (syncError) {
      const stillConfigured = engine.config;
      setConfig(stillConfigured);
      setPhase(
        syncError instanceof ServerUnreachableError
          ? stillConfigured ? "buffered" : "offline"
          : "error",
      );
      setError(describeError(syncError, !stillConfigured));
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    if (busy || !config) return;
    setBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await applySyncRound();
    } catch (syncError) {
      setPhase(syncError instanceof ServerUnreachableError ? "buffered" : "error");
      setError(describeError(syncError, false));
    } finally {
      setBusy(false);
    }
  }

  function disconnect() {
    if (busy) return;
    engine.disconnect();
    setConfig(null);
    setPhase("local");
    setError(null);
    setStatusMessage(null);
    setPairingCode("");
    setLastSuccessfulSyncAt(null);
    pending.reload();
    conflicts.reload();
  }

  const status = PHASE_COPY[phase];
  const pendingCount = pending.data ?? 0;
  const conflictCount = conflicts.data?.length ?? 0;

  return (
    <Page className="sync-page" title={t("Sync")} hint={t("Experimenteller Self-Host-Abgleich")}>
      <StatGrid>
        <StatTile
          label={t("Modus")}
          value={config ? <Tag tone="accent">{t("Server")}</Tag> : <Tag tone="muted">{t("Lokal")}</Tag>}
          sub={config ? t("gekoppelt") : t("vollständig offline nutzbar")}
        />
        <StatTile
          label={t("Status")}
          value={<Tag tone={phase === "synced" ? "accent" : "muted"}>{t(status.label)}</Tag>}
          sub={t(status.detail)}
        />
        <StatTile
          label={t("Server")}
          value={<span className="sync-server-value">{config?.baseUrl ?? "—"}</span>}
          sub={config ? t("Gekoppelte Gegenstelle") : t("Nicht gekoppelt")}
        />
        <StatTile
          label={t("Letzter bestätigter Transport")}
          value={lastSuccessfulSyncAt
            ? new Date(lastSuccessfulSyncAt).toLocaleString(getLocale())
            : t("nie")}
        />
        <StatTile
          label={t("Ausstehend")}
          value={pending.loading ? "…" : pending.error ? "—" : pendingCount}
          sub={pending.error ? t("Outbox nicht lesbar") : t("bereits erzeugte lokale Events")}
        />
        <StatTile label={t("Konflikte")} value={conflicts.loading ? "…" : conflictCount} sub={t("offen")} />
      </StatGrid>

      {error ? <ErrorNote error={error} /> : null}
      {statusMessage ? (
        <div
          className={`notice ${phase === "conflict" || phase === "error" ? "notice--error" : "notice--info"}`}
          role={phase === "conflict" || phase === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          <span><strong>{t(status.label)}.</strong> {statusMessage}</span>
        </div>
      ) : null}

      {config ? (
        <Card
          title={t("Server-Verbindung")}
          subtitle={t("Experimentell, der lokale Datenbestand bleibt die ausfallsichere Basis.")}
          actions={(
            <Button variant="primary" disabled={busy} onClick={() => void syncNow()}>
              {phase === "syncing" ? t("Abgleich läuft …") : t("Transport jetzt prüfen")}
            </Button>
          )}
        >
          <p className="muted">
            {t("Gekoppelt mit")} <strong>{config.baseUrl}</strong>{t(". Bei einem Verbindungsfehler bleiben bereits erzeugte Outbox-Ereignisse retrybar. Konflikte und Server-Ablehnungen werden sichtbar gemeldet. Die Erzeugung lokaler Fachereignisse sowie die Anwendung eingehender Änderungen auf die lokalen Fachdaten sind weiterhin experimentell.")}
          </p>
          <Button variant="ghost" disabled={busy} onClick={disconnect}>
            {t("Kopplung lokal entfernen und offline weiterarbeiten")}
          </Button>
        </Card>
      ) : (
        <Card
          title={t("Mit eigenem Server koppeln")}
          subtitle={t("In der Webanwendung unter Geräte einen kurzlebigen Pairing-Code erzeugen.")}
        >
          <form className="sync-pairing-form" onSubmit={(event) => void connect(event)} noValidate>
            <FormRow>
              <Field
                label={t("Server-Adresse")}
                hint={t("z. B. https://tarlog.example.com")}
                error={urlError}
                required
              >
                <TextInput
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={t("https://…")}
                  autoComplete="url"
                  disabled={busy}
                />
              </Field>
              <Field
                label={t("Pairing-Code")}
                hint={t("8 Zeichen, z. B. ABCD-EF23")}
                error={codeError}
                required
              >
                <TextInput
                  value={pairingCode}
                  onChange={(event) => setPairingCode(event.target.value.toUpperCase())}
                  placeholder={t("ABCD-EF23")}
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  maxLength={32}
                  disabled={busy}
                />
              </Field>
            </FormRow>
            <div className="sync-pairing-form__actions">
              <Button variant="primary" type="submit" disabled={busy}>
                {phase === "pairing" ? t("Code wird geprüft …") : t("Koppeln und ersten Sync prüfen")}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </Page>
  );
}
