# Tarlog

Professionelle, revisionsfähige, datenschutzfreundliche Zeiterfassung für eine
Einzelperson (Freelancer, Berater, Entwickler, Designer, Kreative). Lokal
nutzbar **ohne Cloud-Zwang** und optional als selbst gehostete Webanwendung mit
gemeinsamer PostgreSQL-Datenbank für mehrere Browser. Die native
Desktop↔Server-Synchronisierung ist derzeit experimentell.

> Rechtliche Aussagen im Produkt sind Produkt-Hinweise, keine Rechtsberatung.

Vollständige Produkt- und Architekturausarbeitung: [`docs/project-time-ledger/`](docs/project-time-ledger/README.md).
Der aktuelle Apple-HIG-Redesign-Audit mit Plattformgrenzen, Zielsystem und
Testmatrix steht in [`docs/apple-redesign-2026.md`](docs/apple-redesign-2026.md).

## Monorepo

pnpm-Workspace, TypeScript überall, gemeinsames Core-Package für Zeit, Rundung,
Compliance und Abrechnung.

| Paket | Zweck | Stack | Status |
|---|---|---|---|
| [`packages/core`](packages/core) | Business-Logik: Zeitberechnung, Rundung, DE/EU-Compliance, Abrechnung, Onboarding, Zod-Schemas | TypeScript, luxon, zod | Build, Typen und Tests in CI |
| [`packages/db`](packages/db) | Dual-Dialekt-Datenmodell | Drizzle ORM (SQLite + PostgreSQL) | Build und Typen in CI |
| [`apps/web`](apps/web) | Selbst gehosteter Server + Browser-App: Auth, REST, Long-Poll/WebSocket, PDF/CSV, Rechnungen, Docker | Next.js 15, pg, pdfmake, ws | Server-Smoke-Test in CI |
| [`apps/desktop`](apps/desktop) | macOS/Windows: lokaler SQLite-Offline-Modus, Timer, Nachtrag, Tray, Backup, experimenteller Sync-Client | Tauri 2, rusqlite, React/Vite | lokaler Modus integriert getestet |
| [`apps/mobile`](apps/mobile) | iOS vorbereitet: expo-sqlite lokal, Timer/Heute/Nachtrag, Sync-Architektur | Expo 52, React Native | Typprüfung in CI |

### Kern-Entscheidungen (aus der Recherche)

Drizzle statt Prisma (Tauri-SQLite-Tauglichkeit, Dialekt-Switch) · WebSocket
mit Long-Poll-Fallback · serverseitiges Event-Log mit optimistischen Versionen
und Hybrid Logical Clock (kein CRDT) · Single-Timer via partiellem
`UNIQUE`-Index auf `timer_states` ·
pdfmake portabel · UUIDv7-PKs · Geld = Integer-Cents · Zeit = UTC epoch-ms +
IANA-Zeitzone je Eintrag · **`actual_duration_seconds` (Brutto) strikt getrennt
von `billing_duration_seconds` (gerundet) — Rundung überschreibt nie die echte Zeit.**

## Bauen, Testen, Nachweisen

```bash
pnpm install --frozen-lockfile
pnpm version:check v0.0.3
pnpm -r build
pnpm -r test
pnpm -r typecheck

# Desktop-Rust-Unit- und Integrationstests, headless mit Wegwerf-SQLite-DBs:
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets

# iOS-App (Architektur vorbereitet):
pnpm --filter @tarlog/mobile exec tsc --noEmit

# Server end-to-end gegen eine Wegwerf-Datenbank:
./scripts/smoke.sh

# Natives Desktop-Binary (ohne Signing):
pnpm --filter @tarlog/desktop exec tauri build --no-bundle

# Selbst hosten (Secrets in .env vorher ersetzen):
cp .env.example .env
docker compose config --quiet
docker compose up -d --build
```

Alle drei Ebenen laufen auch in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)):
Versionskonsistenz, Builds, Unit- und Typprüfungen, `cargo test --all-targets`
und der Smoke-Lauf gegen einen echten PostgreSQL-Dienst.

### Was der Smoke-Lauf beweist

Die 15-Minuten-Aufrundung (70 Minuten Ist-Zeit → 75 Minuten Abrechnungszeit,
`actual_duration_seconds` bleibt 4200) · Single-Timer-Invariante (zweiter Start →
409) · Nachtrag mit Grund · ArbZG-§4-Verstoß bei über 6 Stunden ohne Pause ·
PDF-Arbeitszeitnachweis und CSV mit getrennten Spalten · Rechnung: Nummer erst
bei Finalisierung, PDF, Storno als Gegenrechnung · Sync-Konflikt (veraltete
`base_version` → 409 + `conflict_records`, nichts wird still verworfen) ·
Live-Sync über WebSocket an einen zweiten Client · Audit-Log.

## Onboarding

