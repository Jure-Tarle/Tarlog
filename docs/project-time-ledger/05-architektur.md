# Technische Architektur & API-Konzept

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Dokument beschreibt die technische Zielarchitektur von Project Time Ledger: Plattformstrategie, die konkrete Technologie-Empfehlung (SPEC §37), das Monorepo-Layout, das gemeinsame Core-Package, das API-Konzept (SPEC §32), die Webhooks (SPEC §33), die Live-Kanal-Architektur, die projektweiten Konventionen sowie die Betriebsthemen des selbst gehosteten Server-Modus (SPEC §4.2). Datenmodell-Details siehe [Datenmodell](06-datenmodell.md), Sync-Details siehe [Synchronisierung](04-sync.md), Rechenkern siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md).

Leitprinzip: **local-first mit optionalem Server-Sync**. Die App ist vollständig lokal nutzbar (keine Registrierung, kein Cloud-Zwang, keine Telemetrie im Standard). Ein selbst gehosteter Server ist optional, aber professionell vorbereitet. Der Server ist die **kanonische Wahrheit** für synchronisierte Daten; jedes Gerät hält eine lokale Kopie.

---

## 1. Plattformstrategie (SPEC §5 — alle 16 Punkte)

Die empfohlene technische Zielarchitektur aus SPEC §5 wird 1:1 übernommen. Jeder Punkt mit Rolle und Begründung:

| # | Punkt (SPEC §5) | Umsetzung | Begründung |
|---|---|---|---|
| 1 | Web App mit Next.js und TypeScript | `apps/web` — Next.js 15, App Router, TypeScript strict | SSR/Route Handlers, gute Self-Host-Story (`output: 'standalone'`), gemeinsames TS-Ökosystem |
| 2 | Desktop App mit Tauri für macOS und Windows | `apps/desktop` — Tauri 2.x, Rust-Kern + Web-Frontend | kleine Binaries, native Menüleiste/Tray, SQL-Plugin, geringer RAM-Footprint statt Electron |
| 3 | Mobile App mit Expo und React Native für iOS | `apps/mobile` — Expo SDK, React Native | schnelle iOS-Iteration, `expo-sqlite` für local-first, Config-Plugins für Widget/Live-Activity |
| 4 | gemeinsames TypeScript Core Package für Business Logik | `packages/core` | eine Quelle für Zeitberechnung, Rundung, Compliance, Abrechnung — identisches Verhalten auf allen Plattformen |
| 5 | lokale Desktop Datenbank mit SQLite | SQLite über `tauri-plugin-sql` | serverlos, dateibasiert, offline, `PRAGMA integrity_check`, optional SQLCipher |
| 6 | Server Datenbank mit PostgreSQL | PostgreSQL 16 im Server-Modus | robuste Nebenläufigkeit, partielle Indizes, `TIMESTAMPTZ`, JSONB für `rules_json`/Audit |
| 7 | typisierte API | tRPC intern + REST/OpenAPI extern, End-to-End-Typen aus Zod | Typsicherheit vom Client bis zur DB, keine Drift zwischen Schema und Handler |
| 8 | gemeinsame Validierung mit Zod oder vergleichbarer Bibliothek | **Zod** im Core-Package | ein Schema validiert Eingaben, leitet TS-Typen ab, speist OpenAPI |
| 9 | PDF Generierung serverseitig und optional lokal | `pdfmake` (portabler Kern) + Playwright/Chromium optional serverseitig | pdfmake läuft lokal in Tauri ohne Chromium; Playwright nur serverseitig für pixelgenaue Templates |
| 10 | Docker Compose für Selbst Hosting | `docker-compose.yml` (web, postgres, optional redis, optional S3-kompatibel) | reproduzierbares Ein-Kommando-Setup ohne externen Anbieter |
| 11 | optional OpenAPI für externe Integrationen | OpenAPI 3.1 aus Zod generiert | externe Clients/Integrationen ohne TS-Bindung |
| 12 | optional tRPC für interne TypeScript Geschwindigkeit | tRPC-Router für Web/Desktop/Mobile-Frontends | keine handgeschriebenen Fetch-Clients, sofortige Typ-Rückmeldung |
| 13 | Event Log für Synchronisierung | `sync_events`-Tabelle, append-only | jede Änderung erzeugt ein Sync-Event; Grundlage für Replikation und Audit |
| 14 | WebSocket oder Server Sent Events für Live Timer Synchronisierung | **WebSocket primär**, SSE als Alternative | bidirektional, geringe Latenz für Timer-Zustand über alle Geräte |
| 15 | Fallback Polling für einfache Serverumgebungen | Polling-Endpoint mit `updated_since`-Cursor | funktioniert hinter jedem Reverse-Proxy ohne WS-Upgrade |
| 16 | Hintergrundjobs für Exporte, Rechnungen und Sync Wartung | Job-Runner, optional Redis-Queue | lange Exporte/PDF-Renderings/Sync-Kompaktierung asynchron |

