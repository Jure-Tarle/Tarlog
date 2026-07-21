# Zeiterfassung, Nachtragen, Pausen und Erinnerungen

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Kapitel beschreibt das Herzstück von Tarlog: die Live-Zeiterfassung, den Stopp-Dialog, das vollständige Nachtragen-Konzept (SPEC §7), das Pausenkonzept sowie die Erinnerungen. Die Zeiterfassung muss extrem zuverlässig sein, ein verlorener Timer-Zustand oder eine falsch berechnete Dauer untergräbt das gesamte Produkt. Deshalb gilt durchgängig: die tatsächliche Arbeitszeit wird sekundengenau gespeichert (`actual_duration_seconds`), die Anzeige erfolgt gerundet auf Minuten, und die Abrechnungszeit (`billing_duration_seconds`) wird separat berechnet. Die Rundungs- und Berechnungsdetails stehen in [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md), die Zustandssynchronisierung über Geräte in [Synchronisierung](04-sync.md), das Datenmodell der Einträge in [Datenmodell](06-datenmodell.md) und die Prüfregeln in [Compliance](08-compliance.md).

## 1. Timer-Grundmodell und Zustände

Pro `main_account` läuft in Version 1 standardmäßig genau ein aktiver Timer. Die Durchsetzung dieser Single-Timer-Regel (partieller `UNIQUE`-Index, atomares Compare-and-Set über `server_revision`) ist in [Synchronisierung](04-sync.md) beschrieben. Multi-Timer für parallele Projekte ist architektonisch vorbereitet, aber in V1 bewusst gesperrt.

Der Timer kennt die Zustände `idle`, `running`, `paused`, `stopped`, `needs_description`, `sync_pending` und `conflict`. Die vollständige State-Machine mit allen 17 Timer-State-Feldern liegt in [Synchronisierung](04-sync.md). Für die Zeiterfassung relevant: Beim Stoppen wechselt ein Timer nach `needs_description`, wenn die Projektkonfiguration eine Pflichtbeschreibung verlangt; erst nach Erfassung der Beschreibung wird der Eintrag `stopped` und abschließbar.

## 2. Timer-Funktionen (SPEC §8, alle 38 Funktionen)

Die folgende Tabelle listet alle 38 geforderten Timer-Funktionen mit Verhalten und Bezug.

