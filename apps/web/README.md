# Tarlog Web – Self-Hosting, Browser-Sync und Onboarding

Die Webanwendung ist der selbst gehostete Tarlog-Server und zugleich die
Browser-Oberfläche. Sie läuft als Next.js-Anwendung mit PostgreSQL und einem
Custom-Node-Server für REST, Long-Polling und den WebSocket-Pfad `/api/ws`.
Alle Browser, die dieselbe Tarlog-URL verwenden, arbeiten direkt auf derselben
PostgreSQL-Datenbank; dafür ist kein Geräte-Pairing erforderlich.

> Tarlog wird derzeit aus dem Repository gebaut. Es gibt noch kein als
> verfügbar verifiziertes GHCR-Image. Verwende deshalb den unten beschriebenen
> Source-Build mit `docker compose up -d --build`.

## Supportmatrix

| Betriebsart | Status | Datenpfad |
|---|---|---|
| Browser auf dem selbst gehosteten Server | unterstützt | Browser → REST/Long-Poll → PostgreSQL |
| Mehrere Browser am selben Server | unterstützt | gemeinsame Server-URL und gemeinsame PostgreSQL-Datenbank |
| WebSocket-Pfad für Device-/API-Token | serverseitig vorhanden | `/api/ws?token=…` → PostgreSQL `LISTEN/NOTIFY` |
| macOS-/Windows-App vollständig lokal | unterstützt | lokale SQLite-Datenbank, kein Server nötig |
| Native Desktop-App ↔ Server | **experimentell** | Client und Pairing sind noch nicht end-to-end produktionsbereit |
| iOS ↔ Server | vorbereitet, nicht produktionsbereit | Architektur vorhanden, kein freigegebener End-to-End-Flow |

Der serverseitige Sync-Konfliktpfad und der WebSocket-Broadcast werden durch den
Server-Smoke-Test geprüft. Das ist kein Nachweis für eine vollständige native
Desktop-Replikation. Insbesondere Pairing, lokale Outbox-Befüllung, Pull-Merge
in SQLite und die Konfliktauflösung benötigen noch einen durchgängigen
Desktop-End-to-End-Test. Außerdem liegt das native Geräte-Token derzeit im
WebView-`localStorage` statt im Betriebssystem-Keychain; für die Tauri-WebView
ist noch keine Content Security Policy aktiviert (`csp: null`).

## 1. Voraussetzungen und Betriebsgrenzen

- Docker Engine mit Compose-Plugin
- eine Domain und ein HTTPS-Reverse-Proxy für Zugriff außerhalb des Hosts
- ausreichend persistenter Speicher für das Docker-Volume `pgdata`
- **genau eine `web`-Instanz**

Das Single-Instance-Limit ist derzeit verbindlich: Pairing-Codes und
Rate-Limits werden prozesslokal gehalten. Horizontale Skalierung ohne einen
gemeinsamen persistenten Store kann Pairing und Schutzlimits inkonsistent
machen. PostgreSQL bleibt davon unabhängig persistent.

## 2. Sichere Umgebung vorbereiten

Alle Befehle werden im Monorepo-Root ausgeführt, in dem
`docker-compose.yml` liegt.

```bash
umask 077
cp .env.example .env
chmod 600 .env

# Werte erzeugen und anschließend in .env eintragen:
openssl rand -hex 32  # SESSION_SECRET
openssl rand -hex 24  # POSTGRES_PASSWORD
```

Mindestens diese Werte in `.env` anpassen:

```dotenv
POSTGRES_USER=ptl
POSTGRES_PASSWORD=<48-stelliger-Hexwert>
POSTGRES_DB=ptl
SESSION_SECRET=<64-stelliger-Hexwert>
PORT=3000
NEXT_PUBLIC_APP_URL=https://tarlog.example.com
NEXT_PUBLIC_APP_VERSION=0.0.4
TARLOG_TRUST_PROXY=0
```

Hexwerte sind auch innerhalb der automatisch zusammengesetzten
`DATABASE_URL` sicher. Bei einem eigenen Passwort mit Zeichen wie `@`, `:`,
`/`, `?`, `#` oder `%` muss der Passwortteil einer expliziten `DATABASE_URL`
URL-kodiert werden.