---

## 2. Konkrete technische Empfehlung (SPEC §37 — alle 16 Punkte)

SPEC §37 verlangt eine klare Empfehlung. Die folgende Tabelle deckt alle 16 Punkte mit Empfehlung und Begründung ab. Die Entscheidungen aus dem Plan (§1) werden dokumentiert, nicht neu verhandelt.

| # | SPEC-§37-Punkt | Empfehlung | Begründung |
|---|---|---|---|
| 1 | Next.js für Web und Server UI | **Next.js 15** (App Router) | Self-Host via `output: 'standalone'` (~150 MB Image), Route Handlers, gemeinsames TS-Ökosystem |
| 2 | TypeScript überall | **TypeScript strict** in allen Packages/Apps | eine Sprache über Web/Desktop/Mobile/Core, End-to-End-Typen |
| 3 | Tauri für macOS und Windows Desktop | **Tauri 2.x** | native Menüleiste (`tray-icon`), Updater-Plugin, SQL-Plugin, kleines Binary; Code Signing via Apple Developer Account |
| 4 | Expo und React Native für iOS | **Expo SDK + React Native** | schnelle iOS-Builds, `expo-sqlite`, Config-Plugins für WidgetKit/ActivityKit/Siri Shortcuts |
| 5 | PostgreSQL für Server Datenbank | **PostgreSQL 16** | Nebenläufigkeit, partielle UNIQUE-Indizes (Single-Timer), `TIMESTAMPTZ`, JSONB |
| 6 | SQLite für lokale Desktop Datenbank | **SQLite** (via `tauri-plugin-sql`) | serverlos, offline, integritätsprüfbar, optional SQLCipher |
| 7 | gemeinsames Core Package für Zeit, Rundung, Compliance und Abrechnung | **`packages/core`** (pure functions) | deterministische, testbare Logik einmal geschrieben, überall identisch |
| 8 | Zod für Validierung | **Zod** | ein Schema → Validierung + TS-Typen + OpenAPI; geteilt in `packages/core` |
| 9 | Prisma oder Drizzle als Datenzugriff, Entscheidung begründen | **Drizzle ORM** (siehe §2.1) | ~57 KB / 7 KB gzip, zero runtime deps, nativer Dialekt-Switch SQLite↔PostgreSQL, läuft in Tauri via `drizzle-proxy → tauri-plugin-sql` |
| 10 | Docker Compose für Selbst Hosting | **Docker Compose** | ein Kommando, kein externer Anbieter erforderlich |
| 11 | WebSocket für Live Sync | **WebSocket primär** | bidirektionaler, latenzarmer Timer-Zustand; Custom-Node-Server bei `standalone` |
| 12 | Polling Fallback | **Polling** mit `updated_since`-Cursor | einfache Serverumgebungen ohne WS-Upgrade |
| 13 | PDF Generierung mit serverseitiger Rendering Pipeline | **Playwright/Chromium** serverseitig (optional) + `pdfmake` Kern | pixelgenaue HTML-Templates/Charts serverseitig; portabler Kern für Desktop |
| 14 | lokale PDF Generierung für reinen Desktop Modus optional | **`pdfmake`** lokal in Tauri | ohne Chromium lauffähig, JSON-deklarativ, ideal für strukturierte Nachweise/Rechnungen |
| 15 | Event Log für Sync | **`sync_events`** append-only Event-Log | Feld-Level-LWW mit Hybrid Logical Clock (HLC), Server als kanonische Wahrheit |
| 16 | Audit Log für Nachvollziehbarkeit | **`audit_logs`** (before/after JSON) | revisionsfähige Protokollierung kritischer Änderungen — siehe [Datenmodell](06-datenmodell.md) |