| # | Funktion | Verhalten / Hinweis |
|---|---|---|
| 1 | Timer starten | Erzeugt `time_entry` mit `actual_started_at` (UTC epoch-ms) und `timezone` (IANA); Timer-State → `running`. |
| 2 | Timer pausieren | State → `paused`; `active_pause_started_at` gesetzt; laufende Pause zählt nicht zur Nettozeit. |
| 3 | Timer fortsetzen | State → `running`; abgeschlossene Pause auf `accumulated_pause_seconds` addiert. |
| 4 | Timer stoppen | Setzt `actual_ended_at`; öffnet Stopp-Dialog (siehe Abschnitt 4). |
| 5 | Pausen manuell hinzufügen | Nutzer trägt Pausenblock mit Start/Ende in `time_entry_breaks` ein. |
| 6 | Pausen automatisch als Pausenstatus erfassen | Klick auf „Pause" erzeugt implizit einen `break`-Block über die Pausendauer. |
| 7 | mehrere Pausen pro Eintrag | Beliebig viele `time_entry_breaks`-Zeilen pro `time_entry` (siehe Abschnitt 6). |
| 8 | Projekt während laufendem Timer wechseln | `project_id` änderbar; Audit-Log-Eintrag „Projekt geändert". |
| 9 | Aufgabe während laufendem Timer wechseln | `task_id` änderbar; Audit-Log-Eintrag „Aufgabe geändert". |
| 10 | Tags während laufendem Timer ändern | `time_entry_tags` live editierbar. |
| 11 | Beschreibung während laufendem Timer vorbereiten | Beschreibungsfeld schon während `running` befüllbar (Entwurf). |
| 12 | Timer ohne Projekt starten (optional) | Erlaubt, sofern kein Projekt Pflicht ist; Eintrag später zuordenbar. |
| 13 | Timer ohne Beschreibung starten | Immer erlaubt; Beschreibungspflicht greift erst beim Stoppen. |
| 14 | Beschreibung beim Stoppen verlangen | Pflichtbeschreibung beim Stoppen (siehe Projektkonfiguration Abschnitt 5). |
| 15 | Eintrag als Entwurf speichern | Zustand „Entwurf", Eintrag unvollständig, blockiert Abrechnung. |
| 16 | Eintrag nachträglich vervollständigen | Entwürfe erscheinen in „unvollständige Einträge" und in [Reports](10-abrechnung-export.md). |
| 17 | Zeiteintrag duplizieren | Kopiert Projekt/Aufgabe/Tags/Beschreibung; neue Zeiten leer. |
| 18 | alten Eintrag fortsetzen | Startet neuen Timer mit Kontext eines früheren Eintrags. |
| 19 | Favoriten-Timer starten | Vordefinierte Vorlage (Projekt+Aufgabe+Beschreibungsvorlage) als Ein-Klick-Start. |
| 20 | Schnellstart aus letzten Einträgen | Liste der zuletzt gestoppten Einträge als Startquelle. |
| 21 | Schnellstart aus Projektliste | Start direkt aus der Projektübersicht. |
| 22 | Tastenkürzel | Globale und in-App-Shortcuts für Start/Pause/Stopp/Nachtrag. |
| 23 | Menüleisten-Steuerung auf macOS | Start/Pause/Stopp/Nachtrag aus der macOS-Menüleiste (siehe [UI und Apps](11-ui-apps.md)). |
| 24 | System-Tray-Steuerung auf Windows | Gleiche Steuerung über das Windows System Tray. |
| 25 | iOS-Schnellaktion | Home-Screen-Schnellaktion für Timer-Start. |
| 26 | Widget (optional) | Live-Timer-Widget; optional, V2-Politur. |
| 27 | Offline-Timer | Timer läuft ohne Serververbindung vollständig lokal. |
| 28 | Sync nach Wiederverbindung | Offline erzeugte Events werden bei Verbindung hochgeladen (siehe [Synchronisierung](04-sync.md)). |
| 29 | Timer-Wiederherstellung nach App-Absturz | Laufender Timer wird aus lokaler DB rekonstruiert (crash-sichere Persistenz). |
| 30 | Timer-Wiederherstellung nach Neustart | Persistierter Timer-State überlebt Geräteneustart. |
| 31 | Tagesgrenze erkennen | System erkennt Einträge, die eine Kalendertagesgrenze überschreiten. |
| 32 | über Mitternacht laufende Einträge markieren | Solche Einträge werden markiert; optionaler Split in [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md). |
| 33 | Zeitzone speichern | `timezone` (IANA) pro Eintrag persistiert; wichtig für DST. |
| 34 | tatsächliche Zeit sekundengenau speichern | `actual_duration_seconds` bleibt sekundengenau und wird nie durch Rundung überschrieben. |
| 35 | Anzeige gerundet auf Minuten | UI zeigt Minutenwerte; interner Wert bleibt sekundengenau. |
| 36 | Abrechnung separat berechnen | `billing_duration_seconds` getrennt von `actual_duration_seconds`. |
| 37 | Audit-Log für kritische Änderungen | Start/Pause/Fortsetzen/Stopp/Korrektur → Audit-Log (siehe [Datenmodell](06-datenmodell.md)). |
| 38 | Pflichtbeschreibung beim Stoppen | Projektabhängig erzwungen über Zustand `needs_description`. |

## 3. Start-, Pause- und Stopp-Fluss

