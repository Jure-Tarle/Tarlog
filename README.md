# Project Time Ledger

Professionelle, revisionsfähige, datenschutzfreundliche Zeiterfassung für eine
Einzelperson (Freelancer, Berater, Entwickler, Designer, Kreative). Lokal
nutzbar **ohne Cloud-Zwang**, optional mit selbst gehostetem Server für
Synchronisierung zwischen Desktop, Browser und iOS.

> Rechtliche Aussagen im Produkt sind Produkt-Hinweise, keine Rechtsberatung.

Vollständige Produkt- und Architekturausarbeitung: [`docs/project-time-ledger/`](docs/project-time-ledger/README.md).

## Monorepo

pnpm-Workspace, TypeScript überall, gemeinsames Core-Package für Zeit, Rundung,
Compliance und Abrechnung.

| Paket | Zweck | Stack | Status |
|---|---|---|---|
| [`packages/core`](packages/core) | Business-Logik: Zeitberechnung, Rundung, DE/EU-Compliance, Abrechnung, Zod-Schemas | TypeScript, luxon, zod | **98 Tests grün** |
| [`packages/db`](packages/db) | Dual-Dialekt-Datenmodell (40 Tabellen) | Drizzle ORM (SQLite + PostgreSQL) | build grün |
| [`apps/web`](apps/web) | Selbst gehosteter Server + Browser-App: Auth, REST-API, Sync (WebSocket + Polling), PDF/CSV, Rechnungen, Docker | Next.js 15, pg, pdfmake, ws | **45 Tests grün** |
| [`apps/desktop`](apps/desktop) | macOS/Windows: lokaler SQLite-Offline-Modus, Timer, Nachtrag, Tray, Backup, optionaler Sync-Client | Tauri 2, rusqlite, React/Vite | tsc + vite + cargo check grün |
| [`apps/mobile`](apps/mobile) | iOS vorbereitet: expo-sqlite lokal, Timer/Heute/Nachtrag, Sync-Client, Offline-Queue | Expo 52, React Native | tsc grün |

### Kern-Entscheidungen (aus der Recherche)

Drizzle statt Prisma (Tauri-SQLite-Tauglichkeit, Dialekt-Switch) · WebSocket
primär + Polling-Fallback · Sync = Event-Log + Feld-LWW mit Hybrid Logical Clock
(kein CRDT) · Single-Timer via partiellem `UNIQUE`-Index auf `timer_states` ·
pdfmake portabel · UUIDv7-PKs · Geld = Integer-Cents · Zeit = UTC epoch-ms +
IANA-Zeitzone je Eintrag · **`actual_duration_seconds` (Brutto) strikt getrennt
von `billing_duration_seconds` (gerundet) — Rundung überschreibt nie die echte Zeit.**

## Bauen, Testen, Nachweisen

```bash
pnpm install
pnpm -r build      # core, db, web, desktop-frontend
pnpm -r test       # core 98 + web 45 Unit-Tests

# Lokaler Desktop-Modus, headless gegen eine Wegwerf-SQLite-DB:
cd apps/desktop/src-tauri && cargo test --test local_mode

# iOS-App (Architektur vorbereitet):
pnpm --filter @ptl/mobile exec tsc --noEmit

# Server end-to-end: Postgres → Migration → REST → WebSocket → Rechnung → Sync.
# 20 harte Assertions über alle Kern-Invarianten, Exit 0 = alles hält.
./scripts/smoke.sh

# Natives Desktop-Binary (ohne Signing):
pnpm --filter @ptl/desktop exec tauri build --no-bundle

# Selbst hosten:
cp .env.example .env && docker compose up   # Postgres + Web
```

Alle drei Ebenen laufen auch in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)):
Unit-Tests, `cargo test` für den lokalen Modus, und der Smoke-Lauf gegen einen
echten PostgreSQL-Dienst.

### Was der Smoke-Lauf beweist