### 2.1 ORM-Entscheidung: Drizzle vs. Prisma (ausführlich begründet)

**Entscheidung: Drizzle ORM.** Diese Wahl ist für dieses Produkt architektonisch prägend, weil dieselbe Datenzugriffsschicht sowohl gegen **SQLite im Desktop-Client** als auch gegen **PostgreSQL im Server** laufen muss.

| Kriterium | Drizzle | Prisma | Bewertung für dieses Produkt |
|---|---|---|---|
| Bundle-Größe | ~57 KB / ~7 KB gzip, zero runtime deps | Prisma 7 auf ~1,6 MB reduziert, aber Engine-Overhead | Drizzle: kritisch für Tauri-Client-Bundle |
| Dialekt-Switch SQLite↔PostgreSQL | **nativ**, ein Schema mit Dialekt-Wahl | zwei getrennte Setups, Engine pro Ziel | Drizzle: ein Schema für Client- und Server-DB |
| Tauri-Kompatibilität | läuft via **`drizzle-proxy → tauri-plugin-sql`** (Query im Frontend gebaut, Params ans Rust-Backend) | Prisma-Query-Engine passt schlecht in den Tauri-SQLite-Kontext | Drizzle: kein Node-Runtime im Client nötig |
| Migrationen | `drizzle-kit` generiert SQL-Migrationen, versioniert im Repo | Prisma Migrate, an Engine gebunden | Drizzle: dieselben Migrations-Artefakte für beide Dialekte |
| Typsicherheit | vollständig typisierte Queries aus dem Schema | ebenfalls stark typisiert | gleichwertig |
| Runtime-Abhängigkeit | keine | Rust-basierte Query-Engine als separater Prozess/Binary | Drizzle: weniger bewegliche Teile beim Self-Hosting |

**Kern-Begründung:** Das Alleinstellungsmerkmal von Drizzle für dieses local-first-Produkt ist die Kombination aus (a) **nativem Dialekt-Switch**, sodass Client (SQLite) und Server (PostgreSQL) aus einem einzigen Schema in `packages/db` bedient werden, und (b) der **Tauri-Tauglichkeit ohne Node-Runtime** im Client über `drizzle-proxy`. Prismas Engine-Modell erzeugt im Tauri-SQLite-Kontext unnötige Reibung. Kleines Bundle und zero runtime deps sind für die Desktop-App zusätzlich vorteilhaft. UUIDv4 wird ausschließlich für Tokens/Secrets genutzt; als Primärschlüssel dient projektweit UUIDv7 (siehe §7).

---

## 3. Monorepo-Layout

Entscheidung: **pnpm-Workspace**. Ein Repository, klare Trennung von geteilter Logik (`packages`) und Auslieferungszielen (`apps`).

