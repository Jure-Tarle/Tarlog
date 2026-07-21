# Changelog

Alle nennenswerten Änderungen an Tarlog. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[SemVer](https://semver.org/lang/de/).

## [0.0.6], 2026-07-21

Mehrsprachigkeit (Deutsch/Englisch), Apple-getreue Liquid-Glass-Steuerelemente
und ein entkoppelter Archivieren/Löschen-Fluss für Projekte.

### Sprache
- Die gesamte Anwendung ist jetzt vollständig übersetzbar; in den
  Einstellungen lässt sich zwischen Deutsch und Englisch umschalten
  (Standard bleibt Deutsch). Datums-, Zahlen- und Währungsformate folgen der
  gewählten Sprache.
- Das native macOS-Menü und das Menüleisten-Objekt (Tray) übernehmen die
  gewählte Sprache beim nächsten App-Start.

### Projekte
- Archivieren, Reaktivieren und endgültiges Löschen von Projekten sind jetzt
  getrennte Aktionen. Das Löschen wird zweistufig in der Zeile bestätigt, da
  `window.confirm` in der Tauri-WebView nicht verfügbar ist; erfasste Zeiten
  bleiben erhalten. Schema v7 macht früher fälschlich soft-gelöschte
  archivierte Projekte wieder sichtbar.

### macOS
- Die gesamte obere Leiste ist jetzt ziehbar statt Text zu markieren.
- Buttons, Selects und der prominente CTA sind auf echtes Liquid Glass
  umgestellt: transluzentes Material mit Hintergrund-Refraktion
  (SVG-Displacement) statt reinem Blur, Randlicht statt harter Border und ein
  Hover, der das Material nur aufhellt statt die Farbe zu wechseln.
- Der Sidebar-Umschalter kollidiert bei ausgeblendeter Seitenleiste nicht
  mehr mit den nativen Ampelknöpfen.

### Kunden und Projekte
- Archivieren eines Kunden war bis Schema v7 mit Soft-Delete gekoppelt
  (`deleted_at` wurde mitgesetzt), wodurch archivierte Kunden aus jeder
  Liste verschwanden und sich nicht mehr reaktivieren ließen — derselbe
  Fehler, der für Projekte bereits in Schema v7 behoben wurde. Schema v8
  entkoppelt Archivieren und Löschen für Kunden ebenso, mit
  Reparaturmigration für bereits betroffene Datensätze und einer neuen
  „Reaktivieren“-Aktion in der Kundenliste.
- Der Kunde eines Projekts lässt sich jetzt auch direkt auf der
  Projekt-Detailseite ändern.
- Kaputtes Platzhalter-Label (", intern ,") in der Projekt-Kundenauswahl
  und -Tabelle durch einen sauberen Text ersetzt.

## [0.0.5], 2026-07-15

Strukturelle Korrektur der macOS-Fensterarchitektur nach der visuellen Prüfung
von Onboarding, Dashboard, Timer und Einstellungen.

### macOS

- Die fehleranfällige Overlay-Titelleiste wurde durch die normale native
  AppKit-Titelleiste ersetzt. Ampelknöpfe, Fenstertitel und WebView-Inhalt
  besitzen damit wieder getrennte, systemverwaltete Bereiche.
- Die doppelte Markenleiste im Onboarding entfällt; Ersteinrichtung und
  Haupt-App verwenden eine kompakte Source-List-Sidebar und eine ruhige
  Werkzeugleiste unterhalb der nativen Titelleiste.
- System-, helle und dunkle Darstellung werden über echte Einträge im nativen
  Menü „Darstellung“ umgeschaltet statt über ein Web-Select in der Toolbar.
- Dashboard-Kennzahlen sind als geschlossenes dreispaltiges Inset-Grid ohne
  Leerflächen angeordnet; redundante Seitentitel und übergroße Timer-Typografie
  wurden entfernt.
- Light Mode, Dark Mode, reduzierte Transparenz und erhöhter Kontrast behalten
  die vorhandenen plattformspezifischen Fallbacks.

## [0.0.4], 2026-07-15

Korrektur der nativen macOS-Auslieferung und Fokusdarstellung nach der
visuellen Abnahme des Onboardings.

### macOS

- Das Onboarding behält den programmatischen Fokus für Screenreader bei, zeigt
  auf der nicht interaktiven Schrittüberschrift aber keinen irreführenden blauen
  Tastaturfokus-Halo mehr.
- Lokaler Start und Release-Abnahme erfolgen über das echte `Tarlog.app`-Bundle,
  damit macOS den konfigurierten Namen und das gebündelte Tarlog-App-Icon statt
  des generischen `exec`-Symbols einer direkt gestarteten Unix-Datei verwendet.

## [0.0.3], 2026-07-13

Vollständiger Produktdurchgang des Apple-orientierten Redesigns mit geführtem
Erststart, belastbareren Zuständen und korrigierten Desktop-Datengrenzen.

### Design, macOS und Web

- macOS-Oberfläche an die aktuellen Apple-Material-, Sidebar-, Menü-,
  Dark-Mode- und Accessibility-Grundsätze angeglichen; System/Hell/Dunkel,
  reduzierte Transparenz, erhöhter Kontrast und reduzierte Bewegung besitzen
  jeweils explizite Fallbacks.
- Native AppKit-Menüs, SF-Symbol-Laufzeitdarstellung und Menüleistensteuerung
  enger mit dem tatsächlichen Timerzustand verbunden; Windows und Web erhalten
  dieselbe Informationsarchitektur mit plattformgerechten Fallback-Icons.
- Web-App um Fokusführung bei Routenwechseln, globale Offline-Rückmeldung,
  Route-Loading/Error-Recovery, Forced-Colors-Unterstützung sowie adaptive
  Wochen-, Monats- und Nachtragsansichten ergänzt.
- Material und Unschärfe bleiben auf Navigation, Werkzeugleisten, Dialoge und
  funktionale Statuslagen begrenzt; Inhaltsflächen bleiben ruhig und lesbar.

### Onboarding und Sync

- Versioniertes, beim ersten Start verpflichtendes und fortsetzbares
  Sechs-Schritt-Onboarding für Desktop und Web: Arbeitsbereich, erster echter
  Kunde/Projekt, Live-Timer, Nachtrag, Sync-Grenzen und Abschluss.
- Self-Hosting-Anleitung für PostgreSQL, HTTPS/Reverse-Proxy,
  Long-Poll/WebSocket, Backup/Restore und Browser-Sync vollständig überarbeitet.
- Desktop-Pairing und Push/Pull-Verträge an die Server-Endpunkte angeglichen;
  Oberfläche und Dokumentation kennzeichnen native Replikation weiterhin
  ehrlich als technische Vorschau und unterscheiden Offline-, Puffer-, Fehler-
  und Konfliktzustände.

### Daten, Sicherheit und Release

- Desktop-SQLite-Schema auf Version 2 migriert: fehlende Rechnungs- und
  Compliance-Tabellen samt Indizes ergänzt, inklusive Fresh-/Upgrade-/No-op-
  Integrationstests gegen die realen Repository-Abfragen.
- Browser-Setup, Session-/Gerätebindung und kurzlebige Realtime-Tokens gehärtet
  und mit zusätzlichen Tests abgedeckt.
- Einheitliche Version `0.0.3` über Workspace, Tauri, Cargo und Expo; CI und
  Release prüfen Manifest/Tag-Konsistenz, bevor macOS-/Windows-Bundles oder das
  Server-Image erzeugt werden.

## [0.0.2], 2026-07-13

Apple-orientiertes Redesign der Desktop- und Browser-App mit einem neuen,
plattformübergreifenden Tarlog-Flow-Markenauftritt.

### Desktop und macOS
- Vollständig neu gestaltete Arbeitsoberfläche mit adaptiver Sidebar, kompakten
  Werkzeugleisten, Apple-nahen Abständen, Typografie und Kontrollzuständen.
- Native macOS-Overlay-Titelleiste mit Traffic Lights, deutsches AppKit-Menü,
  systemweite Tastenkürzel und monochromes Template-Icon für die Menüleiste.
- System/Hell/Dunkel mit live synchronisierter macOS-Darstellung, inaktivem
  Fensterzustand sowie Unterstützung für reduzierte Bewegung, Transparenz und
  erhöhten Kontrast.
- Laufzeitgerenderte, echte SF Symbols für Navigation und Werkzeugleiste mit
  sicheren Lucide-Fallbacks auf Windows, Linux und im Browser.
- Ein-/ausblendbare und größenverstellbare Source-List-Sidebar, ruhiger
  Scroll-Edge-Toolbar-Layer und flachere, systemnahe Inhaltskomponenten.

### Browser-App
- Neue responsive App-Shell, Navigation, Dashboards, Timer-Steuerung, Tabellen,
  Formulare und Dialoge im gemeinsamen Tarlog-Flow-Designsystem.
- System/Hell/Dunkel folgt auf Wunsch live der Betriebssystem-Darstellung; Glas
  bleibt auf Navigation, mobile Werkzeugleiste und modale Funktionsebenen begrenzt.
- Der Standalone-Produktionsserver liefert die gebauten CSS- und JavaScript-
  Assets zuverlässig aus; Entwicklung und Hot Reload bleiben davon unberührt.
- Verbesserte Echtzeit-Timerdarstellung und konsistente Status-, Fokus- und
  Ladezustände in allen zentralen Arbeitsabläufen.

### Marke und Qualität
- Neues Flow-Dial-Logo und vollständige Icon-Familie für macOS, Windows, Web,
  iOS und Android; das App-Icon liegt zusätzlich als unmaskiertes,
  schattenfreies Layer-Master für Apple Icon Composer vor.
- Zusätzliche Tests für Desktop-Plattformerkennung, Timerlogik, Web-Controls und
  Versionsauflösung; insgesamt 167 bestandene TypeScript-/React-Tests plus
  Rust-Unit- und Integrationstest.

## [0.0.1], 2026-07-10

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

[0.0.5]: https://github.com/Jure-Tarle/Tarlog/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/Jure-Tarle/Tarlog/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/Jure-Tarle/Tarlog/compare/v0.0.1...v0.0.3
[0.0.2]: https://github.com/Jure-Tarle/Tarlog/compare/v0.0.1...c7cac13
[0.0.1]: https://github.com/Jure-Tarle/Tarlog/releases/tag/v0.0.1