- **Start**: `time_entry` angelegt, `actual_started_at` gesetzt, Timer-State → `running`. Die Startzeit wird lokal gespeichert und beim späteren Sync um Server-Empfangszeit ergänzt (Uhr-Vertrauen, siehe [Synchronisierung](04-sync.md)).
- **Pause**: State → `paused`, `active_pause_started_at` gesetzt. Pausenzeit zählt nicht zur Nettoarbeitszeit.
- **Fortsetzen**: State → `running`; die gerade beendete Pause wird als abgeschlossener Block auf `accumulated_pause_seconds` und in `time_entry_breaks` verbucht.
- **Stopp**: `actual_ended_at` gesetzt. Ist eine Pflichtbeschreibung konfiguriert und fehlt sie, geht der Timer in `needs_description` und der Stopp-Dialog erzwingt die Eingabe.

## 4. Stopp-Dialog (alle 22 Elemente)

Beim Stoppen erscheint verpflichtend ein Dialog. Er trennt inhaltliche Dokumentation, Zuordnung, Abrechnung und Zeitkorrektur. Alle 22 geforderten Elemente:

| # | Element | Zweck |
|---|---|---|
| 1 | Was wurde gemacht? | Pflicht-Kurzbeschreibung der Tätigkeit. |
| 2 | kurze Zusammenfassung | Ein-Zeilen-Zusammenfassung für Reports/Rechnungsanlage. |
| 3 | ausführliche Beschreibung (optional) | Detailtext, kundensichtbar oder intern steuerbar. |
| 4 | Ergebnis oder Deliverable (optional) | Was konkret entstanden ist. |
| 5 | Blocker (optional) | Hindernisse, die die Arbeit betrafen. |
| 6 | nächster Schritt (optional) | Geplante Fortsetzung. |
| 7 | Projekt | Zuordnung `project_id` (korrigierbar). |
| 8 | Aufgabe | Zuordnung `task_id`. |
| 9 | Tags | `time_entry_tags`. |
| 10 | abrechenbar ja oder nein | `billable`-Flag des Eintrags. |
| 11 | Kunde sichtbar ja oder nein | Steuert Sichtbarkeit im Kundenreport. |
| 12 | interne Notiz | Nie kundensichtbar. |
| 13 | Pause bestätigen | Erfasste Pausen prüfen/korrigieren. |
| 14 | Startzeit korrigieren | `actual_started_at` anpassbar. |
| 15 | Endzeit korrigieren | `actual_ended_at` anpassbar. |
| 16 | Grund für Korrektur | Pflicht bei Änderung von Start/Ende; landet im Audit-Log. |
| 17 | Rundungsvorschau | Zeigt gerundete Abrechnungszeit vor dem Speichern (siehe [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md)). |
| 18 | Abrechnungsbetrag | Vorschau `billing_amount_snapshot` auf Basis Satz-Snapshot. |
| 19 | Compliance-Warnungen | Pausen-/Höchstzeit-/Ruhezeit-Hinweise (siehe [Compliance](08-compliance.md)). |
| 20 | Speichern | Schließt Eintrag ab (Timer → `stopped`). |
| 21 | als Entwurf speichern | Unvollständiger Eintrag, später zu vervollständigen. |
| 22 | verwerfen nur mit Bestätigung | Verwerfen erfordert explizite Rückfrage; nie stiller Datenverlust. |

## 5. Projektweise Stopp-Konfiguration (7 Konfigurationen)

Jedes Projekt (siehe [Abrechnung und Export](10-abrechnung-export.md)) steuert das Verhalten des Stopp-Dialogs:

| # | Konfiguration | Wirkung |
|---|---|---|
| 1 | Beschreibung immer Pflicht | Timer → `needs_description`, bis Beschreibung erfasst ist. |
| 2 | Beschreibung nur bei abrechenbarer Zeit Pflicht | Pflicht greift nur, wenn `billable = true`. |
| 3 | Mindestlänge der Beschreibung | Speichern erst ab konfigurierter Zeichenzahl. |
| 4 | interne Notiz optional | Steuert, ob interne Notiz angeboten wird. |
| 5 | Kunde sichtbare Beschreibung Pflicht | Erzwingt eine für den Kunden freigegebene Beschreibung. |
| 6 | Nachtragsgrund Pflicht | Bei nachgetragenen Einträgen ist ein `reason` verpflichtend. |
| 7 | Bearbeitungsgrund Pflicht nach X Tagen | Nach `maximale rückwirkende Bearbeitung in Tagen` erfordert jede Änderung eine Begründung. |