```
project-time-ledger/
├── pnpm-workspace.yaml
├── package.json                  # Workspace-Root, Skripte (build, test, lint)
├── docker-compose.yml            # Server-Modus (web, postgres, optional redis, optional s3)
├── packages/
│   ├── core/                     # Business-Logik, framework-frei, pure functions
│   │   ├── src/
│   │   │   ├── time/             # Brutto/Netto, Pausen, Zeitzonen/DST, über-Mitternacht
│   │   │   ├── rounding/         # Rundungsmodi, Intervalle, rounding_delta_seconds
│   │   │   ├── compliance/       # DE-/EU-Profile, Regelauswertung, calculation_version
│   │   │   ├── billing/          # Stundensatz/Tagessatz/Festpreis/Retainer, Snapshots
│   │   │   └── schemas/          # Zod-Schemas (single source of truth für Typen + OpenAPI)
│   │   └── package.json
│   └── db/                       # Drizzle-Schema (dual-dialect) + Migrationen
│       ├── src/
│       │   ├── schema/           # Tabellen (UUIDv7-PK, Sync-Meta, Audit-Felder)
│       │   ├── sqlite.ts         # SQLite-Dialekt-Binding (Client)
│       │   └── pg.ts             # PostgreSQL-Dialekt-Binding (Server)
│       ├── migrations/           # drizzle-kit generierte SQL-Migrationen
│       └── package.json
├── apps/
│   ├── desktop/                  # Tauri 2.x (Rust-Kern + Web-Frontend)
│   │   ├── src-tauri/            # Rust: tray-icon, SQL-Plugin, App-Lock (LocalAuthentication)
│   │   └── src/                  # UI, drizzle-proxy → tauri-plugin-sql
│   ├── web/                      # Next.js 15 (App Router)
│   │   ├── server.js             # Custom-Node-Server (WebSocket) bei output:'standalone'
│   │   └── src/app/api/          # Route Handlers (REST), tRPC, SSE, Webhooks
│   └── mobile/                   # Expo / React Native (iOS)
│       └── src/                  # expo-sqlite (offline), Live-Kanal-Client
└── docs/project-time-ledger/     # diese Dokumentation
```

**Abhängigkeitsrichtung:** `apps/*` hängen von `packages/core` und `packages/db` ab; `packages/*` hängen von keiner App ab. `packages/core` ist framework-frei (kein Next, kein Tauri, kein Expo), damit identische Logik auf allen Plattformen läuft.

---

## 4. Core-Package (`packages/core`)

Das gemeinsame Core-Package enthält die gesamte determinismus-kritische Business-Logik als **pure functions** (keine I/O, keine globalen Uhr-Zugriffe außer explizit injizierten). So verhält sich die Berechnung auf Desktop, Web und iOS identisch und ist einheitlich testbar (siehe [Testplan](12-qualitaet.md)).

| Modul | Inhalt | SPEC-Bezug |
|---|---|---|
| `time/` | Bruttozeit, Pausen, `net_work_duration_seconds`, Zeitzonen, Sommerzeit/Winterzeit, Tagesgrenzen, über-Mitternacht-Split (optional) | §25 |
| `rounding/` | Rundungsmodi, Intervalle (5/6/10/15/30/60 Minuten), `rounding_delta_seconds`, `rounding_reason` | §14 |
| `compliance/` | DE-Profil (ArbZG §3/§4/§5), EU-Profil (2003/88/EG), versionierte Länderprofile, `calculation_version` | §15, §16 |
| `billing/` | Stundensatz (Auflösung Aufgabe > Projekt > Kunde > Default), Tagessatz, Festpreis-Profitabilität, Retainer, `rate_snapshot`, `billing_amount_snapshot` | §12/13 |
| `schemas/` | Zod-Schemas als **single source of truth** — leiten TS-Typen ab und speisen die OpenAPI-Generierung | §5 Nr. 8 |

Kernprinzip (siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md)): **`actual_duration_seconds` und `billing_duration_seconds` bleiben strikt getrennt** — die Rundung überschreibt nie die tatsächliche Arbeitszeit. Jede Berechnung trägt eine `calculation_version`, damit finalisierte Rechnungen stabil bleiben.

---

## 5. API-Konzept (SPEC §32 — alle 18 Funktionsbereiche)

Die API existiert nur im Server-Modus. Drei Zugänge über **denselben Service-Layer**: **tRPC** für interne TypeScript-Clients (Web/Desktop/Mobile), **REST** für externe Integrationen, **OpenAPI 3.1** als Vertrag (aus Zod generiert). Kein Handler dupliziert Logik — alle rufen `packages/core` + `packages/db` auf.

Alle 18 API-Funktionsbereiche aus SPEC §32 mit REST-Skizze:

