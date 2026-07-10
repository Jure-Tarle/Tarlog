# Qualität — Backup, Testplan, Roadmap, Risiken, Implementierungsschritte, Qualitätsanspruch

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Diese Datei bündelt die Qualitätssicherung des Project Time Ledger: das Backup- und Restore-Konzept, den vollständigen Testplan über alle 36 Testfälle, die Rückverfolgbarkeit aller 32 V1-Akzeptanzkriterien auf Feature und Dokumentationsdatei, die Roadmap der sechs Phasen, die Produkt- und Projektrisiken mit Mitigation, die geordnete Liste der ersten konkreten Implementierungsschritte sowie den Qualitätsanspruch. Sie deckt SPEC §30, §34, §35, §36 und §39 ab.

Querverweise: [Datenmodell](06-datenmodell.md), [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md), [Compliance](08-compliance.md), [Sync](04-sync.md), [Architektur](05-architektur.md), [Abrechnung & Export](10-abrechnung-export.md), [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md).

---

## 1. Backup- und Restore-Konzept (SPEC §30)

Backups sind kein Add-on, sondern Voraussetzung für eine revisionsfähige, DSGVO-freundliche Zeiterfassung. Da im lokalen Desktop-Modus keine Cloud existiert, liegt die Datensicherheit vollständig beim Nutzer — das Produkt muss ihn dabei aktiv unterstützen. Alle 10 geforderten Backup-Funktionen aus SPEC §30:

| Nr. | Funktion | Umsetzung | Modus |
|---|---|---|---|
| 1 | manuelles lokales Backup | Menüaktion „Backup jetzt erstellen" → konsistente Kopie der SQLite-Datei via Online-Backup-API (`VACUUM INTO 'backup.db'`), Zeitstempel im Dateinamen | Desktop |
| 2 | automatisches lokales Backup | Hintergrundjob (Tauri-Command im Rust-Backend) rotiert täglich; konfigurierbares Intervall + Aufbewahrungszahl (z. B. 7 tägliche, 4 wöchentliche) | Desktop |
| 3 | verschlüsseltes Backup optional | Backup-Datei mit Passphrase (Argon2id-abgeleiteter Schlüssel, AES-256-GCM) verschlüsseln; bei SQLCipher-Datenbank bleibt die Kopie ohnehin verschlüsselt | Desktop |
| 4 | Server Backup Anleitung | Dokumentierter Ablauf mit `pg_dump`/`pg_restore` im Docker-Compose-Setup; Cron-Beispiel + Off-Site-Kopie-Empfehlung | Server |
| 5 | PostgreSQL Backup | `pg_dump --format=custom` liefert konsistenten Snapshot ohne DB-Stopp; Restore via `pg_restore`; alternativ physisches `pg_basebackup` für PITR | Server |
| 6 | SQLite Backup | Online-Backup-API bzw. `VACUUM INTO` erzeugt eine konsistente Kopie auch bei geöffneter DB (kein bloßes Dateikopieren bei aktiven WAL-Transaktionen) | Desktop |
| 7 | Backup Wiederherstellung | Restore-Assistent: Backup wählen → Integritätsprüfung → Vorschau (Datensatzanzahl, letzter Eintrag) → bestätigen; aktuelle DB wird vorher selbst gesichert (Sicherheitsnetz) | Desktop + Server |
| 8 | Backup Integritätsprüfung | SQLite: `PRAGMA integrity_check` (+ `PRAGMA foreign_key_check`); PostgreSQL: Restore in Wegwerf-Schema + Konsistenzabfragen; kein Restore ohne bestandene Prüfung | Desktop + Server |
| 9 | Export aller Daten als JSON | Vollständiger DSGVO-tauglicher JSON-Export aller Entitäten (siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md), Art. 20 Portabilität); dient zugleich als menschenlesbares Not-Backup | Desktop + Server |
| 10 | Export aller PDFs als ZIP | Alle erzeugten Nachweise/Rechnungen/Anhänge als ZIP-Archiv, Verweise auf `export_files` in [Datenmodell](06-datenmodell.md) | Desktop + Server |

### 1.1 Integritätsprüfung — konkrete Kommandos