## 6. Pausenkonzept

Pausen sind eigenständige Datensätze (`time_entry_breaks`) und keine bloße Zeitdifferenz, damit sie einzeln dokumentiert, geprüft und abgerechnet werden können.

- **Mehrere Pausen pro Eintrag**: Ein `time_entry` kann beliebig viele `time_entry_breaks` haben, jeweils mit Start, Ende und Dauer.
- **Manuelle Pause**: Der Nutzer trägt einen Pausenblock nachträglich oder vorab ein.
- **Automatischer Pausenstatus**: Ein Klick auf „Pause" versetzt den Timer in `paused` und erzeugt beim Fortsetzen automatisch einen abgeschlossenen Pausenblock; die Zeit fließt in `break_duration_seconds` und wird von der Bruttozeit abgezogen (Netto = Brutto − Pausen).
- **Mindestblock**: Für die deutsche Arbeitszeitprüfung zählen nur Pausenblöcke von mindestens `15 Minuten` als echte Ruhepause. Der Dialog weist darauf hin, wenn ein Block kürzer ist; die verbindliche Prüfung (`30 Minuten` bei mehr als 6 Stunden, `45 Minuten` bei mehr als 9 Stunden) erfolgt in [Compliance](08-compliance.md).
- **Trennung actual vs. billing**: Pausen reduzieren die Nettoarbeitszeit (`net_work_duration_seconds`); die Rundung auf die Abrechnungszeit erfolgt erst danach (siehe [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md)).

## 7. Nachtragen von Arbeitszeiten (SPEC §7 vollständig)

Das Nachtragen ist ein zentrales Feature, keine Nebensache. Jeder Nachtrag wird als Quelle „manuell nachgetragen" markiert, erzeugt einen Audit-Log-Eintrag und wird in Reports und PDF-Nachweisen als Nachtrag ausgewiesen.

### 7.1 Nachtrag erstellen, Pflichtfelder je nach Konfiguration (14 Felder)

| # | Feld | Hinweis |
|---|---|---|
| 1 | Datum | Kalendertag des Nachtrags. |
| 2 | Startzeit | Ergibt `actual_started_at`. |
| 3 | Endzeit | Ergibt `actual_ended_at`. |
| 4 | Projekt | Zuordnung `project_id`. |
| 5 | Aufgabe (optional) | `task_id`, sofern das Projekt es nicht erzwingt. |
| 6 | Tätigkeitsbeschreibung | Pflichttext je nach Projektkonfiguration. |
| 7 | Pausenzeit | Fließt in `break_duration_seconds`. |
| 8 | abrechenbar ja oder nein | `billable`-Flag. |
| 9 | Grund für Nachtrag | Aus der Liste 7.2 oder Freitext. |
| 10 | Tags (optional) | `time_entry_tags`. |
| 11 | Kunde sichtbar ja oder nein | Kundensichtbarkeit. |
| 12 | interne Notiz (optional) | Nie kundensichtbar. |
| 13 | Begründung für spätere Erfassung (optional) | Zusatzkontext, warum verspätet erfasst. |
| 14 | Quelle des Eintrags, manuell nachgetragen | Wird fest als Nachtragsquelle gesetzt. |

### 7.2 Nachtragsgründe (11 vordefinierte Gründe)

1. Timer vergessen zu starten
2. Timer vergessen zu stoppen
3. Arbeit offline durchgeführt
4. Meeting nachgetragen
5. Telefonat nachgetragen
6. Reisezeit nachgetragen
7. Kundenarbeit nachgetragen
8. interne Arbeit nachgetragen
9. Kalendertermin übernommen
10. Korrektur eines falschen Eintrags
11. sonstiger Grund

### 7.3 Nachtragsassistent (13 Hilfen)