| # | SPEC-§32-Funktion | REST-Endpoint (Skizze) | Live-Event |
|---|---|---|---|
| 1 | Timer starten | `POST /v1/timer/start` | `timer.started` |
| 2 | Timer pausieren | `POST /v1/timer/pause` | `timer.paused` |
| 3 | Timer fortsetzen | `POST /v1/timer/resume` | `timer.resumed` |
| 4 | Timer stoppen | `POST /v1/timer/stop` | `timer.stopped` |
| 5 | Zeiteintrag erstellen | `POST /v1/time-entries` | `time_entry.created` |
| 6 | Zeiteintrag nachtragen | `POST /v1/time-entries` (`source: manual`) | `manual_entry.created` |
| 7 | Zeiteintrag ändern | `PATCH /v1/time-entries/{id}` | `time_entry.updated` |
| 8 | Zeiteintrag löschen | `DELETE /v1/time-entries/{id}` (soft delete) | `time_entry.deleted` |
| 9 | Kunden verwalten | `GET/POST/PATCH/DELETE /v1/customers` | — |
| 10 | Projekte verwalten | `GET/POST/PATCH/DELETE /v1/projects` | — |
| 11 | Aufgaben verwalten | `GET/POST/PATCH/DELETE /v1/tasks` | — |
| 12 | Reports abrufen | `GET /v1/reports/{type}` (Filter als Query) | — |
| 13 | Rechnungen erstellen | `POST /v1/invoices` | `invoice.created` |
| 14 | Exporte erstellen | `POST /v1/exports` (async Job) | `export.created` |
| 15 | Sync Events senden | `POST /v1/sync/events` | — |
| 16 | Sync Events empfangen | `GET /v1/sync/events?since={hlc}` | `sync.completed` |
| 17 | Geräte verbinden | `POST /v1/devices` | `device.connected` |
| 18 | Geräte widerrufen | `DELETE /v1/devices/{id}` | `device.revoked` |

**Design-Regeln:**
- **Versionierung:** URL-Präfix `/v1/`; OpenAPI-Vertrag als versionierter Vertrag. Breaking Changes nur über neue Major-Version.
- **Ressourcen-IDs:** UUIDv7 in Pfaden (zeitgeordnet, dezentral erzeugbar).
- **Fehler:** einheitliches Fehlerobjekt `{ code, message, details }`; Validierungsfehler direkt aus Zod.
- **Idempotenz:** schreibende Endpoints akzeptieren `Idempotency-Key` (wichtig für Offline-Retry beim Sync).
- **Rate Limiting:** pro Token (siehe [Sicherheit](09-datenschutz-sicherheit.md)).

### 5.1 Authentifizierung

- **Session-basiert** (sichere, HttpOnly-Cookies) für die Browser-App am Server.
- **Device-Token / Bearer-Token** für Desktop- und iOS-Apps sowie externe Integrationen: `Authorization: Bearer <token>`. Tokens sind an eine `device_id` gebunden, in `api_tokens` gespeichert und **widerrufbar** (Gerät widerrufen, Session widerrufen, Token widerrufen).
- **Rechteprüfung serverseitig** bei jedem Request; Main-Account-Scoping erzwingt, dass ein Token nur auf Daten des eigenen `main_account` zugreift.
- Optional 2FA (TOTP) und Passkeys im Server-Modus — Details siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md).

---

## 6. Webhooks (SPEC §33 — alle 12 Events, HMAC-Signatur)

Webhooks sind optional und dienen externen Integrationen (Buchhaltung, Automatisierung). Konfiguration pro Endpoint-URL mit einem geteilten `secret`. Zustellung erfolgt asynchron über den Hintergrundjob-Runner mit Retry und Exponential Backoff.

Alle 12 Webhook-Events aus SPEC §33:

| # | Event | Auslöser |
|---|---|---|
| 1 | `time_entry.created` | Zeiteintrag erstellt |
| 2 | `time_entry.updated` | Zeiteintrag geändert |
| 3 | `time_entry.deleted` | Zeiteintrag gelöscht |
| 4 | `timer.started` | Timer gestartet |
| 5 | `timer.paused` | Timer pausiert |
| 6 | `timer.resumed` | Timer fortgesetzt |
| 7 | `timer.stopped` | Timer gestoppt |
| 8 | `manual_entry.created` | Arbeitszeit nachgetragen |
| 9 | `invoice.created` | Rechnung erstellt |
| 10 | `export.created` | Export erstellt |
| 11 | `sync.conflict` | Sync-Konflikt erkannt |
| 12 | `compliance.warning` | Compliance-Warnung ausgelöst |

