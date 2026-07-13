# UI-Konzept, Kalender/Timesheet, Desktop- und iOS-Apps

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Kapitel beschreibt die Benutzeroberfläche von Tarlog (SPEC §26), die Kalender-/Timesheet-Ansichten (SPEC §21), die Desktop-App für macOS und Windows (SPEC §27) sowie die iOS-App (SPEC §28). Die Oberfläche muss schnell, klar und professionell sein — sie ist der tägliche Arbeitsplatz einer Einzelperson, die minutengenau erfasst, nachträgt und abrechnet. Die Timer-Logik steht in [Zeiterfassung](03-zeiterfassung.md), die geräteübergreifende Zustandssynchronisierung in [Synchronisierung](04-sync.md), die technische Plattformstrategie in [Architektur](05-architektur.md), das Datenmodell in [Datenmodell](06-datenmodell.md), Rundung/Berechnung in [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md), die Prüfregeln in [Compliance](08-compliance.md), Sicherheit/App-Sperre in [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md) sowie Rechnungen/Exporte in [Abrechnung und Export](10-abrechnung-export.md).

## 1. Design-Direktion (verbindlich)

Desktop und Web folgen der Designsprache **Tarlog Flow**: ein ruhiger,
räumlicher Arbeitsbereich, der Präzision mit der direkten, physischen
Bedienbarkeit hochwertiger Apple-Oberflächen verbindet. Die Anwendung wirkt
hell und offen statt tabellenlastig, bleibt im Dark Mode aber ebenso klar und
kontrastreich. Dekoration ist nie Selbstzweck; Material, Tiefe und Bewegung
erklären Hierarchie und Zustand. Verbindliche Referenzen sind Apples aktuelle
[Design-Übersicht](https://developer.apple.com/design/), die
[Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
und das aktuelle Liquid-Glass-Designsystem. Apple-eigene Assets werden nur im
Rahmen ihrer Plattformlizenz eingesetzt.

| Aspekt | Entscheidung | Begründung |
|---|---|---|
| Grundhaltung | Ruhig, räumlich und fokussiert; die häufigste Aktion ist immer am schnellsten erreichbar | Zeiterfassung ist ein tägliches Werkzeug. Übersicht, direkte Rückmeldung und kurze Wege reduzieren Fehler. |
| Farbsystem | Weißer Canvas im Light Mode, tiefes Graphit im Dark Mode, Systemblau als Fokusfarbe | Blau kennzeichnet Auswahl, laufenden Timer und Primäraktionen. Compliance-Farben bleiben ausschließlich semantisch und werden immer durch Symbol und Text ergänzt. |
| Typografie | Plattformnahe Systemschrift mit optischer Größenanpassung; enge Display-, ruhige Text- und kleine UI-Schnitte | Die Hierarchie entsteht gemeinsam aus Größe, Gewicht, Tracking und Zeilenhöhe. Es werden keine externen Webfonts benötigt. |
| Ziffern | **Tabulare Ziffern** (`font-variant-numeric: tabular-nums`) für Zeiten und Beträge | Live-Timer und Geldwerte bleiben beim Aktualisieren stabil und spaltenweise scanbar. |
| Navigation | Gruppierte Source-List-Seitenleiste mit semantischen Icons; der Timer bleibt global erreichbar | Bereiche sind schneller erfassbar, der aktive Ort ist eindeutig und Desktop/Web behalten dasselbe mentale Modell. Auf macOS werden SF Symbols zur Laufzeit durch AppKit gerendert, andere Plattformen verwenden freie Fallback-Icons. |
| Motion | Unterbrechbare Spring-Bewegung nur für physische Interaktionen, unmittelbares Press-Feedback und kurze Crossfades für gleichrangige Navigation | Bewegung beginnt aus dem sichtbaren Zustand, signalisiert Ursache und bleibt jederzeit umlenkbar. `prefers-reduced-motion` entfernt räumliche Bewegung. |
| Flächen | Liquid Glass beziehungsweise dessen Web-Fallback liegt ausschließlich in der obersten Funktionsschicht: Sidebar, Toolbar und wenige schwebende Hauptaktionen | Inhaltskarten, Tabellen und Formulare bleiben ruhig und weitgehend opak. `prefers-reduced-transparency` ersetzt sämtliche Funktionsmaterialien durch solide Flächen. |
| Themes | **System, Hell und Dunkel** sind gleichwertig; `System` ist der Standard und reagiert live auf Änderungen | Beide Erscheinungsbilder verwenden eigene semantische Tokens statt einer pauschalen Farbinvertierung. Native Fensterflächen folgen derselben Auswahl. |
| Barrierefreiheit | Kontrast AA+, Tastaturvollbedienung, sichtbarer Fokus, ausreichend große Ziele, reduzierte Bewegung/Transparenz | Farbe trägt nie allein Bedeutung. Dialoge halten Fokus, Escape schließt und der Fokus kehrt zum Auslöser zurück. |

Desktop und Web setzen Tarlog Flow gemeinsam um. iOS übernimmt dieselben
semantischen Rollen und Informationsgruppen, verwendet dafür jedoch native
iOS-Navigation und -Materialien (siehe Abschnitte 5–7). Konkreter UI-Code
gehört nicht in dieses Dokument.

## 2. Hauptbereiche (SPEC §26 — alle 15 Bereiche)

Die App hat 15 Hauptbereiche, erreichbar über eine persistente Seitennavigation (Desktop/Web) bzw. Tab-Bar + Mehr-Menü (iOS).

| # | Bereich | Zweck | Verweis |
|---|---|---|---|
| 1 | Dashboard | Tages-/Wochenüberblick, laufender Timer, Schnellaktionen | Abschnitt 3 |
| 2 | Timer | Live-Erfassung: starten, pausieren, fortsetzen, stoppen | [Zeiterfassung](03-zeiterfassung.md) |
| 3 | Heute | Tagesübersicht mit Einträgen, Lücken, Pausen, Tagesgesamtzeit | Abschnitt 4 |
| 4 | Woche | Wochenkalender mit Drag-and-Drop-Timesheet | Abschnitt 4 |
| 5 | Kalender | Monats-/Timeline-Ansichten, Kalendertermin-Übernahme optional | Abschnitt 4 |
| 6 | Kunden | Kundenverwaltung (25 Felder) | [Abrechnung und Export](10-abrechnung-export.md) |
| 7 | Projekte | Projektverwaltung (33 Felder), Budget, Abrechnungsart | [Abrechnung und Export](10-abrechnung-export.md) |
| 8 | Aufgaben | Tätigkeitsarten global/projektbezogen | [Abrechnung und Export](10-abrechnung-export.md) |
| 9 | Reports | 20 Reports + 14 Filter | [Abrechnung und Export](10-abrechnung-export.md) |
| 10 | Rechnungen | Rechnungserstellung, Finalisierung, Storno | [Abrechnung und Export](10-abrechnung-export.md) |
| 11 | Exporte | PDF/CSV/XLSX/JSON, Exporthistorie | [Abrechnung und Export](10-abrechnung-export.md) |
| 12 | Nachträge | Nachtragsassistent, offene/nachgetragene Einträge | [Zeiterfassung](03-zeiterfassung.md) |
| 13 | Compliance | Ampel grün/gelb/rot, Regelerklärung, Override | [Compliance](08-compliance.md) |
| 14 | Einstellungen | Profil, Rundungsregeln, App-Sperre, Themes, Dichte | [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md) |
| 15 | Sync-Status | Geräteübersicht, Sync-Status je Gerät, Konflikte | [Synchronisierung](04-sync.md) |

Die Navigation ist überall gleich strukturiert, damit der Wechsel zwischen Desktop, Web und iOS ohne Umlernen gelingt. Der laufende Timer bleibt als persistente Kopf-/Menüleisten-Komponente in jedem Bereich sichtbar und steuerbar.

## 3. Dashboard (SPEC §26 — alle 15 Elemente)

Das Dashboard ist der Einstieg und zeigt genau 15 Elemente. Es ist als kompaktes Kachel-Raster mit tabularen Ziffern gestaltet; die einzige Akzentfarbe markiert den aktiven Timer und die primäre Schnellstart-Aktion.

| # | Element | Datenquelle / Verhalten |
|---|---|---|
| 1 | laufender Timer | Aktueller `timer_state` (`running`/`paused`), Live-Puls, Ein-Klick Pause/Stopp; siehe [Zeiterfassung](03-zeiterfassung.md) |
| 2 | heutige Arbeitszeit | Summe `net_work_duration_seconds` des Tages, tabular dargestellt |
| 3 | Pausenzeit | Summe `break_duration_seconds` des Tages |
| 4 | abrechenbare Zeit | Summe `billing_duration_seconds` abrechenbarer Einträge heute |
| 5 | nicht abrechenbare Zeit | Summe nicht abrechenbarer Nettozeit heute |
| 6 | Wochenarbeitszeit | Nettozeit der laufenden Kalenderwoche, mit 48-Stunden-Hinweis (EU) |
| 7 | Monatsumsatz | Summe `billing_amount_snapshot` (Integer-Cents) fakturierbarer Zeit im Monat |
| 8 | offene Rechnungszeit | Abrechenbare, noch nicht fakturierte Zeit (Betrag + Stunden) |
| 9 | unvollständige Einträge | Anzahl Entwürfe/Einträge ohne Pflichtfelder, Direktlink zur Vervollständigung |
| 10 | nachgetragene Einträge | Anzahl Einträge mit Quelle „manuell nachgetragen", Direktlink |
| 11 | Compliance-Warnungen | Aggregierte Ampel (grün/gelb/rot) mit Anzahl offener Verstöße/Risiken |
| 12 | Sync-Status | Verbindungszustand, letzter Sync, offene `sync_pending`-Events, `conflict`-Anzahl |
| 13 | zuletzt verwendete Projekte | Liste der letzten Projekte für Schnellstart |
| 14 | Schnellstart | Ein-Klick-Timerstart aus Favoriten/letzten Einträgen/Projektliste |
| 15 | Schnellnachtrag | Direkter Einstieg in den Nachtragsassistenten (vergessener Start/Stopp) |

Jede Kachel ist anklickbar und führt in den zuständigen Hauptbereich. Zahlen aktualisieren sich live über den Sync-Kanal (WebSocket primär, siehe [Architektur](05-architektur.md)); ohne Verbindung zeigt das Dashboard den lokalen Stand plus einen dezenten Offline-Indikator.

## 4. Kalender und Timesheet (SPEC §21)

Der Kalender-/Timesheet-Bereich ist das visuelle Werkzeug zum Erfassen, Nachtragen und Prüfen. Er teilt sich in Ansichten (was gezeigt wird) und Funktionen (was man tun kann).

### 4.1 Ansichten (alle 9)

| # | Ansicht | Inhalt |
|---|---|---|
| 1 | Heute | Alle Einträge des Tages als Zeitstrahl, Lücken und Pausen sichtbar, Tagesgesamtzeit |
| 2 | Woche | 7-Tage-Raster mit Zeitblöcken, primäre Drag-and-Drop-Fläche |
| 3 | Monat | Monatsübersicht mit Tagessummen und Compliance-Markern |
| 4 | Projekt-Timeline | Einträge gefiltert und gruppiert nach Projekt über die Zeit |
| 5 | Kunden-Timeline | Einträge gruppiert nach Kunde über die Zeit |
| 6 | Abrechnung | Ansicht abrechenbarer vs. fakturierter Zeit, Rundungsvorschau |
| 7 | Compliance | Zeitraster mit Ampel-Overlay (Pausen-, Ruhezeit-, Höchstzeit-Verstöße) |
| 8 | offene Einträge | Nur unvollständige Einträge/Entwürfe |
| 9 | nachgetragene Einträge | Nur Einträge mit Quelle „manuell nachgetragen", inkl. Nachtragsgrund |

### 4.2 Funktionen (alle 12)

| # | Funktion | Verhalten |
|---|---|---|
| 1 | Drag and Drop | Einträge im Raster greifen und neu positionieren |
| 2 | Zeitblock ziehen | Aus einer freien Fläche einen neuen Zeitblock aufziehen → neuer Eintrag |
| 3 | Eintrag verschieben | Start-/Endzeit gemeinsam verschieben, Dauer bleibt |
| 4 | Eintrag verlängern | Endkante ziehen; Dauer wächst; Rundungsvorschau aktualisiert sich |
| 5 | Eintrag kürzen | Endkante nach innen ziehen; Dauer sinkt |
| 6 | Lücke als Arbeit erfassen | Erkannte Lücke direkt in einen Eintrag umwandeln (Nachtrag) |
| 7 | Pause einfügen | Innerhalb eines Eintrags einen `time_entry_break`-Block setzen |
| 8 | Überschneidung erkennen | Überlappende Blöcke werden markiert und gewarnt |
| 9 | Kalendertermin übernehmen (optional) | Aus importiertem Kalendertermin einen Eintrag vorbefüllen |
| 10 | Tagesgesamtzeit anzeigen | Netto-/Brutto-Tagessumme in tabularen Ziffern |
| 11 | Rundungsvorschau anzeigen | Live-Vorschau der `billing_duration_seconds` gemäß Rundungsregel; siehe [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md) |
| 12 | Warnungen anzeigen | Inline-Compliance-Warnungen (z. B. `6 Stunden` ohne Pause) am betroffenen Block |

Beim Aufziehen/Ändern eines Blocks öffnet sich ein leichtgewichtiges Inline-Formular (Projekt, Aufgabe, Beschreibung, Pause, Rundungsvorschau, Compliance-Ergebnis, Speichern) — konsistent mit dem Nachtragen aus der Kalenderansicht in [Zeiterfassung](03-zeiterfassung.md). Blöcke folgen dem Zeiger direkt, übernehmen beim Loslassen dessen Geschwindigkeit und rasten mit einer gedämpften, unterbrechbaren Spring-Bewegung ein. Ein leichter Overshoot ist ausschließlich nach einer momentumgetragenen Geste erlaubt.

## 5. Desktop-App macOS (SPEC §27 — alle 17 Funktionen, priorisiert)

macOS hat Priorität. Die Desktop-App ist eine **Tauri 2.x**-App (siehe [Architektur](05-architektur.md)); der Menüleisten-Timer wird über das Tauri **`tray-icon`** realisiert. Die lokale Datenbank ist SQLite (Drizzle via `tauri-plugin-sql`).

Die macOS-Oberfläche verwendet die öffentliche Tauri-Integration für eine
native Overlay-Titlebar mit echten Traffic Lights, ein natives
Tarlog-/Ablage-/Bearbeiten-/Darstellung-/Fenster-/Hilfe-Menü und ein
monochromes Template-Icon in der Menüleiste. Der WebView-Inhalt folgt
AppKit-Metriken, lässt Inhalt unter der Toolbar-Glasschicht scrollen und
verwendet native WebKit-Ausprägungen für Auswahlfelder, Checkboxen sowie
Datum-/Zeit-Picker. Die Source-List-Sidebar ist ein-/ausblendbar und
größenverstellbar; die Aktion liegt zusätzlich im nativen Darstellung-Menü.
Navigation und Toolbar verwenden echte SF Symbols, die AppKit auf macOS zur
Laufzeit als nicht persistierte Masken rendert. `System`/`Hell`/`Dunkel` wird an
das native Fenster weitergereicht; Fensteraktivität und die Systemoptionen für
reduzierte Bewegung, reduzierte Transparenz und erhöhten Kontrast werden live
abgebildet. Private macOS-APIs und volltransparente Fenster werden bewusst nicht
verwendet, damit Signierung, Notarisierung und eine spätere Mac-App-Store-
Verteilung möglich bleiben. Echtes `NSGlassEffectView` hinter einer Tauri-
WebView würde sonst eine private Transparenzroute erfordern; die öffentliche,
native Migration einer vollständigen Toolbar/Sidebar bleibt eine eigenständige
Architekturarbeit.

| # | macOS-Funktion | Umsetzung / Hinweis |
|---|---|---|
| 1 | Menüleisten-Timer | `tray-icon` zeigt laufende Dauer + Status; Menü mit Start/Pause/Stopp/Nachtrag |
| 2 | globale Tastenkürzel | System-weite Shortcuts für Start/Pause/Stopp, auch bei nicht-fokussierter App |
| 3 | Autostart (optional) | Login-Item über Tauri-Autostart-Plugin, standardmäßig aus |
| 4 | lokale Benachrichtigungen | Native Notifications für Erinnerungen (siehe [Zeiterfassung](03-zeiterfassung.md)) |
| 5 | Offline-Modus | Volle Funktion ohne Netz; Änderungen erzeugen `sync_pending`-Events |
| 6 | lokaler Datenmodus | Reiner lokaler Betrieb ohne Server, SQLite-Datenbank |
| 7 | Server-Verbindungsmodus | Optionale Verbindung zum selbst-gehosteten Server (Hybrid-Sync) |
| 8 | Sync-Status in Menüleiste | `tray-icon`-Symbol spiegelt Verbindung/`sync_pending`/`conflict` |
| 9 | laufender Timer bei geschlossenem Fenster | Timer läuft im Hintergrundprozess weiter, Fenster schließbar |
| 10 | Schnellstart aus Menüleiste | Favoriten/letzte Projekte direkt aus dem Tray-Menü starten |
| 11 | Pause aus Menüleiste | Ein-Klick-Pause ohne Fenster zu öffnen |
| 12 | Stoppen mit Beschreibungsdialog | Stopp aus Tray öffnet den Pflicht-Stopp-Dialog (siehe [Zeiterfassung](03-zeiterfassung.md)) |
| 13 | Nachtrag aus Menüleiste | Schnellnachtrag direkt aus dem Tray |
| 14 | lokale Backups | Automatische + manuelle SQLite-Backups; siehe [Qualität](12-qualitaet.md) |
| 15 | verschlüsselte lokale Datenbank (optional) | SQLCipher optional; siehe [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md) |
| 16 | Crash-sichere Wiederherstellung | Timer-Zustand persistent; Wiederherstellung nach Absturz/Neustart |
| 17 | Code Signing vorbereiten | Apple Developer Account (99 $/J), Notarisierung; Signaturkette vorbereitet |

**macOS App-Sperre:** Face ID / Touch ID ist nur eingeschränkt möglich — das Tauri-Biometric-Plugin unterstützt **nur iOS/Android**, nicht macOS. Die App-Sperre auf macOS wird daher über einen eigenen Rust-Command mit `LocalAuthentication` (Touch ID) oder alternativ ein App-Passwort umgesetzt. Details in [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md).

## 6. Desktop-App Windows (SPEC §27 — alle 8 Funktionen)

Windows wird von derselben Tauri-Codebasis bedient; statt Menüleiste kommt der System-Tray zum Einsatz.
Die Informationshierarchie, konzentrischen Radien, System/Hell/Dunkel-Tokens,
Funktionsmaterialien und Motion-Semantik entsprechen Tarlog Flow. Windows nutzt
dabei keine Apple-Binärassets oder vorgetäuschten macOS-Chrome, sondern freie
Icons, Windows-Systemschrift und WebView-/Windows-gerechte Material-Fallbacks.

| # | Windows-Funktion | Umsetzung / Hinweis |
|---|---|---|
| 1 | System-Tray-Timer | `tray-icon` im Windows-System-Tray mit laufender Dauer und Steuermenü |
| 2 | globale Tastenkürzel | System-weite Shortcuts für Start/Pause/Stopp |
| 3 | Benachrichtigungen | Native Windows-Notifications für Erinnerungen |
| 4 | Autostart (optional) | Autostart-Eintrag, standardmäßig aus |
| 5 | Offline-Modus | Volle Offline-Funktion, `sync_pending`-Events |
| 6 | lokaler Datenmodus | SQLite lokal, kein Server nötig |
| 7 | Server-Verbindungsmodus | Optionale Server-Synchronisierung (Hybrid) |
| 8 | Sync-Status | Tray-Symbol spiegelt Sync-Zustand und Konflikte |

Crash-sichere Wiederherstellung und lokale Backups gelten plattformübergreifend identisch zur macOS-Variante (gemeinsamer Tauri-Kern).

## 7. iOS-App (SPEC §28 — alle 19 Funktionen)

Die iOS-App wird mit **Expo / React Native** gebaut (siehe [Architektur](05-architektur.md)). Local-first-Persistenz erfolgt über **`expo-sqlite`**; die App arbeitet offline und synchronisiert bei Serververbindung. Sie teilt das gemeinsame Core-Package (Zeitberechnung, Rundung, Compliance, Zod-Schemas) mit Web und Desktop.

| # | iOS-Funktion | Umsetzung / Hinweis |
|---|---|---|
| 1 | Timer starten | Start erzeugt lokalen `time_entry`, Timer-State → `running` |
| 2 | Timer pausieren | State → `paused`, `active_pause_started_at` gesetzt |
| 3 | Timer fortsetzen | State → `running`, Pause auf `accumulated_pause_seconds` addiert |
| 4 | Timer stoppen | `actual_ended_at` gesetzt, State → `needs_description` bei Pflichtbeschreibung, Stopp-Dialog |
| 5 | laufenden Timer vom Server sehen | Live-Anzeige eines auf anderem Gerät gestarteten Timers über Sync-Kanal |
| 6 | Arbeitszeit nachtragen | Nachtragsassistent mobil (vergessener Start/Stopp), Quelle „manuell nachgetragen" |
| 7 | Projekt auswählen | Projektauswahl inkl. Suche, zuletzt verwendet zuerst |
| 8 | Aufgabe auswählen | Aufgabenauswahl, projektbezogene Vorschläge |
| 9 | Beschreibung erfassen | Beschreibungsfeld mit Vorlagen; Pflicht je Projektkonfiguration |
| 10 | Pausen erfassen | Ein oder mehrere `time_entry_breaks` pro Eintrag |
| 11 | heutige Übersicht | Tagesliste mit Nettozeit, Pausen, Tagesgesamtzeit |
| 12 | Wochenübersicht | Wochensummen und Compliance-Marker |
| 13 | unvollständige Einträge korrigieren | Entwürfe/lückenhafte Einträge vervollständigen |
| 14 | Sync-Status | Verbindungszustand, letzter Sync, `sync_pending`/`conflict` |
| 15 | Offline-Erfassung | Volle Erfassung ohne Netz, `expo-sqlite`-Persistenz |
| 16 | Face ID Sperre (optional) | App-Sperre via Biometrie (Tauri-Biometric-Äquivalent nativ auf iOS verfügbar) |
| 17 | lokale Erinnerung | Lokale Notifications (Timer starten/stoppen, Pause, Woche abschließen) |
| 18 | Widget (optional) | Home-Screen-Widget über natives Modul (WidgetKit, Config Plugin) |
| 19 | Siri Shortcut (optional) | Timer per Siri/App Intents starten/stoppen (native Integration) |

**Optionale native Erweiterungen** (Config-Plugin-basiert, in V1 optional): **Widget** (WidgetKit) mit laufendem Timer, **Live Activity** (ActivityKit) für den aktiven Timer auf dem Sperrbildschirm/in der Dynamic Island, und **Siri Shortcuts** (App Intents) für Sprachsteuerung. Diese sind bewusst optional, weil sie native Module und einen Custom-Dev-Client erfordern; der Kernfunktionsumfang läuft ohne sie.

## 8. Erinnerungen

Die Erinnerungen (Timer starten/stoppen, Pause, Beschreibung ergänzen, Woche abschließen, `6 Stunden` ohne Pause, `8 Stunden`/`10 Stunden` erreicht, Ruhezeit-Risiko, Nachtrag prüfen u. a.) sind plattformübergreifend definiert und in [Zeiterfassung](03-zeiterfassung.md) vollständig beschrieben. Die UI liefert sie als native lokale Benachrichtigungen (macOS/Windows/iOS) und als In-App-Hinweise im Dashboard (Element 11 Compliance-Warnungen, Element 9 unvollständige Einträge).

## 9. Plattformübergreifende UI-Konsistenz

Die drei Clients teilen dasselbe Informationsmodell und dieselben 15 Hauptbereiche, passen sich aber nativ an: Desktop nutzt eine materialisierte Seitennavigation plus Menüleisten-/Tray-Timer, Web dieselbe Hierarchie responsiv mit mobiler Navigation (optional PWA), iOS eine Tab-Bar mit Mehr-Menü und mobil optimierten Formularen. Der laufende Timer bleibt überall persistent sichtbar und erreichbar. Tarlog Flow verbindet die Clients über semantische Farben, Systemtypografie, tabulare Ziffern, klare Gruppierung und physische Rückmeldung. Liquid Glass bleibt auf jeder Plattform eine Funktionsschicht; Apple-Komponenten und SF Symbols bleiben macOS vorbehalten, während Web und Windows dieselbe Designlogik mit lizenzfreien und plattformgerechten Mitteln umsetzen.