| Variable | Bedeutung |
|---|---|
| `POSTGRES_USER` | PostgreSQL-Benutzer; Default `ptl` |
| `POSTGRES_PASSWORD` | PostgreSQL-Passwort; in Produktion zwingend ändern |
| `POSTGRES_DB` | PostgreSQL-Datenbank; Default `ptl` |
| `DATABASE_URL` | optionaler vollständiger Override; sonst aus `POSTGRES_*` aufgebaut |
| `SESSION_SECRET` | von der Compose-Konfiguration verlangt; immer zufällig und geheim halten |
| `PORT` | Host- und Container-Port des Webservers; Default `3000` |
| `NEXT_PUBLIC_APP_URL` | öffentliche Basis-URL, produktiv immer `https://…` |
| `NEXT_PUBLIC_APP_VERSION` | Versionswert im Health-Endpoint |
| `TARLOG_TRUST_PROXY` | Quelle der Client-IP für Auth-/Pairing-Schutzlimits: direkter TCP-Peer (`0`) oder bereinigtes `X-Forwarded-For` (`1`); Default `0` |

`SESSION_SECRET` ist heute ein verpflichtendes Deployment-Secret. Die
Browser-Sessions selbst sind zufällige Tokens, die nur gehasht in PostgreSQL
gespeichert werden. Eine Redis-Konfiguration gehört derzeit nicht zum
produktiven Tarlog-Betrieb.

`TARLOG_TRUST_PROXY=0` ist der sichere Standard für direkten Zugriff. Der
Server ignoriert dann jedes vom Client gelieferte `X-Forwarded-For` und nutzt
die Adresse des direkten TCP-Peers für Auth-/Pairing-Schutzlimits. `1` ist
ausschließlich für einen lokalen,
vertrauenswürdigen Reverse-Proxy vorgesehen, der der einzige direkte Peer ist
und eingehendes `X-Forwarded-For` bereinigt beziehungsweise überschreibt. Wenn
diese Kette nicht garantiert ist, bleibt der Wert auch hinter einem Proxy `0`.

## 3. Aus dem Quellcode starten

Konfiguration zuerst prüfen und danach den Stack bauen:

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

`postgres` startet mit einem persistenten Volume. Sobald dessen Healthcheck
grün ist, startet `web`, wendet die versionierten Migrationen aus
`packages/db/drizzle/postgres` an und startet danach `server.mjs`.

Healthcheck:

```bash
curl -fsS http://localhost:3000/api/health
```

Eine gesunde Instanz antwortet mit HTTP 200 und einem JSON-Objekt, das
`"status":"ok"` und `"db":"up"` enthält. Für eine andere `PORT`-Einstellung
den URL-Port entsprechend ersetzen.

## 4. Erststart und Produkt-Onboarding

### Serverkonto anlegen

1. Öffne beim ersten Start `https://tarlog.example.com/setup`.
2. Lege den einmaligen Main Account mit Anzeigename und Passwort an.
3. E-Mail und Firma sind optional.
4. Nach erfolgreichem Setup wirst du angemeldet und in die Anwendung geleitet.

Der Account-Setup legt außerdem das Browser-Gerät und die globale
Standard-Rundungsregel an. Er richtet keine 2FA, Passkeys, Geräte-Tokens oder
Backup-Ziele ein.

### Geführtes Tarlog-Onboarding

Ein wirklich leerer Arbeitsbereich öffnet anschließend automatisch den
verpflichtenden Einrichtungsassistenten. Bereits verwendete Installationen mit
einem vorhandenen Projekt werden nicht nachträglich blockiert. Unterbrochene
Einrichtungen werden am gespeicherten Schritt fortgesetzt.

Der Assistent führt durch:

1. **Willkommen** – Unterschied zwischen lokaler App und selbst gehostetem
   Browserbetrieb verstehen.
2. **Arbeitsbereich** – optional einen Kunden und verpflichtend das erste
   Projekt anlegen. Das Projekt bildet den Kontext für Timer und Nachträge.