Ein leerer Arbeitsbereich öffnet beim ersten Start automatisch einen
versionierten Einrichtungsassistenten. Er kann nicht versehentlich übersprungen
werden, setzt nach einem Neustart am gespeicherten Schritt fort und blockiert
bereits verwendete Installationen mit vorhandenem Projekt nicht nachträglich.

Der Ablauf erklärt und verknüpft die zentralen Arbeitsweisen:

1. Betriebsart und Arbeitsbereich kennenlernen.
2. Optional einen Kunden und verpflichtend das erste Projekt als echte
   Stammdaten anlegen.
3. Aktive Bearbeitung starten, pausieren, fortsetzen und stoppen.
4. Vergangene Arbeitszeit mit Beschreibung und Grund nachtragen.
5. Browser-Sync und die Grenzen der experimentellen nativen Synchronisierung
   verstehen.
6. Einrichtung abschließen und in den regulären Arbeitsbereich wechseln.

Im Web kommt davor einmalig `/setup`: Dort werden der Main Account, das
Passwort und optionale Profilangaben angelegt. Dieses Account-Setup ist bewusst
getrennt vom anschließenden Produkt-Onboarding.

## Self-Hosting und Sync

| Betriebsart | Status |
|---|---|
| macOS/Windows vollständig lokal mit SQLite | unterstützt |
| Selbst gehostete Webanwendung mit PostgreSQL | unterstützt |
| Mehrere Browser an derselben Tarlog-URL | unterstützt; alle arbeiten direkt auf derselben PostgreSQL-Datenbank |
| Server-REST, Konflikterkennung und WebSocket-Pfad | serverseitig per Smoke-Test geprüft |
| Native Desktop-App ↔ Server | **experimentell, nicht end-to-end produktionsbereit** |
| iOS ↔ Server | vorbereitet, nicht produktionsbereit |

Der Desktop-Pull speichert eingehende Roh-Events zuerst dauerhaft mit
`applied=0`. Erst ein erfolgreich abgewarteter, idempotenter Merge in die
lokalen Fachtabellen darf sie auf `applied=1` setzen und den Pull-Cursor
fortschreiben. Da dieser Fach-Merge im aktuellen Desktop-Stand noch nicht
verdrahtet ist, wird bei eingehenden Änderungen bewusst ein wiederholbarer
Fehler statt eines falschen Sync-Erfolgs angezeigt; die Rohdaten und der alte
Cursor bleiben erhalten.

Auch die Gegenrichtung ist noch nicht vollständig: Nicht jede lokale
Fachmutation erzeugt bereits ein Outbox-Ereignis. Das Geräte-Token liegt im
Desktop derzeit im WebView-`localStorage` statt im Betriebssystem-Keychain und
die Tauri-WebView hat noch keine aktivierte Content Security Policy
(`csp: null`). Der experimentelle Desktop-Sync ist deshalb weder vollständige
Offline-Queue noch Backup- oder Sicherheitsgrenze.

Der derzeit verifizierte Deployment-Weg ist der Build aus dem Repository; es
wird kein verfügbares Container-Registry-Image vorausgesetzt:

```bash
umask 077
cp .env.example .env
chmod 600 .env

# Sichere Werte erzeugen und in .env eintragen:
openssl rand -hex 32  # SESSION_SECRET
openssl rand -hex 24  # POSTGRES_PASSWORD

docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3000/api/health
```

Für externen Zugriff ist HTTPS zwingend. Setze
`NEXT_PUBLIC_APP_URL=https://tarlog.example.com`, binde den internen Port nur an
Loopback oder schütze ihn per Firewall und leite ihn beispielsweise mit Caddy
weiter:

```caddy
tarlog.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}
    }
}
```

Caddy reicht WebSocket-Upgrades automatisch durch. Andere Reverse-Proxies
müssen den ursprünglichen `Host` erhalten, `/api/ws` upgraden und ein
Read-Timeout von mehr als 25 Sekunden für `/api/sync/poll` erlauben. Derzeit
genau eine `web`-Instanz betreiben, weil Pairing-Codes und Rate-Limits
prozesslokal sind.

`TARLOG_TRUST_PROXY=0` ist der sichere Standard für direkten Zugriff: Tarlog
ignoriert dann `X-Forwarded-For` und verwendet den direkten TCP-Peer als
Client-IP für Auth-/Pairing-Schutzlimits. Setze die Variable nur dann auf `1`,
wenn ein lokaler, vertrauenswürdiger Caddy oder Reverse-Proxy der einzige
direkte Peer ist und eingehendes `X-Forwarded-For` wie oben bereinigt
beziehungsweise überschreibt. In allen anderen Fällen bleibt sie `0`.

Die vollständige Anleitung zu sicherer `.env`, Browser-Sync, TLS,
Backup/Restore, Updates und bekannten Grenzen steht in
[`apps/web/README.md`](apps/web/README.md).