- **SQLite (Desktop):** `PRAGMA integrity_check;` muss `ok` liefern; ergänzend `PRAGMA foreign_key_check;` (leeres Ergebnis) und ein Testlauf gegen `sync_events`/`audit_logs` (keine Lücken in Revisionsketten). `PRAGMA integrity_check` läuft vor jedem Restore und nach jedem automatischen Backup; ein Fehlschlag markiert das Backup als unbrauchbar und alarmiert den Nutzer.
- **PostgreSQL (Server):** `pg_dump` erzeugt den Snapshot, ein Probe-`pg_restore` in ein isoliertes Schema verifiziert die Wiederherstellbarkeit. Der Health-Check-Endpunkt (siehe [Architektur](05-architektur.md)) meldet Alter und Ergebnis des letzten Backups.

### 1.2 Restore-Garantien

Restore ist niemals destruktiv ohne Sicherheitsnetz: Die aktuelle Datenbank wird vor dem Zurückspielen automatisch als Pre-Restore-Snapshot gesichert. Jeder Restore erzeugt einen `audit_logs`-Eintrag (`action = 'restore'`) mit Quelle und Prüfsumme des Backups. Beschädigte lokale Datenbanken durchlaufen zuerst die Reparaturfunktion (`.recover`-Äquivalent), erst dann den Restore.

---

## 2. Testplan (SPEC §34)

Alle 36 Testfälle aus SPEC §34, jeweils mit Ebene (unit / integration / e2e) und erwartetem Ergebnis. Die Kernlogik (Timer, Pausen, Rundung, Compliance, Abrechnung) liegt als reine Funktionen im `packages/core` und ist deterministisch als Unit-Test prüfbar; Persistenz und Sync als Integration; Cross-Device-Flows als e2e. Testfälle 9–11 (Rundung 70 → 75 Minuten, `actual_duration_seconds` bleibt unverändert) sind die Regressionsanker der Rundungsengine und werden zuerst implementiert (siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md)).

