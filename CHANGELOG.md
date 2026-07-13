# Changelog

Alle nennenswerten Änderungen an Tarlog. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[SemVer](https://semver.org/lang/de/).

## [0.0.2] — 2026-07-13

Apple-orientiertes Redesign der Desktop- und Browser-App mit einem neuen,
plattformübergreifenden Tarlog-Flow-Markenauftritt.

### Desktop und macOS
- Vollständig neu gestaltete Arbeitsoberfläche mit adaptiver Sidebar, kompakten
  Werkzeugleisten, Apple-nahen Abständen, Typografie und Kontrollzuständen.
- Native macOS-Overlay-Titelleiste mit Traffic Lights, deutsches AppKit-Menü,
  systemweite Tastenkürzel und monochromes Template-Icon für die Menüleiste.
- Synchronisierter Light-/Dark-Mode sowie physische Spring-Animationen mit
  Unterstützung für reduzierte Bewegung und reduzierte Transparenz.

### Browser-App
- Neue responsive App-Shell, Navigation, Dashboards, Timer-Steuerung, Tabellen,
  Formulare und Dialoge im gemeinsamen Tarlog-Flow-Designsystem.
- Verbesserte Echtzeit-Timerdarstellung und konsistente Status-, Fokus- und
  Ladezustände in allen zentralen Arbeitsabläufen.

### Marke und Qualität
- Neues Flow-Dial-Logo und vollständige Icon-Familie für macOS, Windows, Web,
  iOS und Android.
- Zusätzliche Tests für Desktop-Plattformerkennung, Timerlogik, Web-Controls und
  Versionsauflösung; insgesamt 164 bestandene TypeScript-/React-Tests plus
  Rust-Integrationstest.

## [0.0.1] — 2026-07-10

Erste Release-Version. Lokale-zuerst, revisionsfähige, DSGVO-freundliche
Zeiterfassung für eine Einzelperson, optional mit selbst gehostetem Server für
Synchronisierung zwischen Desktop, Browser und iOS.

### Core (`@tarlog/core`)
- Zeitberechnung, Rundung (9 Modi, 6 Intervalle), deutsches und EU-Arbeits­zeit­profil,
  Abrechnung (Stundensatz, Tagessatz, Festpreis, Retainer).
- Tatsächliche Arbeitszeit (`actual_duration_seconds`) und Abrechnungszeit
  (`billing_duration_seconds`) strikt getrennt; Rundung überschreibt nie die
  gemessene Dauer (70 Minuten → 75 Minuten bei 15-Minuten-Intervall).
- 98 Unit-Tests.

### Datenmodell (`@tarlog/db`)
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
- XLSX-/ZIP-Export, Import-Assistent und Webhooks sind vorgesehen, aber in 0.0.1
  noch nicht enthalten.

[0.0.2]: https://github.com/Jure-Tarle/Tarlog/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/Jure-Tarle/Tarlog/releases/tag/v0.0.1