3. **Aktive Erfassung** – Projekt auswählen und Start, Pause, Fortsetzen und
   Stoppen einer laufenden Bearbeitung kennenlernen.
4. **Vergangene Zeit** – einen früheren Zeitraum mit Beschreibung und Grund
   nachtragen.
5. **Sync** – verstehen, dass Browser derselben Server-URL unmittelbar dieselbe
   PostgreSQL-Wahrheit sehen; die native Desktop-Replikation bleibt optional
   und experimentell.
6. **Bereit** – Einrichtung abschließen und zum regulären Arbeitsbereich
   wechseln.

Das Onboarding erzeugt keine Beispieldaten, die der Nutzer nicht bestätigt.
Angelegte Kunden und Projekte sind echte Arbeitsdaten und bleiben nach
Abschluss erhalten.

## 5. Browser-Sync und Server-Protokoll

### Browser

Für einen weiteren Browser genügt:

1. dieselbe öffentliche Tarlog-URL öffnen,
2. mit dem Main-Account-Passwort anmelden,
3. normal weiterarbeiten.

Es gibt im Browser keine zweite lokale Datenbank, die eingerichtet werden
müsste. Timer, Einträge, Kunden und Projekte werden direkt gegen dieselbe
PostgreSQL-Datenbank gelesen und geschrieben. Die Oberfläche nutzt derzeit den
Long-Poll-Pfad als verlässlichen Live-Fallback und aktualisiert Seiten bei neuen
Server-Events.

Jedes Browserprofil erhält dabei eine eigene, langlebige Web-Geräte-ID in einem
`HttpOnly`-Cookie. Sie bleibt beim Abmelden bestehen, damit derselbe Browser
beim nächsten Login dasselbe Gerät weiterverwendet; ein anderer Browser erhält
eine andere ID. So kann Tarlog eigene Sync-Echos gezielt ausfiltern, ohne
Änderungen anderer Browser zu verschlucken. Wird ein Gerät in Tarlog
widerrufen, werden seine API-Tokens und Browser-Sitzungen gemeinsam ungültig.

### Server-Sync-Endpunkte

| Endpoint | Zweck |
|---|---|
| `POST /api/sync/events` | idempotente Client-Events hochladen; Konflikte können HTTP 409 liefern |
| `GET /api/sync/changes?since=<revision>` | Delta seit einer Server-Revision laden |
| `GET /api/sync/poll?since=<revision>&timeout=25000` | Long-Poll-Fallback, maximal 25 Sekunden |
| `GET /api/realtime/token` | kurzlebiges, einmal verwendbares, browser- und gerätegebundenes Ticket für den Live-Kanal |
| `GET /api/ws?token=<token>` | WebSocket-Livekanal für ein Realtime-Ticket oder passend berechtigte Device-/API-Token |

Mutationen, die den Server-Sync-Pfad nutzen – insbesondere Timer und
Zeiteinträge – werden in `sync_events` geschrieben. Der Server serialisiert
diese kritischen Änderungen pro Main Account, vergibt monotone
`server_revision`-Werte und schreibt Fachmutation, Audit und Sync-Ereignis in
derselben Datenbanktransaktion. Erst nach dem Commit wird der Live-Hinweis über
PostgreSQL `LISTEN/NOTIFY` ausgelöst. Weil dieser Hinweis nur ein Wecksignal
ist, ziehen Clients die kanonischen Änderungen anschließend über den
Delta-Endpunkt; Long-Polling holt verpasste Hinweise nach. Kunden und Projekte
der Browser-App liegen unmittelbar in der gemeinsamen PostgreSQL-Datenbank;
ihre vollständige Replikation in native Desktop-Datenbanken gehört weiterhin
zur experimentellen Desktop-Sync-Strecke.

Konflikte werden bei einer veralteten Basisversion erkannt und in
`conflict_records` gespeichert; Werte werden nicht still verworfen. Ein
Sync-Batch kann bereits akzeptierte, abgelehnte und konfliktbehaftete Events
gleichzeitig enthalten. Native Clients müssen deshalb alle drei Ergebnislisten
verarbeiten.