**Payload-Skizze** (JSON, einheitlicher Umschlag):

```json
{
  "id": "0192f3a1-... (UUIDv7)",
  "type": "timer.started",
  "created_at": 1751846400000,
  "main_account_id": "0192f3a0-...",
  "device_id": "0192f39f-...",
  "data": { "timer_id": "...", "project_id": "...", "started_at": 1751846400000 }
}
```

**HMAC-Signatur:** Jede Auslieferung trägt den Header `X-PTL-Signature: sha256=<hex>`, berechnet als `HMAC-SHA256(secret, raw_body)`. Zusätzlich `X-PTL-Timestamp` gegen Replay (Empfänger verwirft Requests außerhalb eines Toleranzfensters). Der Empfänger verifiziert die Signatur, bevor er den Payload verarbeitet.

---

## 7. Live-Kanal-Architektur

Ziel (SPEC §6): startet der Nutzer den Timer im Browser auf dem Handy, zeigt die Desktop-App ihn ebenfalls als laufend; pausiert der Desktop, sieht der Browser den pausierten Zustand; stoppt iOS, erscheint der Eintrag überall gestoppt. Der Live-Kanal überträgt die 14 Live-Update-Events aus SPEC §6.4 (Details siehe [Synchronisierung](04-sync.md)).

Kaskade (Entscheidung: WebSocket primär):

1. **WebSocket (primär).** Bidirektional, latenzarm. In Next.js benötigt WS einen **Custom-Node-Server** (`server.js`), da Route Handlers serverless arbeiten und keinen WS-Server halten — deshalb `output: 'standalone'` mit eigenem `server.js`, alternativ `next-ws`.
2. **Server-Sent Events (Alternative).** Für Umgebungen ohne WS: SSE nativ via Route Handler + `ReadableStream`. Unidirektional (Server → Client); Client-Aktionen laufen dann über normale POST-Requests.
3. **Polling (Fallback).** Für einfache Serverumgebungen hinter restriktiven Reverse-Proxies: `GET /v1/sync/events?since=<hlc>` in Intervallen. Funktioniert überall, höhere Latenz.

Alle drei Wege liefern denselben Event-Strom; der Client wählt automatisch die höchste verfügbare Stufe und degradiert bei Verbindungsproblemen. Die serverseitige **Single-Timer-Sperre** (partieller UNIQUE-Index, siehe [Synchronisierung](04-sync.md)) stellt sicher, dass pro `main_account` nur ein aktiver Timer existiert, unabhängig vom Kanal.

---

## 8. Konventionen (Entscheidungen 6–8)

Diese Konventionen gelten projektweit und werden im [Datenmodell](06-datenmodell.md) durchgesetzt.

| Thema | Konvention | Begründung |
|---|---|---|
| **IDs** | **UUIDv7** als Primärschlüssel überall; UUIDv4 nur für Tokens/Secrets | zeitgeordnet, dezentral offline erzeugbar, bessere B-Tree-Lokalität (Insert 50M: ~2 min vs. ~20 min bei v4), ideal für verteilte Writes/Merges/Korrelation |
| **Geld** | **Integer minor units**: `amount_cents BIGINT` + `currency CHAR(3)` (ISO 4217). Nie Float | keine Rundungsfehler bei Beträgen; exakte Cent-Berechnung |
| **Zeit (Zeitpunkte)** | **UTC**: `*_at` als epoch-ms `INTEGER` (SQLite) bzw. `TIMESTAMPTZ` (Postgres), plus `timezone TEXT` (IANA, z. B. `Europe/Berlin`) pro Eintrag | eindeutige, geräteunabhängige Zeitbasis; IANA-Zone erlaubt korrekte lokale Anzeige und DST-Behandlung |
| **Zeit (Dauern)** | **`*_seconds INTEGER`** (z. B. `actual_duration_seconds`, `billing_duration_seconds`, `break_duration_seconds`) | sekundengenaue Speicherung, getrennt von Rundung; Anzeige gerundet auf Minuten |

