# Changelog

Alle nennenswerten Änderungen an Project Time Ledger. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[SemVer](https://semver.org/lang/de/).

## [1.0.0] — 2026-07-10

Erste Release-Version. Lokale-zuerst, revisionsfähige, DSGVO-freundliche
Zeiterfassung für eine Einzelperson, optional mit selbst gehostetem Server für
Synchronisierung zwischen Desktop, Browser und iOS.

### Core (`@ptl/core`)
- Zeitberechnung, Rundung (9 Modi, 6 Intervalle), deutsches und EU-Arbeits­zeit­profil,
  Abrechnung (Stundensatz, Tagessatz, Festpreis, Retainer).
- Tatsächliche Arbeitszeit (`actual_duration_seconds`) und Abrechnungszeit
  (`billing_duration_seconds`) strikt getrennt; Rundung überschreibt nie die
  gemessene Dauer (70 Minuten → 75 Minuten bei 15-Minuten-Intervall).
- 98 Unit-Tests.

### Datenmodell (`@ptl/db`)
- 40 Tabellen als dual-dialektisches Drizzle-Schema (SQLite + PostgreSQL).
- Generierte PostgreSQL-Migration.

### Server + Browser-App (`apps/web`)
- Next.js 15, Auth mit Argon2id-Sessions, Rate-Limiting, Same-Origin-Schutz.
- REST-API, Event-Log-Sync mit Konflikterkennung (`conflict_records`, nie
  stilles Verwerfen), WebSocket-Live-Kanal über PostgreSQL LISTEN/NOTIFY.
- Rechnungsmodul: fortlaufende Nummern erst bei Finalisierung, Immutability,
  Storno als Gegenrechnung, §14-UStG-Pflichtangaben.
- Exporte: PDF-Arbeitszeitnachweis, PDF-Rechnung, CSV, JSON-Vollexport (DSGVO).
- Docker-Compose-Deployment; Container-Image auf GHCR (linux/amd64, linux/arm64).

### Desktop (`apps/desktop`)
- Tauri 2 für macOS und Windows. Vollständig offline-fähiger lokaler
  SQLite-Modus, Timer, Nachtrag, Menüleisten-/Tray-Steuerung, lokale Backups mit
  Integritätsprüfung, optionaler Server-Sync.
- Headless-Integrationstest des lokalen Modus (`cargo test --test local_mode`).

### iOS (`apps/mobile`)
- Expo/React Native auf `expo-sqlite` mit Offline-Queue. Timer, Heute, Woche,
  Nachtrag, Sync-Status, Einstellungen.

### Qualität
- CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)): Unit-Tests,
  `cargo test`, End-to-End-Smoke (`scripts/smoke.sh`, 22 Invarianten).

### Bekannte Einschränkungen
- Für den Server-Modus ist eine HTTPS-Terminierung (Reverse Proxy) vorzuschalten;
  Session-Cookies sind in Produktion `secure`.
- Desktop-Bundles und iOS-App sind nicht signiert/notarisiert.
- XLSX-/ZIP-Export, Import-Assistent und Webhooks sind vorgesehen, aber in 1.0.0
  noch nicht enthalten.

[1.0.0]: https://github.com/Jure-Tarle/Tarlog/releases/tag/v1.0.0