Der intelligente Assistent unterstützt aktiv beim Rekonstruieren vergessener Zeiten:

| # | Hilfe | Beschreibung |
|---|---|---|
| 1 | Lücken im Arbeitstag erkennen | Findet unerfasste Zeitfenster zwischen bestehenden Einträgen. |
| 2 | Kalendertermine vorschlagen | Bietet importierte Kalendertermine als Eintragsvorlage an (optional). |
| 3 | zuletzt genutzte Projekte vorschlagen | Priorisiert kürzlich verwendete Projekte. |
| 4 | typische Aufgaben vorschlagen | Schlägt häufige Aufgaben zum Projekt vor. |
| 5 | ähnliche vergangene Beschreibungen vorschlagen | Autovervollständigung aus früheren Beschreibungen. |
| 6 | Start und Endzeit plausibilisieren | Prüft, ob Zeiten sinnvoll und widerspruchsfrei sind. |
| 7 | Pausen vorschlagen | Empfiehlt Pausen, wenn die Dauer Pausenregeln berührt. |
| 8 | Überschneidungen erkennen | Warnt bei Zeitüberlappung mit anderen Einträgen. |
| 9 | doppelte Einträge erkennen | Erkennt potenzielle Dubletten. |
| 10 | Compliance-Warnungen anzeigen | Zeigt Pausen-/Höchstzeit-/Ruhezeit-Risiken (siehe [Compliance](08-compliance.md)). |
| 11 | abrechenbare Dauer berechnen | Vorschau der gerundeten `billing_duration_seconds`. |
| 12 | PDF-Nachweis markieren als nachgetragen | Kennzeichnet den Eintrag im Export als Nachtrag. |
| 13 | Audit-Log erzeugen | Protokolliert die nachträgliche Erfassung. |

### 7.4 Nachtragen aus Kalenderansicht (8 Funktionen)

In der Wochenansicht markiert der Nutzer freie Zeitblöcke und erzeugt daraus einen Eintrag:

1. Zeitblock per Maus ziehen
2. Projekt auswählen
3. Aufgabe auswählen
4. Beschreibung eintragen
5. Pause eintragen
6. Rundungsvorschau anzeigen
7. Compliance-Ergebnis anzeigen
8. speichern

Die Kalender-/Timesheet-Interaktion (Drag-and-Drop, Verschieben, Verlängern) ist in [UI und Apps](11-ui-apps.md) beschrieben.

### 7.5 Nachtragen aus Tagesübersicht (10 Elemente)

Die Tagesübersicht macht Lücken sichtbar und bietet direkte Nachtrag-Aktionen:

1. alle erfassten Zeiten
2. Lücken zwischen Einträgen
3. mögliche vergessene Arbeit
4. Pausen
5. Überlappungen
6. Tagesgesamtzeit
7. Compliance-Status
8. Button „Arbeitszeit nachtragen"
9. Button „Lücke als Arbeit erfassen"
10. Button „Pause einfügen"

### 7.6 Timer vergessen zu stoppen (11 Funktionen)

Läuft ein Timer ungewöhnlich lange, hilft das System aktiv beim Korrigieren:

| # | Funktion | Verhalten |
|---|---|---|
| 1 | Warnung nach konfigurierbarer Dauer | Schwelle je Konfiguration einstellbar. |
| 2 | Standard-Warnung nach 4 Stunden ohne Aktivität (optional) | Voreinstellung, deaktivierbar. |
| 3 | Warnung nach Tagesende | Warnt, wenn der Timer über das Tagesende läuft. |
| 4 | Warnung bei Timer über Mitternacht | Markiert über Mitternacht laufende Einträge. |
| 5 | Dialog beim nächsten Öffnen | Beim erneuten Öffnen der App erscheint der Korrekturdialog. |
| 6 | Frage, wann die Arbeit tatsächlich beendet wurde | Nutzer setzt die reale Endzeit. |
| 7 | Pause nachtragen | Fehlende Pausen ergänzen. |
| 8 | Beschreibung nachtragen | Tätigkeitsbeschreibung ergänzen. |
| 9 | Grund erfassen | Nachtragsgrund „Timer vergessen zu stoppen". |
| 10 | tatsächliche Dauer korrigieren | `actual_ended_at`/Dauer anpassen. |
| 11 | Audit-Log speichern | Korrektur wird protokolliert. |