| Nr. | Testfall | Ebene | Erwartetes Ergebnis |
|---|---|---|---|
| 1 | Timer starten | integration | `timer_states.status` wechselt `idle` → `running`; `started_at` gesetzt; genau ein aktiver Timer pro `main_account` (UNIQUE-Index greift) |
| 2 | Timer pausieren | integration | `status` `running` → `paused`; `active_pause_started_at` gesetzt; laufende Nettozeit friert ein |
| 3 | Timer fortsetzen | integration | `status` `paused` → `running`; `accumulated_pause_seconds` um Pausendauer erhöht; `active_pause_started_at` geleert |
| 4 | Timer stoppen | integration | `status` → `stopped`; Stop-Dialog erzwingt Pflichtbeschreibung (`needs_description` bis erfüllt); `time_entry` finalisiert |
| 5 | Arbeitszeit nachtragen | integration | manueller Eintrag mit `source = 'manual_backdated'`, Nachtragsgrund gesetzt; `audit_logs`-Eintrag erzeugt |
| 6 | Timer vergessen zu stoppen | unit | Warnlogik nach konfigurierbarer Dauer (Standard 4 Stunden) und über Mitternacht schlägt an; Korrekturdialog liefert plausible Enddauer |
| 7 | Timer vergessen zu starten | unit | Nachtragsdialog „vergessener Start" berechnet Dauer aus Anfang/Ende, markiert Eintrag als nachgetragen |
| 8 | Pausenberechnung | unit | `net_work_duration_seconds = actual_duration_seconds − break_duration_seconds`; mehrere Pausen korrekt summiert |
| 9 | Rundung auf 15 Minuten | unit | Intervall `15 Minuten`, Modus „je angefangenes Intervall / aufrunden": netto 70 Minuten → `billing_duration_seconds = 4500` (75 Minuten) |
| 10 | 70 Minuten werden zu 75 Minuten Abrechnungszeit | unit | Eingabe netto 70 Minuten → Abrechnung 75 Minuten; `rounding_delta_seconds = +300`; entspricht „1 Stunde 10 Minuten → 1 Stunde 15 Minuten" |
| 11 | tatsächliche Zeit bleibt unverändert | unit | `actual_duration_seconds` bleibt exakt 4200 (70 Minuten), unabhängig von der Rundung; Nachweis zeigt beide Werte getrennt |
| 12 | über Mitternacht | unit | Eintrag mit Start 23:30 und Ende 00:45 wird korrekt als 75 Minuten berechnet und als „über Mitternacht" markiert; optionaler Tages-Split |
| 13 | Sommerzeit | unit | DST-Übergang (Frühjahr, Uhr springt +1 h) verkürzt Wanduhr-Differenz nicht die Nettozeit — Berechnung über UTC-Epoch, nicht Lokalzeit |
| 14 | Winterzeit | unit | DST-Übergang (Herbst, Uhr springt −1 h) verlängert die reale Dauer korrekt; keine negative oder doppelte Stunde |
| 15 | Zeitzonen | unit | Eintrag mit `timezone` (IANA) wird korrekt umgerechnet; Anzeige lokal, Speicherung UTC; Reise über Zeitzonen verfälscht Dauer nicht |
| 16 | mehr als 6 Stunden ohne Pause | unit | Compliance DE meldet Verstoß: `>6 Stunden` → `30 Minuten` Pause fehlen; Ampel rot/gelb, Regelbezug ArbZG §4 |
| 17 | mehr als 9 Stunden mit zu wenig Pause | unit | Compliance DE meldet Verstoß: `>9 Stunden` → `45 Minuten` Pause erforderlich, dokumentierte Pause unzureichend |
| 18 | mehr als 10 Stunden Nettozeit | unit | Compliance DE erzeugt schweren Warnhinweis: über `10 Stunden` Nettozeit (ArbZG §3), rot |
| 19 | weniger als 11 Stunden Ruhezeit | unit | Compliance DE meldet Ruhezeitverstoß: Abstand zwischen zwei Arbeitstagen unter `11 Stunden` (ArbZG §5) |
| 20 | Rechnung aus Stunden | integration | Rechnung aus billable `time_entries`; Positionen mit `rate_snapshot`; Summe stimmt mit gerundeter Abrechnungszeit überein |
| 21 | Rechnung aus Tagessatz | integration | Tagessatzlogik (voller/halber Tag ab Schwellwert) erzeugt korrekte Positionen |
| 22 | Rechnung aus Festpreis | integration | Festpreisposition + Ist-Aufwand gegen Budget; Marge berechnet; Zusatzstunden separat |
| 23 | PDF Export | e2e | Arbeitszeit-PDF enthält alle geforderten Inhalte, eindeutige Exportnummer, tatsächliche und gerundete Zeit getrennt |
| 24 | CSV Export | integration | CSV-Spalten vollständig, korrekt escaped, UTF-8; Re-Import verlustfrei möglich |
| 25 | lokaler Modus | e2e | App voll funktionsfähig ohne Server/Internet: Timer, Projekte, Reports, Rechnung, Backup |
| 26 | Server Modus | e2e | Selbst-gehosteter Server (Docker Compose) startet, Setup-Wizard, Main-Account-Login, Health-Check grün |
| 27 | Offline Sync | integration | Offline erzeugte `sync_events` werden nach Reconnect hochgeladen; Server vergibt `server_revision`; Geräte konvergieren (LWW/HLC) |
| 28 | Konfliktlösung | integration | Erkannter Konflikt erzeugt `conflict_records`, Dialog zeigt lokale/Server-Version, keine stille Datenverluste, Audit-Eintrag |
| 29 | Desktop startet Timer, Browser sieht Timer | e2e | Desktop `running` → Live-Kanal (WebSocket) → Browser zeigt denselben laufenden Timer binnen Sekunden |
| 30 | Browser pausiert Timer, Desktop sieht Pause | e2e | Browser `paused` → Desktop übernimmt `paused`-Zustand live |
| 31 | iOS stoppt Timer, Server aktualisiert Eintrag | e2e | iOS `stopped` → Server finalisiert `time_entry` → alle Geräte zeigen gestoppt |
| 32 | Audit Log | integration | Jede kritische Änderung schreibt `audit_logs` mit `before_json`/`after_json`, `actor`, `reason`, Revisionen |
| 33 | Backup | integration | Backup erzeugt konsistente Kopie; `PRAGMA integrity_check` = `ok`; PostgreSQL `pg_dump` erfolgreich |
| 34 | Restore | integration | Restore aus Backup stellt Zustand exakt her; Pre-Restore-Snapshot angelegt; `audit_logs`-Eintrag `restore` |
| 35 | Import | integration | Import-Assistent (CSV/XLSX/JSON) mit Spaltenzuordnung, Duplikaterkennung, Testimport → finaler Import, Audit-Log |
| 36 | DSGVO Export | integration | Vollständiger JSON-Export aller personenbezogenen Daten (Art. 20), maschinenlesbar und wieder importierbar |

