# Tarlog — Dokumentation

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

## Executive Summary

**Tarlog** ist eine professionelle, revisionsfähige und datenschutzfreundliche Zeiterfassung für **eine einzelne Hauptperson** (Main Account), die zuerst vollständig **lokal ohne Server und ohne Cloud-Zwang** läuft. Ein **selbst gehosteter Server** ist optional und synchronisiert Desktop, Browser und iOS geräteübergreifend — inklusive eines plattformübergreifend konsistenten laufenden Timers. Zwei Prinzipien sind unverhandelbar: **`actual_duration_seconds` und `billing_duration_seconds` bleiben strikt getrennt** (Rundung überschreibt nie die echte Arbeitszeit), und **Datenschutz ist Produktkern** (kein invasives Auto-Tracking, keine Screenshots, keine Telemetrie im Standard). Deutsches Arbeitszeitrecht (ArbZG), DSGVO-konforme Aufbewahrung und §14-UStG-konforme Rechnungen sind First-Class-Module, keine Beiwerke. Diese Dokumentation ist eine **Ausarbeitung, keine Implementierung** — sie ist die belastbare Grundlage für die spätere echte Umsetzung.

## Section-Map — SPEC §38 (30 Abschnitte) → Datei + Anker

Die 30 Abschnitte des geforderten Ergebnisformats (SPEC §38) sind wie folgt auf die zwölf Kapiteldateien und ihre realen Überschriften-Anker verteilt:

| # | SPEC-§38-Abschnitt | Datei | Anker |
|---|---|---|---|
| 1 | Rechercheergebnisse | [01-recherche.md](01-recherche.md) | [#1-wettbewerbsanalyse](01-recherche.md#1-wettbewerbsanalyse) |
| 2 | Produktvision | [02-produkt.md](02-produkt.md) | [#1-produktvision](02-produkt.md#1-produktvision) |
| 3 | Zielgruppen | [02-produkt.md](02-produkt.md) | [#2-zielgruppen-7-gruppen-je-jobs-to-be-done](02-produkt.md#2-zielgruppen-7-gruppen-je-jobs-to-be-done) |
| 4 | Betriebsarten | [02-produkt.md](02-produkt.md) | [#3-betriebsarten-spec-4145](02-produkt.md#3-betriebsarten-spec-4145) |
| 5 | Main Account Konzept | [02-produkt.md](02-produkt.md) | [#4-main-account-konzept-spec-3](02-produkt.md#4-main-account-konzept-spec-3) |
| 6 | vollständige Feature Liste | [02-produkt.md](02-produkt.md) | [#5-vollständige-feature-liste-v1v2](02-produkt.md#5-vollständige-feature-liste-v1v2) |
| 7 | Arbeitszeit nachtragen Konzept | [03-zeiterfassung.md](03-zeiterfassung.md) | [#7-nachtragen-von-arbeitszeiten-spec-7-vollständig](03-zeiterfassung.md#7-nachtragen-von-arbeitszeiten-spec-7-vollständig) |
| 8 | Timer und Pausenkonzept | [03-zeiterfassung.md](03-zeiterfassung.md) | [#2-timer-funktionen-spec-8--alle-38-funktionen](03-zeiterfassung.md#2-timer-funktionen-spec-8--alle-38-funktionen) |
| 9 | Synchronisierungskonzept | [04-sync.md](04-sync.md) | [#1-synchronisationsprinzip--local-first-mit-optionalem-server-sync](04-sync.md#1-synchronisationsprinzip--local-first-mit-optionalem-server-sync) |
| 10 | Konfliktlösung | [04-sync.md](04-sync.md) | [#6-konfliktfälle-65--alle-10-nummeriert](04-sync.md#6-konfliktfälle-65--alle-10-nummeriert) |
| 11 | technische Architektur | [05-architektur.md](05-architektur.md) | [#1-plattformstrategie-spec-5--alle-16-punkte](05-architektur.md#1-plattformstrategie-spec-5--alle-16-punkte) |
| 12 | Datenmodell | [06-datenmodell.md](06-datenmodell.md) | [#datenmodell](06-datenmodell.md#datenmodell) |
| 13 | Zeitberechnungsengine | [07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md) | [#2-die-18-funktionen-der-zeitberechnungsengine-spec-25](07-zeitberechnung-rundung.md#2-die-18-funktionen-der-zeitberechnungsengine-spec-25) |
| 14 | Rundungslogik | [07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md) | [#3-rundungslogik-spec-14](07-zeitberechnung-rundung.md#3-rundungslogik-spec-14) |
| 15 | deutsches Compliance Modul | [08-compliance.md](08-compliance.md) | [#2-deutsches-arbeitszeit-profil--alle-13-regeln](08-compliance.md#2-deutsches-arbeitszeit-profil--alle-13-regeln) |
| 16 | EU Erweiterung | [08-compliance.md](08-compliance.md) | [#4-generisches-eu-profil--alle-6-regeln](08-compliance.md#4-generisches-eu-profil--alle-6-regeln) |
| 17 | Datenschutzkonzept | [09-datenschutz-sicherheit.md](09-datenschutz-sicherheit.md) | [#1-dsgvo-konzept-spec-17](09-datenschutz-sicherheit.md#1-dsgvo-konzept-spec-17) |
| 18 | Exportkonzept | [10-abrechnung-export.md](10-abrechnung-export.md) | [#6-exporte-spec-18](10-abrechnung-export.md#6-exporte-spec-18) |
| 19 | Rechnungskonzept | [10-abrechnung-export.md](10-abrechnung-export.md) | [#5-rechnungsmodul-spec-19](10-abrechnung-export.md#5-rechnungsmodul-spec-19) |
| 20 | UI Konzept | [11-ui-apps.md](11-ui-apps.md) | [#2-hauptbereiche-spec-26--alle-15-bereiche](11-ui-apps.md#2-hauptbereiche-spec-26--alle-15-bereiche) |
| 21 | Desktop App Konzept | [11-ui-apps.md](11-ui-apps.md) | [#5-desktop-app-macos-spec-27--alle-17-funktionen-priorisiert](11-ui-apps.md#5-desktop-app-macos-spec-27--alle-17-funktionen-priorisiert) |
| 22 | iOS Konzept | [11-ui-apps.md](11-ui-apps.md) | [#7-ios-app-spec-28--alle-19-funktionen](11-ui-apps.md#7-ios-app-spec-28--alle-19-funktionen) |
| 23 | API Konzept | [05-architektur.md](05-architektur.md) | [#5-api-konzept-spec-32--alle-18-funktionsbereiche](05-architektur.md#5-api-konzept-spec-32--alle-18-funktionsbereiche) |
| 24 | Sicherheitskonzept | [09-datenschutz-sicherheit.md](09-datenschutz-sicherheit.md) | [#5-sicherheitskonzept-spec-29](09-datenschutz-sicherheit.md#5-sicherheitskonzept-spec-29) |
| 25 | Backup Konzept | [12-qualitaet.md](12-qualitaet.md) | [#1-backup--und-restore-konzept-spec-30](12-qualitaet.md#1-backup--und-restore-konzept-spec-30) |
| 26 | Testplan | [12-qualitaet.md](12-qualitaet.md) | [#2-testplan-spec-34](12-qualitaet.md#2-testplan-spec-34) |
| 27 | Roadmap | [12-qualitaet.md](12-qualitaet.md) | [#4-roadmap-spec-36](12-qualitaet.md#4-roadmap-spec-36) |
| 28 | Risiken | [12-qualitaet.md](12-qualitaet.md) | [#5-risiken-und-mitigation](12-qualitaet.md#5-risiken-und-mitigation) |
| 29 | erste konkrete Implementierungsschritte | [12-qualitaet.md](12-qualitaet.md) | [#6-erste-konkrete-implementierungsschritte](12-qualitaet.md#6-erste-konkrete-implementierungsschritte) |
| 30 | Qualitätsanspruch | [12-qualitaet.md](12-qualitaet.md) | [#7-qualitätsanspruch-spec-39](12-qualitaet.md#7-qualitätsanspruch-spec-39) |

> Hinweis zu Ankern: Die Anker folgen der GitHub-Markdown-Konvention (kleingeschrieben, Leerzeichen → Bindestrich, Satzzeichen wie `§ . ( ) / &` entfernt, Umlaute bleiben erhalten, `—`/`–` erzeugen einen zusätzlichen Bindestrich). Rendert eine andere Engine leicht abweichend, bleibt der Ziel-Abschnitt über seine Überschrift auffindbar.

## Zielgruppen

Sieben Primär-Zielgruppen, optimiert für die **einzelne Hauptperson**: **Selbstständige, Freelancer, Berater, Entwickler, Designer, Kreative, Projektarbeiter**. Jobs-to-be-done je Gruppe in [02-produkt.md](02-produkt.md#2-zielgruppen-7-gruppen-je-jobs-to-be-done). Team, Kundenportal und Agentur sind architektonisch vorbereitet, aber keine V1-Kernvoraussetzung.

## Betriebsarten

Fünf Betriebsarten (Details in [02-produkt.md](02-produkt.md#3-betriebsarten-spec-4145)):

1. **Lokaler Desktop Modus** — ohne Registrierung, ohne Server, ohne Cloud; lokale SQLite-Datenbank.
2. **Selbst gehosteter Server Modus** — Next.js + PostgreSQL + Docker Compose, kein externer Anbieter.
3. **Hybrid Modus mit Synchronisierung** — local-first, Offline-Arbeit + späterer Sync.
4. **Browser Modus** — Zugriff über den selbst gehosteten Server, responsive UI, optional PWA.
5. **iOS Modus** — Server-Anbindung oder vorbereiteter lokaler Modus, offline-fähig.

## Tech-Stack (One-Liner)

**Tauri 2.x** (Desktop macOS/Windows) · **Next.js 15** (Web/Server) · **Expo / React Native** (iOS) · gemeinsames **TypeScript Core Package** (Zeit, Rundung, Compliance, Abrechnung) · **Drizzle ORM** (dual-dialect SQLite↔PostgreSQL) · **Zod** (Validierung) · **pdfmake** (portabler PDF-Kern, Playwright optional serverseitig) · **Event-Log + Feld-Level-LWW mit HLC** (Sync) · **UUIDv7**-PKs · Integer-Cents · UTC + IANA-Zeitzone. Begründung in [05-architektur.md](05-architektur.md#2-konkrete-technische-empfehlung-spec-37--alle-16-punkte).

**Status:** Ausarbeitung, keine Implementierung.

## Bewusste Entscheidungen

Diese Festlegungen sind getroffen und werden in den Kapiteln dokumentiert, nicht neu verhandelt:

- **Drizzle statt Prisma.** ~57 KB / zero runtime deps, nativer Dialekt-Switch SQLite↔PostgreSQL aus einem Schema, läuft in Tauri via `drizzle-proxy → tauri-plugin-sql` ohne Node-Runtime im Client. Prismas Engine-Modell passt schlecht in den Tauri-SQLite-Kontext. Ausführlich in [05-architektur.md](05-architektur.md#21-orm-entscheidung-drizzle-vs-prisma-ausführlich-begründet).
- **Kein invasives Auto-Tracking.** Keine App-/Website-Überwachung, keine Screenshots, kein Geofencing, keine GPS-Pflicht, keine Telemetrie im Standard — bewusste Abgrenzung zu ManicTime/TimeCamp/Timely als Datenschutz-USP ([09-datenschutz-sicherheit.md](09-datenschutz-sicherheit.md#1-dsgvo-konzept-spec-17)).
- **E-Rechnung erst V2.** V1 erzeugt rechtskonforme PDF-Rechnungen mit allen §14-UStG-Pflichtangaben; **ZUGFeRD / XRechnung** (EN 16931) sind vorbereitet, aber erst für V2 ([10-abrechnung-export.md](10-abrechnung-export.md#57-e-rechnung-v2-vorbereitung)).

Weitere feste Konventionen: **WebSocket primär** (SSE/Polling-Fallback), **Event-Log + LWW + HLC** (nicht voll-CRDT), **Single-Timer-Durchsetzung** via partiellem UNIQUE-Index, **pdfmake + optional Playwright**, **UUIDv7**, **Integer-Cents**, **UTC + IANA**.

## Disclaimer

Die rechtlichen Aussagen in dieser Dokumentation (ArbZG, DSGVO, UStG, EU-Richtlinie 2003/88/EG) sind **Produkt-Hinweise auf Basis der zum Recherchestand Juli 2026 verfügbaren Quellen und keine Rechtsberatung.** Selbstständige, die ausschließlich eigene Arbeitszeit erfassen, unterliegen nicht dem ArbZG als Arbeitgeber; die Compliance-Profile sind konfigurierbar und deaktivierbar. Maßgeblich für rechtliche Beurteilungen sind stets die aktuellen Gesetzestexte und eine individuelle Rechtsberatung.

## Glossar

| Begriff | Bedeutung |
|---|---|
| **Main Account** | Das Hauptkonto genau einer Person. Im lokalen Modus ein gerätelokales Hauptprofil, im Server-Modus der Mandantenanker (`main_accounts`). Pro Main Account läuft standardmäßig genau ein aktiver Timer. |
| **Nachtrag** | Eine nachträglich erfasste (nicht live gestoppte) Arbeitszeit. Wird als Quelle „manuell nachgetragen" markiert, erfordert je nach Konfiguration einen Grund und erzeugt einen Audit-Log-Eintrag ([03-zeiterfassung.md](03-zeiterfassung.md#7-nachtragen-von-arbeitszeiten-spec-7-vollständig)). |
| **actual vs. billing** | Trennung der **tatsächlichen** Arbeitszeit (`actual_duration_seconds`, sekundengenau, roh) von der **gerundeten Abrechnungszeit** (`billing_duration_seconds`). Rundung überschreibt die tatsächliche Zeit nie ([07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md#3-rundungslogik-spec-14)). |
| **HLC** | *Hybrid Logical Clock* — kombiniert physische Wall-Clock-Zeit mit einem logischen Zähler `(physical_ms, logical_counter, device_id)`. Liefert eine monotone, geräteübergreifend vergleichbare Ordnung für Feld-Level-LWW, robust gegen falsch gestellte Geräteuhren ([04-sync.md](04-sync.md#11-warum-event-log--lww--hlc-entscheidung-3)). |
| **Event-Log** | Append-only-Journal aller Mutationen (`sync_events`). Jede Änderung erzeugt ein Event; Grundlage für local-first-Replikation, Delta-Sync und Nachvollziehbarkeit ([04-sync.md](04-sync.md#1-synchronisationsprinzip--local-first-mit-optionalem-server-sync)). |
| **Snapshot** | Eingefrorener Wert zum Berechnungs-/Finalisierungszeitpunkt (`rate_snapshot`, `billing_amount_snapshot`, Kunde-/Projekt-/Rundungs-Snapshot). Hält finalisierte Rechnungen stabil, auch wenn Sätze oder Regeln sich später ändern ([07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md#5-snapshots--alte-rechnungen-stabil-halten-spec-25-nr-17-18)). |

## Feldnamen-Glossar — Sync-Meta

Diese drei Sync-Meta-Felder tragen jede sync-pflichtige Tabelle und werden **projektweit identisch** benannt (Abweichung wäre ein Datenmodell-Fehler):

| Feld | Ort | Bedeutung |
|---|---|---|
| `sync_version` | pro Datensatz | Feld-/Zeilenversion für optimistische Nebenläufigkeit; steigt bei jeder Mutation. |
| `server_revision` | serverseitig kanonisch | Monoton steigende Server-Sequenz; Hochwassermarke für Delta-Sync und Konflikterkennung (Server = kanonische Wahrheit). |
| `local_revision` | pro Gerät | Lokaler Änderungszähler; Grundlage für Outbox-Reihenfolge und Rebase eingehender Events. |

Definition und Verwendung: [04-sync.md](04-sync.md#12-sync-meta-felder-überall-gleich-benannt) und [06-datenmodell.md](06-datenmodell.md#sync-meta-spalten-nur-wo-sync-pflicht--ja).

## Kapitelübersicht

| Datei | Inhalt |
|---|---|
| [01-recherche.md](01-recherche.md) | Rechercheergebnisse: Wettbewerb, Recht (DE/EU), DSGVO, Rechnung, Tech-Stack, Quellen |
| [02-produkt.md](02-produkt.md) | Produktvision, Zielgruppen, Betriebsarten, Main Account, Feature-Liste (V1/V2) |
| [03-zeiterfassung.md](03-zeiterfassung.md) | Timer, Stopp-Dialog, Nachtragen, Pausen, Erinnerungen |
| [04-sync.md](04-sync.md) | Synchronisierung, Timer-State-Machine, Konfliktfälle, Uhr-Vertrauen |
| [05-architektur.md](05-architektur.md) | Plattformstrategie, Tech-Empfehlung, Monorepo, API, Webhooks, Server-Betrieb |
| [06-datenmodell.md](06-datenmodell.md) | Alle 31 V1- + 8 Team-Tabellen, Audit-Log, Compliance-Profile, ER-Diagramm |
| [07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md) | Berechnungsengine, Rundungslogik, 70→75-Minuten-Beispiel, Snapshots, DST |
| [08-compliance.md](08-compliance.md) | DE-Arbeitszeit-Profil (ArbZG), EU-Profil, versionierte Länderprofile |
| [09-datenschutz-sicherheit.md](09-datenschutz-sicherheit.md) | DSGVO, Aufbewahrung, Betroffenenrechte, Sicherheitskonzept |
| [10-abrechnung-export.md](10-abrechnung-export.md) | Kunden/Projekte/Aufgaben, Abrechnungsmodelle, Rechnung, Export, Reports, Import |
| [11-ui-apps.md](11-ui-apps.md) | Design-Direktion, UI-Bereiche, Kalender/Timesheet, Desktop- und iOS-Apps |
| [12-qualitaet.md](12-qualitaet.md) | Backup, Testplan (36 Fälle), 32 Akzeptanzkriterien, Roadmap, Risiken, Qualitätsanspruch |