### 7.7 Timer vergessen zu starten (8 Felder)

Trägt der Nutzer eine vergessene Arbeitszeit nach, ist der Dialog speziell auf den vergessenen Start optimiert und stellt die Fragen in natürlicher Sprache:

1. Wann hast du angefangen?
2. Wann hast du aufgehört?
3. Hast du Pausen gemacht?
4. Was hast du gemacht?
5. Für welches Projekt?
6. Ist das abrechenbar?
7. Warum wurde der Timer nicht live gestartet?
8. Soll ein ähnlicher Eintrag als Vorlage gespeichert werden?

## 8. Erinnerungen (SPEC §22, alle 15)

Erinnerungen sind lokale Benachrichtigungen (Desktop-Notifications, iOS local reminders) und stützen sich auf die Compliance-Schwellen aus [Compliance](08-compliance.md). Sie sind konfigurierbar und im Standard datenschutzfreundlich (keine externe Zustellung).

| # | Erinnerung | Auslöser |
|---|---|---|
| 1 | Timer starten | Arbeitsbeginn ohne laufenden Timer erkannt. |
| 2 | Timer stoppen | Arbeitsende naht, Timer läuft noch. |
| 3 | Pause machen | Längere Arbeit ohne erfasste Pause. |
| 4 | Beschreibung ergänzen | Eintrag ohne Pflichtbeschreibung offen. |
| 5 | Woche abschließen | Wochenende / Wochenabschluss steht an. |
| 6 | nicht abgerechnete Zeiten prüfen | Offene abrechenbare Zeit vorhanden. |
| 7 | laufender Timer ungewöhnlich lang | Über konfigurierter Dauer (vgl. 7.6). |
| 8 | Timer über Mitternacht | Eintrag überschreitet Mitternacht. |
| 9 | tägliche Arbeitszeit erreicht | Tagesziel erreicht. |
| 10 | 6 Stunden ohne Pause | Pausenpflicht-Schwelle (mehr als 6 Stunden). |
| 11 | 8 Stunden Arbeitszeit erreicht | Nähe zur regulären `8 Stunden`-Grenze. |
| 12 | 10 Stunden Arbeitszeit erreicht | Warnung an der `10 Stunden`-Höchstgrenze. |
| 13 | Ruhezeit-Risiko | Weniger als `11 Stunden` Ruhezeit bis zum nächsten Start absehbar. |
| 14 | Nachtrag prüfen | Erkannte Lücke, die nachgetragen werden sollte. |
| 15 | unvollständige Einträge vervollständigen | Entwürfe / fehlende Pflichtfelder offen. |

## 9. Zusammenspiel und Verweise

- **Audit**: Timer gestartet/pausiert/fortgesetzt/gestoppt, Nachtrag, Start-/Endzeit-Korrektur, Pausen-, Beschreibungs-, Abrechenbarkeits-, Projekt- und Aufgabenänderung werden protokolliert, Eventliste und Felder in [Datenmodell](06-datenmodell.md).
- **Sync**: Jede Timer-Aktion erzeugt ein Sync-Event; die Zustände `sync_pending` und `conflict` sowie die geräteübergreifende Live-Anzeige sind in [Synchronisierung](04-sync.md) beschrieben.
- **Berechnung**: Netto-, Rundungs- und Abrechnungslogik samt getrennter Speicherung von `actual_duration_seconds` und `billing_duration_seconds` in [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md).
- **Prüfung**: Pausen-, Höchstzeit- und Ruhezeitregeln (`30 Minuten`, `45 Minuten`, `15 Minuten`, `8 Stunden`, `10 Stunden`, `11 Stunden`) in [Compliance](08-compliance.md).