**Testinfrastruktur:** Unit- und Integrationstests mit Vitest im Monorepo; e2e für Web mit Playwright, Cross-Device-Sync über eine Test-Harness mit mehreren simulierten Geräten (jeweils eigene `device_id`). Golden-Master-Tests fixieren die PDF-Ausgabe. Die Rundungs- und Compliance-Kernfälle (9–19) laufen als schnelle Unit-Suite im CI-Gate; kein Merge ohne grüne Kernfälle. Tests werden nie abgeschwächt oder gelöscht, um einen Pass zu erzwingen.

---

## 3. Mapping — 32 V1-Akzeptanzkriterien (SPEC §35)

Alle 32 Akzeptanzkriterien für Version 1, jeweils auf das umsetzende Feature/die Architektur und die Dokumentationsdatei abgebildet. Diese Tabelle ist die Rückverfolgbarkeitsmatrix von Version 1.

| AC | Kriterium | Feature / Architektur | Datei |
|---|---|---|---|
| 1 | App lokal ohne Server verwenden | Lokaler Desktop-Modus, SQLite, keine Cloud-Pflicht | [02-produkt.md](02-produkt.md) |
| 2 | lokales Hauptprofil erstellen | Main-Account-Konzept, `main_accounts` / `local_profiles` | [02-produkt.md](02-produkt.md), [06-datenmodell.md](06-datenmodell.md) |
| 3 | Kunden erstellen | Kundenverwaltung, `customers` (25 Felder) | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 4 | Projekte erstellen | Projektverwaltung, `projects` (33 Felder) | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 5 | Aufgaben erstellen | Aufgaben/Tätigkeitsarten, `tasks` | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 6 | Stundensätze hinterlegen | `billing_rates`, historisiert, Snapshot bei Eintrag/Rechnung | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 7 | Tagessätze hinterlegen | `day_rate_rules` (voller/halber Tag) | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 8 | Festpreise hinterlegen | `fixed_fee_contracts`, Budget/Marge | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 9 | Timer starten | Timer-State-Machine `idle` → `running` | [03-zeiterfassung.md](03-zeiterfassung.md), [04-sync.md](04-sync.md) |
| 10 | Timer pausieren | `running` → `paused`, `accumulated_pause_seconds` | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 11 | Timer fortsetzen | `paused` → `running` | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 12 | Timer stoppen | `running`/`paused` → `stopped`, Finalisierung | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 13 | Beschreibung beim Stoppen | Stop-Dialog, `needs_description`, Pflichtbeschreibung | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 14 | Arbeitszeiten nachtragen | Nachtragsassistent, `source = 'manual_backdated'`, Nachtragsgrund | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 15 | vergessenen Timer-Start korrigieren | Dialog „vergessener Start" (§7.7) | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 16 | vergessenen Timer-Stopp korrigieren | Timer-vergessen-zu-stoppen-Logik (§7.6) | [03-zeiterfassung.md](03-zeiterfassung.md) |
| 17 | tatsächliche Zeit und Abrechnungszeit trennen | `actual_duration_seconds` vs. `billing_duration_seconds` | [07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md), [06-datenmodell.md](06-datenmodell.md) |
| 18 | Abrechnungszeit auf 15 Minuten aufrunden | Rundungsengine, Beispiel 70 → 75 Minuten | [07-zeitberechnung-rundung.md](07-zeitberechnung-rundung.md) |
| 19 | deutsche Pausenregeln prüfen | Compliance-DE-Profil, ArbZG §4 (`30 Minuten`/`45 Minuten`) | [08-compliance.md](08-compliance.md) |
| 20 | bei Compliance-Risiken warnen | Compliance-UI grün/gelb/rot, Handlungsempfehlung | [08-compliance.md](08-compliance.md) |
| 21 | PDF-Arbeitszeitnachweis exportieren | Export-Pipeline pdfmake, 38 PDF-Inhalte | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 22 | PDF-Rechnung exportieren | Rechnungsmodul, §14-UStG-Pflichtangaben | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 23 | CSV exportieren | CSV-Export, verlustfrei | [10-abrechnung-export.md](10-abrechnung-export.md) |
| 24 | Desktop App kann lokal arbeiten | Tauri-Desktop, lokale SQLite, Offline | [11-ui-apps.md](11-ui-apps.md) |
| 25 | Server-Modus selbst gehostet | Next.js + PostgreSQL + Docker Compose, Setup-Wizard | [05-architektur.md](05-architektur.md) |
| 26 | Desktop App verbindet sich mit Server | Hybrid-Modus, Sync-API, Device-Registrierung | [04-sync.md](04-sync.md) |
| 27 | Browser und Desktop sehen denselben laufenden Timer | Live-Kanal WebSocket, Timer-Singleton | [04-sync.md](04-sync.md) |
| 28 | iOS Architektur vorbereitet | Expo/React Native, `expo-sqlite`, Sync-API-kompatibel | [11-ui-apps.md](11-ui-apps.md) |
| 29 | Sync-Konflikte erkannt | Event-Log + LWW/HLC, `conflict_records`, 10 Konfliktfälle | [04-sync.md](04-sync.md) |
| 30 | Audit-Log protokolliert wichtige Änderungen | `audit_logs`, 25 Events, 15 Felder | [06-datenmodell.md](06-datenmodell.md) |
| 31 | Backups funktionieren | Backup/Restore, `PRAGMA integrity_check`, `pg_dump` | [12-qualitaet.md](12-qualitaet.md) (diese Datei) |
| 32 | Tests laufen | Testplan mit 36 Testfällen, CI-Gate | [12-qualitaet.md](12-qualitaet.md) (diese Datei) |