## Version-1-Akzeptanzkriterien (Spec §35) → Umsetzung

| # | Kriterium | Umsetzung |
|---|---|---|
| 1 | App lokal ohne Server nutzbar | `apps/desktop` lokaler SQLite-Modus (rusqlite), voll offline |
| 2 | Lokales Hauptprofil | `db.rs` bootstrap: `main_accounts`/`local_profiles`-Singleton |
| 3 | Kunden erstellen | `commands::create_customer`, `data/customers`, Web `POST /api/customers` |
| 4 | Projekte erstellen | `commands::create_project`, `data/projects`, Web `POST /api/projects` |
| 5 | Aufgaben erstellen | `tasks`-Tabelle, `data/tasks`, Web `POST /api/tasks` |
| 6 | Stundensätze | `billing_rates` (historisiert), `resolveRate` (Aufgabe>Projekt>Kunde>Default) |
| 7 | Tagessätze | `day_rate_rules`, `computeDayRate` in `@tarlog/core` |
| 8 | Festpreise | `fixed_fee_contracts`, `computeFixedFeeMargin` |
| 9–12 | Timer start/pause/resume/stop | `commands::timer_*` (Desktop), `POST /api/timer/*` (Web), `data/timer` (iOS) |
| 13 | Beschreibung beim Stoppen | Stop-Dialog `Timer.tsx` (Pflicht je Projekt), `needs_description`-Status |
| 14 | Arbeitszeiten nachtragen | `entry_backdate` / `entries.backdate` (`source='manual_backdated'`) |
| 15 | Vergessenen Start korrigieren | Timer-Start mit Startzeit-Korrektur; Nachtrag-Assistent |
| 16 | Vergessenen Stopp korrigieren | Stop-Dialog Endzeit-Korrektur mit Grund |
| 17 | Ist-Zeit vs. Abrechnungszeit getrennt | `actual_duration_seconds` ≠ `billing_duration_seconds` (Schema + Engine) |
| 18 | Auf 15 Minuten aufrunden | `applyRounding` Modus `ceil_started_interval:900` — Test: 4200s→4500s |
| 19 | Deutsche Pausenregeln | `evaluateDay` GERMAN_PROFILE: >6h→30min, >9h→45min, 15-min-Blöcke |
| 20 | Compliance-Warnungen | Ampel grün/gelb/rot in Compliance-Seiten (Desktop/Web) |
| 21 | PDF-Arbeitszeitnachweis | `lib/pdf` (pdfmake), Web `GET /api/exports/timesheet` |
| 22 | PDF-Rechnung | `lib/invoice` + pdfmake, Web Rechnungsmodul |
| 23 | CSV-Export | Web `GET /api/exports` CSV |
| 24 | Desktop lokal | `apps/desktop` mit headless Integrationstest des lokalen Modus |
| 25 | Server selbst gehostet | `apps/web` + `docker-compose.yml` + Postgres + Health |
| 26 | Desktop ↔ Server verbinden | experimenteller Client vorhanden; Pairing und Replikation noch ohne produktionsreifen End-to-End-Nachweis |
| 27 | Geräteübergreifender Timer | Serverzustand + `publishEvent`→`pg_notify`→WebSocket geprüft; nativer Desktop-Roundtrip noch offen |
| 28 | iOS-Architektur vorbereitet | `apps/mobile` mit lokaler Store-/Sync-Architektur; nicht produktionsbereit |
| 29 | Sync-Konflikte erkannt | serverseitig `conflict_records` + 409-Compare-and-Set; vollständige native Auflösungs-UI noch offen |
| 30 | Audit-Log | `audit_logs` bei jeder Mutation (`db::audit`, `lib/crud/audit`) |
| 31 | Backups | `run_backup` (SQLite-Kopie + `PRAGMA integrity_check`), Web JSON-Export, pg_dump |
| 32 | Tests laufen | Versionsprüfung, `pnpm -r test`, Typprüfung, `cargo test --all-targets` und Server-Smoke in CI |

## Datenschutz

Keine Telemetrie im Standard, keine externen Dienste, keine GPS-/Screenshot-
Überwachung. Lokaler Modus voll ohne Internet. DSGVO-Konzept (Export Art. 20,
Löschkonzept Art. 17 mit Aufbewahrungssperren, Argon2id-Passwörter und
gehashte Session-Tokens) siehe
[`docs/project-time-ledger/09-datenschutz-sicherheit.md`](docs/project-time-ledger/09-datenschutz-sicherheit.md).

## Roadmap-Stand

Fundament, Export/Abrechnung, DE-Compliance und der selbst gehostete
Browser-Server sind implementiert. Desktop macOS/Windows ist im lokalen Modus
funktional; seine Server-Replikation sowie iOS-Sync bleiben vor einer
Produktionsfreigabe end-to-end fertigzustellen. Import, Webhooks und
Team/Kundenportal sind architektonisch vorbereitet.