### Native Desktop-App

Die macOS-/Windows-App ist vollständig ohne Server nutzbar. Ihre Verbindung zu
einem selbst gehosteten Server ist aktuell **experimentell und nicht
end-to-end produktionsbereit**. Die Eingabe einer Server-URL allein beweist noch
keine aktive Replikation. Verwende für geräteübergreifendes produktives Arbeiten
derzeit mehrere Browser an derselben Server-URL und sichere die lokale
Desktop-Datenbank unabhängig.

Konkret sind lokale Fachmutationen noch nicht vollständig an die Outbox
angebunden, für eingehende Serverereignisse fehlt der idempotente Merge-Adapter
in die SQLite-Fachtabellen, das Geräte-Token liegt noch im
WebView-`localStorage` statt im Betriebssystem-Keychain und die Tauri-WebView
läuft derzeit mit `csp: null`. Diese Strecke ist daher weder eine vollständige
Offline-Queue noch ein Ersatz für ein verifiziertes Backup.

## 6. HTTPS mit Caddy

Tarlog terminiert TLS nicht selbst. Im Produktionsbetrieb muss ein
Reverse-Proxy HTTPS bereitstellen; dadurch werden auch die in Produktion als
`Secure` gesetzten Session-Cookies korrekt übertragen.

Wenn Caddy auf demselben Host läuft, sollte der Tarlog-Port nicht öffentlich
erreichbar sein. Binde den `web`-Port in `docker-compose.yml` an Loopback oder
schütze ihn gleichwertig per Firewall:

```yaml
ports:
  - "127.0.0.1:${PORT:-3000}:${PORT:-3000}"
```

Minimaler `Caddyfile`-Block:

```caddy
tarlog.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}
    }
}
```

Caddy beschafft das Zertifikat und reicht HTTP sowie WebSocket-Upgrades durch.
Ein eigener `/api/ws`-Block ist nicht nötig. Weil dieser Block den vom Client
gelieferten Header überschreibt und Caddy lokal der einzige direkte Peer ist,
kann in `.env` anschließend `TARLOG_TRUST_PROXY=1` gesetzt und der Webdienst
neu gestartet werden. Ohne diese vertrauenswürdige, bereinigende Proxy-Kette
bleibt `TARLOG_TRUST_PROXY=0`.

Für andere Proxies gelten diese Anforderungen:

- ursprünglichen `Host` erhalten, damit Origin-Prüfungen funktionieren;
- WebSocket-Upgrade auf `/api/ws` erlauben;
- Read-Timeout deutlich über 25 Sekunden für Long-Polling setzen;
- `X-Forwarded-Proto: https` setzen;
- eingehendes `X-Forwarded-For` am vertrauenswürdigen Proxy bereinigen oder
  überschreiben; nur dann `TARLOG_TRUST_PROXY=1` setzen, sonst `0` belassen;
- Query-Parameter von `/api/ws` nicht in Access-Logs schreiben, weil das Token
  derzeit im WebSocket-URL-Query steht;
- den internen HTTP-Port nicht zusätzlich öffentlich exponieren.

Nach der Proxy-Einrichtung prüfen:

```bash
curl -fsS https://tarlog.example.com/api/health
```

Zusätzlich müssen Login, eine Mutation, ein mindestens 25 Sekunden offener
Long-Poll und ein WebSocket-Upgrade über den realen Proxy getestet werden.

## 7. Backup und Restore

Das Docker-Volume `pgdata` übersteht `docker compose down`. Der Befehl
`docker compose down -v` löscht dagegen das Datenbank-Volume und darf nicht als
normaler Update- oder Neustartbefehl verwendet werden.

### PostgreSQL-Backup

Die Variablen werden innerhalb des PostgreSQL-Containers ausgewertet. Dadurch
funktioniert der Befehl auch mit anderen Werten aus `.env`:

```bash
mkdir -p backups
BACKUP="backups/tarlog-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$BACKUP"
test -s "$BACKUP"
```

Die Datei anschließend verschlüsselt und getrennt vom Tarlog-Host sichern.