---

## 4. Roadmap (SPEC §36)

Die Roadmap folgt dem local-first-Prinzip: zuerst ein vollständig lokal nutzbares Fundament, dann Abrechnung und Compliance, danach optionaler Server und Sync, schließlich native Erweiterung und Professional Features. Alle sechs Phasen vollständig:

### Phase 1 — Lokales Fundament
1. Monorepo (pnpm-Workspace)
2. gemeinsames Core Package (`packages/core`)
3. lokale Desktop App (Tauri)
4. SQLite Datenbank
5. Kunden
6. Projekte
7. Aufgaben
8. Timer
9. Pausen
10. Nachträge
11. Rundung
12. einfache Reports

### Phase 2 — Exporte und Abrechnung
1. PDF Arbeitszeitnachweis
2. CSV Export
3. Rechnungs-PDF
4. Stundensätze
5. Tagessätze
6. Festpreise
7. Budget
8. Rechnungssperre (Finalisierung/Immutability)

### Phase 3 — Deutschland Compliance
1. Pausenregeln
2. Ruhezeitregeln
3. Tageshöchstzeit-Warnungen
4. Compliance Dashboard
5. Compliance PDF

### Phase 4 — Selbst gehosteter Server
1. Next.js Web App
2. PostgreSQL
3. Docker Compose
4. Main-Account-Login
5. Geräte-Verbindung
6. Sync API
7. Live Timer Sync

### Phase 5 — Native Erweiterung
1. macOS Menüleisten-App
2. Windows System Tray
3. iOS App mit Expo
4. Offline Sync
5. Push oder lokale Erinnerungen
6. Konflikt-UI

### Phase 6 — Professional Features
1. Import aus Konkurrenztools
2. Integrationen
3. Webhooks
4. Kundenportal optional
5. Team-Erweiterung optional
6. Genehmigungsworkflow optional

---

## 5. Risiken und Mitigation

Produkt- und Projektrisiken für ein ernsthaftes Produkt, das (zunächst) von wenigen Personen gebaut wird. Jedes Risiko mit konkreter Mitigation.