Die 15-Minuten-Aufrundung (70 Minuten Ist-Zeit → 75 Minuten Abrechnungszeit,
`actual_duration_seconds` bleibt 4200) · Single-Timer-Invariante (zweiter Start →
409) · Nachtrag mit Grund · ArbZG-§4-Verstoß bei über 6 Stunden ohne Pause ·
PDF-Arbeitszeitnachweis und CSV mit getrennten Spalten · Rechnung: Nummer erst
bei Finalisierung, PDF, Storno als Gegenrechnung · Sync-Konflikt (veraltete
`base_version` → 409 + `conflict_records`, nichts wird still verworfen) ·
Live-Sync über WebSocket an einen zweiten Client · Audit-Log.

## Version-1-Akzeptanzkriterien (Spec §35) → Umsetzung

| # | Kriterium | Umsetzung |
|---|---|---|
| 1 | App lokal ohne Server nutzbar | `apps/desktop` lokaler SQLite-Modus (rusqlite), voll offline |
| 2 | Lokales Hauptprofil | `db.rs` bootstrap: `main_accounts`/`local_profiles`-Singleton |
| 3 | Kunden erstellen | `commands::create_customer`, `data/customers`, Web `POST /api/customers` |
| 4 | Projekte erstellen | `commands::create_project`, `data/projects`, Web `POST /api/projects` |
| 5 | Aufgaben erstellen | `tasks`-Tabelle, `data/tasks`, Web `POST /api/tasks` |
| 6 | Stundensätze | `billing_rates` (historisiert), `resolveRate` (Aufgabe>Projekt>Kunde>Default) |
| 7 | Tagessätze | `day_rate_rules`, `computeDayRate` in `@ptl/core` |
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
| 21 | PDF-Arbeitszeitnachweis | `lib/pdf` (pdfmake), Web `GET /api/exports` — 38 Inhalte |
| 22 | PDF-Rechnung | `lib/invoice` + pdfmake, Web Rechnungsmodul |
| 23 | CSV-Export | Web `GET /api/exports` CSV |
| 24 | Desktop lokal | `apps/desktop` (verifiziert: cargo check + vite build grün) |
| 25 | Server selbst gehostet | `apps/web` + `docker-compose.yml` + Postgres + Health |
| 26 | Desktop ↔ Server verbinden | `serverClient.ts` + `src/sync/engine.ts` (Pairing, Bearer-Token) |
| 27 | Browser + Desktop sehen denselben Timer | `timer_states` + `publishEvent`→`pg_notify`→WebSocket-Broadcast |
| 28 | iOS-Architektur vorbereitet | `apps/mobile` (expo-sqlite Store + Sync-Client, tsc grün) |
| 29 | Sync-Konflikte erkannt | `conflict_records`, 409-Compare-and-Set, Konflikt-UI (nie still verwerfen) |
| 30 | Audit-Log | `audit_logs` bei jeder Mutation (`db::audit`, `lib/crud/audit`) |
| 31 | Backups | `run_backup` (SQLite-Kopie + `PRAGMA integrity_check`), Web JSON-Export, pg_dump |
| 32 | Tests laufen | `pnpm -r test` → core 98 + web 45 grün |

## Datenschutz

Keine Telemetrie im Standard, keine externen Dienste, keine GPS-/Screenshot-
Überwachung. Lokaler Modus voll ohne Internet. DSGVO-Konzept (Export Art. 20,
Löschkonzept Art. 17 mit Aufbewahrungssperren, Argon2id-Sessions) siehe
[`docs/project-time-ledger/09-datenschutz-sicherheit.md`](docs/project-time-ledger/09-datenschutz-sicherheit.md).

## Roadmap-Stand

Phasen 1–4 (Fundament, Export/Abrechnung, DE-Compliance, Server + Live-Sync)
implementiert und grün. Phase 5 (native Erweiterung): Desktop macOS/Windows
funktional, iOS vorbereitet. Phase 6 (Import, Webhooks, Team/Kundenportal) laut
Doku architektonisch vorbereitet.