### Restore-Probe

Ein Backup gilt erst nach einer erfolgreichen Wiederherstellungsprobe als
brauchbar:

```bash
docker compose exec -T postgres sh -c \
  'dropdb --if-exists --username="$POSTGRES_USER" tarlog_verify && createdb --username="$POSTGRES_USER" tarlog_verify'
docker compose exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner --username="$POSTGRES_USER" --dbname=tarlog_verify' \
  < "$BACKUP"
docker compose exec -T postgres sh -c \
  'psql --username="$POSTGRES_USER" --dbname=tarlog_verify --command="SELECT count(*) FROM _ptl_migrations;"'
docker compose exec -T postgres sh -c \
  'dropdb --username="$POSTGRES_USER" tarlog_verify'
```

### Produktiv wiederherstellen

Zuerst einen zusätzlichen Pre-Restore-Snapshot ziehen. Danach Schreibzugriffe
stoppen und das geprüfte Dump einspielen:

```bash
docker compose stop web
docker compose exec -T postgres sh -c \
  'pg_restore --exit-on-error --clean --if-exists --no-owner --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  < "$BACKUP"
docker compose start web
docker compose ps
curl -fsS http://localhost:3000/api/health
```

Ein Restore über die Kommandozeile erzeugt derzeit keinen automatischen
Tarlog-Audit-Eintrag. Der JSON-Endpunkt `/api/backup` ist ein portabler
Datenexport, aber kein Ersatz für ein PostgreSQL-Dump und kein JSON-Restore.

## 8. Updates

Vor jedem Update ein PostgreSQL-Backup erstellen und prüfen. Für den
Source-Build:

```bash
git pull --ff-only
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --since 5m web
curl -fsS http://localhost:3000/api/health
```

Der Containerstart wendet ausstehende Migrationen vor dem Webserverstart an.
Bei einem Migrationsfehler startet `web` nicht weiter; zuerst Logs prüfen und
nicht durch Löschen des Volumes umgehen.

## 9. Diagnose

- **`SESSION_SECRET erforderlich`** – `.env` liegt im Monorepo-Root und enthält
  einen nicht leeren Wert.
- **Healthcheck meldet `db: down`** – `docker compose ps`, PostgreSQL-Logs und
  die zusammengesetzte `DATABASE_URL` prüfen.
- **Login funktioniert nur lokal** – öffentliche URL auf HTTPS umstellen,
  `NEXT_PUBLIC_APP_URL` korrigieren und `Host` am Proxy erhalten.
- **Live-Anzeige bleibt auf Polling** – das ist aktuell der unterstützte
  Browser-Fallback. Proxy-Timeout und `/api/sync/poll` prüfen.
- **WebSocket liefert 401** – Token ungültig, abgelaufen oder widerrufen; keine
  Session-Cookies als WebSocket-Token verwenden.
- **Pairing-Code verschwindet** – Codes sind prozesslokal und überleben keinen
  Neustart. Nur eine `web`-Instanz betreiben.
- **Desktop zeigt eine Server-URL, aber keine Daten erscheinen** – native
  Desktop-Synchronisierung ist noch experimentell; Browserbetrieb verwenden.

## 10. Verifikation für Änderungen am Serverbetrieb

Repository-Prüfungen ohne hartkodierte Testanzahlen:

```bash
pnpm install --frozen-lockfile
pnpm version:check v0.0.4
pnpm -r build
pnpm -r test
pnpm -r typecheck
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets
```

Der Server-Smoke-Test startet standardmäßig einen eigenen temporären
PostgreSQL-Container und entfernt ihn anschließend. Er darf nie durch eine
Produktiv-`DATABASE_URL` auf die Produktionsdatenbank umgelenkt werden:

```bash
bash scripts/smoke.sh
```

Er prüft Migration, Auth-Setup, Kernmutationen, Konflikterkennung und den
WebSocket-Broadcast. Zusätzlich bleiben Docker-Image-Build, realer
HTTPS-Reverse-Proxy, Backup-Restore-Probe und native Desktop-Replikation eigene
Abnahmegates.