| Nr. | Risiko | Auswirkung | Mitigation |
|---|---|---|---|
| 1 | **Sync-Komplexität** — verteilte Writes über Desktop/Browser/iOS, Feld-Level-Konflikte | Datenverlust oder inkonsistenter Timer-Zustand | Bewusst KEIN voll-CRDT: Event-Log + Feld-Level-LWW mit Hybrid Logical Clock (HLC), Server als kanonische Wahrheit (`server_revision`); Timer-Singleton per partiellem UNIQUE-Index; Textdivergenz → Konfliktdialog statt stillem Merge; 10 Konfliktfälle explizit getestet (Testfälle 27–31). Siehe [Sync](04-sync.md) |
| 2 | **Rechtsänderungen** — ArbZG-Reform (geplante Pflicht zur elektronischen Zeiterfassung), E-Rechnung EN 16931 | Compliance- und Rechnungslogik veraltet | Versionierte Länder-/Compliance-Profile (`valid_from`/`valid_until`, `calculation_version`); Regeln datengetrieben statt hartcodiert; E-Rechnung ZUGFeRD/XRechnung als V2-Vorbereitung dokumentiert; „Stand Juli 2026" auf jeder Datei. Siehe [Compliance](08-compliance.md) |
| 3 | **Uhr-Manipulation / falsche Gerätezeit** — Zeiterfassung hängt an Uhrzeiten | falsche Dauern, unglaubwürdige Nachweise | Server- vs. Gerätezeit vergleichen, Warnung bei großer Abweichung, mehrere Zeitstempel (lokal/Server-Empfang/Sync-Empfang), Zeitquelle dokumentieren, verdächtige Einträge markieren (SPEC §6.6). Siehe [Sync](04-sync.md) |
| 4 | **PDF- und Steuerkorrektheit** — fehlerhafte Rechnung ist ein Rechts- und Reputationsrisiko | ungültige Rechnungen, Steuerprobleme | §14-UStG-Pflichtangaben als Checkliste, Snapshots (Kunde/Projekt/Satz/Rundung), fortlaufender Nummernkreis, Finalisierung → Immutability, Korrektur nur via Storno/neue Version; Golden-Master-Tests der PDF-Ausgabe. Siehe [Abrechnung & Export](10-abrechnung-export.md) |
| 5 | **Migrationsstabilität** — Schema-Änderungen dürfen bestehende und alte Rechnungen nicht brechen | Datenverlust bei Updates | drizzle-kit-Migrationen versioniert, dual-dialect (SQLite/PostgreSQL) aus einem Schema; `calculation_version`/Snapshots halten alte Rechnungen stabil; Pre-Migration-Backup + `PRAGMA integrity_check`; Update-Migrations im Server-Setup dokumentiert |
| 6 | **Scope für ein kleines Team** — der Funktionsumfang ist groß | Feature-Überdehnung, keine Auslieferung | Strikte Phasen-Roadmap (Phase 1 = lokal lauffähig zuerst); V1/V2-Trennung je Feature dokumentiert; kleinste kohärente Inkremente (siehe Abschnitt 6); Team/Kundenportal architektonisch nur vorbereitet, nicht V1-Pflicht |
| 7 | **Datenschutz-Fehltritt** — Arbeitszeitdaten sind personenbezogen | DSGVO-Verstoß, Vertrauensverlust | Datenminimierung, keine Telemetrie/Screenshots/GPS im Standard, lokale Verschlüsselung optional (SQLCipher), JSON-Export + Löschkonzept unter Aufbewahrungs-Sperren. Siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md) |
| 8 | **Rechtsaussagen als Beratung missverstanden** | Haftungserwartung | Disclaimer „keine Rechtsberatung" auf jeder Datei, Paragraphenbezug, Regeln konfigurierbar (Selbstständige nicht ArbZG-pflichtig, Profil dennoch Standard) |

---

## 6. Erste konkrete Implementierungsschritte

Geordnete Liste kleinster kohärenter Inkremente. Jeder Schritt ist für sich lauffähig und testbar; die Rundungsengine mit dem 70 → 75-Minuten-Test kommt bewusst früh, weil sie die kritische, geldrelevante Kernlogik ist.