Die IANA-Zone pro Eintrag ist notwendig, damit Sommerzeit/Winterzeit-Übergänge korrekt berechnet werden und über-Mitternacht-Einträge sauber aufgeteilt werden können (siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md)).

---

## 9. Server-Betrieb (SPEC §4.2 — selbst gehosteter Server-Modus)

Der Server-Modus ist optional, aber professionell vorbereitet. Kein externer Anbieter ist erforderlich.

### 9.1 Docker Compose

`docker-compose.yml` orchestriert die Dienste:

| Dienst | Rolle | Pflicht |
|---|---|---|
| `web` | Next.js (`output: 'standalone'`, `server.js` mit WS) | ja |
| `postgres` | PostgreSQL 16 (kanonische Datenbank) | ja |
| `redis` | Queue für Hintergrundjobs (Exporte, Rechnungen, Sync-Wartung) | optional |
| `s3` | S3-kompatibler Speicher für Exporte/Anhänge (z. B. MinIO) | optional |

Ein Kommando (`docker compose up`) startet den vollständigen Stack.

### 9.2 Umgebungsvariablen

Klare, dokumentierte Env-Vars (Auszug):

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | PostgreSQL-Verbindung |
| `REDIS_URL` | optionale Job-Queue |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | optionaler Objektspeicher |
| `SESSION_SECRET` | Signierung sicherer Sessions |
| `WEBHOOK_SIGNING_DEFAULT` | Default-Secret für Webhook-HMAC |
| `PUBLIC_BASE_URL` | Basis-URL für Links/Redirects |
| `PORT` | HTTP-Port des Node-Servers |

Secrets werden nie in Logs geschrieben (siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md)).

### 9.3 Admin-Setup-Wizard

Beim Erststart führt ein **Admin-Setup-Wizard** durch: (1) **Main Account anlegen** (Hauptperson am eigenen Server), (2) sicheres Passwort (Argon2id) setzen, optional 2FA/Passkeys, (3) **Geräte verbinden** (Device-Token ausgeben), (4) **API-Tokens verwalten**, (5) Backup-Ziel konfigurieren. Danach ist der Server einsatzbereit; weitere Geräte (Desktop, Browser, iOS) verbinden sich über Device-Tokens.

### 9.4 Health Check

`GET /healthz` prüft Prozess-Liveness und DB-Erreichbarkeit (leichter `SELECT 1`), `GET /readyz` prüft zusätzlich Migrations-Stand und optionale Dienste (Redis/S3). Für Container-Orchestrierung und Reverse-Proxy-Monitoring.

### 9.5 Migrations & Updates

Schema-Migrationen liegen versioniert in `packages/db/migrations` (via `drizzle-kit` generiert). Beim Server-Start (bzw. als expliziter Migrations-Schritt vor dem App-Start) werden ausstehende Migrationen angewendet. Dieselben Migrations-Artefakte werden im Dialekt-Switch auch für die SQLite-Client-Datenbank verwendet, sodass Client und Server schema-kompatibel bleiben. **Backups vor Migrationen**: `pg_dump` (Server) bzw. SQLite-Kopie (Client); Restore via `pg_restore`. Integritätsprüfung: `PRAGMA integrity_check` (SQLite). Backup-/Restore-Details siehe [Qualität & Betrieb](12-qualitaet.md).

---

## 10. Zusammenfassung der festgelegten Entscheidungen

Diese Architektur setzt die im Plan festgelegten Entscheidungen um (nicht neu verhandelt, hier dokumentiert): **Drizzle** statt Prisma, **WebSocket primär** (SSE/Polling-Kaskade), **Event-Log + Feld-Level-LWW mit Hybrid Logical Clock (HLC)** statt voll-CRDT, **Single-Timer-Durchsetzung** via partiellem UNIQUE-Index, **pdfmake + Playwright** für PDF, **UUIDv7** als PK, **Integer-Cents** für Geld, **UTC + IANA** für Zeit. Weitere Details: [Synchronisierung](04-sync.md), [Datenmodell](06-datenmodell.md), [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md), [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md), [Qualität & Betrieb](12-qualitaet.md).