1. **Monorepo-Setup** — pnpm-Workspace mit `packages/core`, `packages/db`, `apps/desktop`, `apps/web`, `apps/mobile`; TypeScript-Config, Vitest, Lint/Format-Gate.
2. **Drizzle-Schema der Kern-Tabellen** — `main_accounts`, `local_profiles`, `customers`, `projects`, `tasks`, `time_entries`, `time_entry_breaks`, `rounding_rules`, `billing_rates`, `audit_logs` als dual-dialect Drizzle-Schema; drizzle-kit-Migration für SQLite. Siehe [Datenmodell](06-datenmodell.md).
3. **Core-Rundungsengine + Tests zuerst** — reine Funktionen für Brutto/Netto/Pausen/Rundung im `packages/core`; **Testfall 9–11 zuerst schreiben** (netto 70 Minuten, Intervall `15 Minuten` → `billing_duration_seconds` 75 Minuten, `rounding_delta_seconds = +300`, `actual_duration_seconds` bleibt 70 Minuten). Siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md).
4. **Lokaler Timer in Tauri** — Timer-State-Machine (`idle`/`running`/`paused`/`stopped`) im Frontend, Persistenz via `tauri-plugin-sql`; Single-Timer-Durchsetzung.
5. **Stop-Dialog** — Pflichtbeschreibung (`needs_description`), Start-/Endzeit-Korrektur mit Grund, Rundungsvorschau, Speichern/Entwurf.
6. **Nachtrag** — manueller Eintrag mit Nachtragsgrund, Assistent für vergessenen Start/Stopp, Audit-Log-Eintrag.
7. **SQLite-Persistenz + Backup** — `VACUUM INTO`-Backup, automatische Rotation, `PRAGMA integrity_check`, Restore-Assistent mit Pre-Restore-Snapshot.
8. **PDF-Nachweis** — pdfmake-Pipeline, Arbeitszeitnachweis mit tatsächlicher und gerundeter Zeit getrennt, Exportnummer.
9. **Compliance-DE-Engine** — Pausen-/Ruhezeit-/Tageshöchstzeit-Prüfungen (`30 Minuten`/`45 Minuten`/`8 Stunden`/`10 Stunden`/`11 Stunden`), Ampel-UI. Siehe [Compliance](08-compliance.md).
10. **CSV-Export** — verlustfreier Export/Re-Import.
11. **Rechnung** — Rechnung aus Zeiteinträgen, Snapshots, Finalisierung/Sperre, §14-UStG-Pflichtangaben, PDF-Rechnung.
12. **Server & Sync** — Next.js + PostgreSQL + Docker Compose, Sync-API (Event-Log/HLC), Live-Kanal (WebSocket), Device-Registrierung; danach native Erweiterung (macOS-Menüleiste, Windows-Tray, iOS) gemäß Roadmap-Phase 5.

---

## 7. Qualitätsanspruch (SPEC §39)

Alle 20 Punkte des Qualitätsanspruchs. Sie sind die Leitplanken für jede Design- und Implementierungsentscheidung.

1. Das Produkt ist zuerst für eine einzelne Hauptperson optimiert.
2. Lokale Nutzung ohne Server muss vollständig möglich sein.
3. Selbst gehosteter Server ist optional, aber professionell vorbereitet.
4. Synchronisierung zwischen Desktop, Browser und iOS muss zuverlässig sein.
5. Laufender Timer muss plattformübergreifend konsistent sein.
6. Arbeitszeiten müssen nachgetragen werden können.
7. Nachträge müssen nachvollziehbar und auditierbar sein.
8. Tatsächliche Arbeitszeit und Abrechnungszeit müssen getrennt bleiben (`actual_duration_seconds` vs. `billing_duration_seconds`).
9. Rundung darf nie die echte Arbeitszeit überschreiben.
10. Deutsche Arbeitszeitregeln sind Standard.
11. PDF-Exporte müssen professionell sein.
12. Rechnungen müssen stabil, versioniert und nachvollziehbar sein.
13. Lokale Daten müssen sicher gespeichert werden.
14. Keine Cloud-Pflicht.
15. Keine Telemetrie-Pflicht.
16. macOS-Desktop-App hat hohe Priorität.
17. Windows-Desktop-App wird ebenfalls unterstützt.
18. iOS-App wird sauber vorbereitet.
19. Datenschutz ist Produktkern.
20. Das Ergebnis soll eine hochwertige Grundlage für echte Implementierung sein.

Der Qualitätsanspruch ist erfüllt, wenn alle 32 V1-Akzeptanzkriterien (Abschnitt 3) durch die 36 Testfälle (Abschnitt 2) belegt sind, die Backups verifizierbar wiederherstellbar sind und tatsächliche Arbeitszeit nie durch Rundung überschrieben wird.
