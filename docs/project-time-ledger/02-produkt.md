# Produkt — Vision, Zielgruppen, Betriebsarten, Main Account, Feature-Liste

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Dokument definiert **was** der Project Time Ledger ist: die Produktvision und ihre 32 Kernfähigkeiten, die sieben Zielgruppen mit ihren Jobs-to-be-done, die fünf Betriebsarten, das Main-Account-Konzept und die vollständige, nach Phase (V1/V2) klassifizierte Feature-Liste. Technische Details liegen in den Schwesterdateien: [Architektur](05-architektur.md), [Datenmodell](06-datenmodell.md), [Synchronisierung](04-sync.md), [Zeiterfassung & Nachtrag](03-zeiterfassung.md).

---

## 1. Produktvision

Der **Project Time Ledger** ist eine professionelle, revisionsfähige und datenschutzfreundliche Zeiterfassung für **eine einzelne Hauptperson** (Main Account). Er funktioniert zuerst vollständig **lokal ohne Server und ohne Cloud-Zwang** und lässt sich optional mit einem **selbst gehosteten Server** verbinden, um Desktop, Browser und iOS geräteübergreifend zu synchronisieren.

Leitsatz aus der Spezifikation: **Das Produkt darf keine einfache Timer-App sein.** Es bildet die Grundlage für eine nachvollziehbare, auditierbare und abrechnungssichere Zeiterfassung. Zwei Prinzipien sind nicht verhandelbar und ziehen sich durch alle Module:

- **`actual_duration_seconds` und `billing_duration_seconds` bleiben getrennt** — Rundung überschreibt niemals die echte Arbeitszeit (siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md)).
- **Datenschutz ist Produktkern** — kein invasives Auto-Tracking, keine Screenshots, keine Telemetrie im Standard (siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md)).

### 1.1 Die 32 Kernfähigkeiten (SPEC §2)

Das Produkt muss die folgenden 32 Fähigkeiten ermöglichen. Jede ist einem umsetzenden Modul zugeordnet.

| Nr. | Fähigkeit | Umsetzendes Modul / Datei |
|----|-----------|---------------------------|
| 1 | Kunden anlegen | [Abrechnung & Export §9](10-abrechnung-export.md) |
| 2 | Projekte anlegen | [Abrechnung & Export §10](10-abrechnung-export.md) |
| 3 | Aufgaben anlegen | [Abrechnung & Export §11](10-abrechnung-export.md) |
| 4 | Arbeitszeiten live erfassen | [Zeiterfassung](03-zeiterfassung.md) |
| 5 | Arbeitszeiten pausieren | [Zeiterfassung](03-zeiterfassung.md) |
| 6 | Arbeitszeiten stoppen | [Zeiterfassung](03-zeiterfassung.md) |
| 7 | Arbeitszeiten nachtragen | [Zeiterfassung §7](03-zeiterfassung.md) |
| 8 | vergessene Arbeitszeiten rekonstruieren | [Zeiterfassung §7.6/7.7](03-zeiterfassung.md) |
| 9 | Arbeitszeiten korrigieren | [Zeiterfassung](03-zeiterfassung.md), [Datenmodell (Audit)](06-datenmodell.md) |
| 10 | Arbeitszeiten kommentieren | [Zeiterfassung (Stop-Dialog)](03-zeiterfassung.md) |
| 11 | Tätigkeitsbeschreibungen dokumentieren | [Zeiterfassung](03-zeiterfassung.md) |
| 12 | Pausen dokumentieren | [Zeiterfassung (Pausenkonzept)](03-zeiterfassung.md) |
| 13 | Arbeitszeitregeln prüfen | [Compliance](08-compliance.md) |
| 14 | Stundensätze festlegen | [Abrechnung §13.1](10-abrechnung-export.md) |
| 15 | Tagessätze festlegen | [Abrechnung §13.2](10-abrechnung-export.md) |
| 16 | Festpreise festlegen | [Abrechnung §13.3](10-abrechnung-export.md) |
| 17 | Retainer und Pauschalen vorbereiten | [Abrechnung §13.4](10-abrechnung-export.md) |
| 18 | abrechenbare Zeit berechnen | [Zeitberechnung](07-zeitberechnung-rundung.md) |
| 19 | tatsächliche Arbeitszeit dokumentieren | [Zeitberechnung](07-zeitberechnung-rundung.md) |
| 20 | gerundete Abrechnungszeit berechnen | [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md) |
| 21 | Rechnungen erstellen | [Abrechnung & Export §19](10-abrechnung-export.md) |
| 22 | Arbeitszeitnachweise exportieren | [Abrechnung & Export §18](10-abrechnung-export.md) |
| 23 | Projektberichte exportieren | [Abrechnung & Export §20](10-abrechnung-export.md) |
| 24 | PDF Exporte erstellen | [Abrechnung & Export §18](10-abrechnung-export.md) |
| 25 | CSV, XLSX und JSON Exporte erstellen | [Abrechnung & Export §18](10-abrechnung-export.md) |
| 26 | lokal ohne Server arbeiten | Betriebsart 4.1 (siehe §3.1) |
| 27 | optional mit eigenem Server synchronisieren | Betriebsart 4.2/4.3 (siehe §3.2/3.3) |
| 28 | Desktop App mit Server verbinden | [Synchronisierung](04-sync.md) |
| 29 | Browser App mit Server verbinden | [Synchronisierung](04-sync.md) |
| 30 | iOS App mit Server verbinden | [Synchronisierung](04-sync.md) |
| 31 | laufenden Timer über alle Geräte synchron anzeigen | [Synchronisierung (Timer-Sync)](04-sync.md) |
| 32 | Datenschutz und Selbst Hosting ernst nehmen | [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md) |

---

## 2. Zielgruppen (7 Gruppen, je Jobs-to-be-done)

Die Spezifikation nennt sieben Primär-Zielgruppen. Das Produkt ist zuerst für die **einzelne Hauptperson** optimiert; Team, Kundenportal und Agentur sind architektonisch vorbereitet, aber nicht V1-Kernvoraussetzung. Jobs-to-be-done (JTBD) in der Form „Wenn ich …, will ich …, damit …".

| # | Zielgruppe | Jobs-to-be-done |
|---|------------|-----------------|
| 1 | **Selbstständige** | Wenn ich mehrere Kunden parallel betreue, will ich jede Minute korrekt einem Kunden/Projekt zuordnen und rechtssicher abrechnen, damit ich lückenlose Rechnungen und einen prüfbaren Arbeitszeitnachweis habe. |
| 2 | **Freelancer** | Wenn ich stunden- oder projektbasiert arbeite, will ich Live-Timer und Nachträge frei mischen, damit auch vergessene Zeiten nachvollziehbar in die Abrechnung fließen und nichts verloren geht. |
| 3 | **Berater** | Wenn ich in Tages- und Festpreis-Mandaten arbeite, will ich Tagessätze, Retainer und Festpreis-Budgets sauber gegen den Ist-Aufwand rechnen, damit Marge und Budgetverbrauch jederzeit sichtbar sind. |
| 4 | **Entwickler** | Wenn ich zwischen Entwicklung, Code Review und Deployment wechsle, will ich per Tastenkürzel und Menüleisten-Timer ohne Reibung tracken, damit die Erfassung meinen Flow nicht unterbricht. |
| 5 | **Designer** | Wenn ich kreative Deliverables abliefere, will ich Tätigkeit, Ergebnis und interne Notiz pro Eintrag dokumentieren, damit Kundenreports die geleistete Arbeit klar belegen. |
| 6 | **Kreative** | Wenn ich unregelmäßig und geräteübergreifend arbeite, will ich offline auf iOS oder Desktop erfassen und später synchronisieren, damit der laufende Timer plattformübergreifend konsistent bleibt. |
| 7 | **Projektarbeiter** | Wenn ich an mehreren Projekten mit Budgets arbeite, will ich geplante gegen tatsächliche Stunden sowie Compliance-Status im Blick behalten, damit ich Überstunden, Pausenverstöße und Budgetüberschreitungen früh erkenne. |

---

## 3. Betriebsarten (SPEC §4.1–4.5)

Das Produkt muss fünf Betriebsarten unterstützen. Jede Eigenschaftsliste ist vollständig wiedergegeben.

### 3.1 Lokaler Desktop Modus (§4.1)

Die Desktop App läuft lokal auf **macOS oder Windows**.

Eigenschaften:

1. keine Registrierung erforderlich
2. kein externer Server erforderlich
3. keine Cloud erforderlich
4. lokale Datenbank
5. lokale Exporte
6. lokale PDF Erstellung optional
7. lokale Backups
8. lokale Einstellungen
9. lokaler Hauptnutzer
10. optionaler App Passwort Schutz
11. optional Face ID oder Touch ID auf macOS, sofern technisch möglich
12. optional verschlüsselte lokale Datenbank
13. keine Telemetrie im Standard
14. keine externen Dienste im Standard
15. volle Funktion für Zeiterfassung, Projekte, Kunden, Reports und Rechnungen

**Empfohlene lokale Speicherung** (Details in [Architektur](05-architektur.md) und [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md)):

1. **SQLite** als lokale Datenbank
2. **SQLCipher** oder vergleichbare Verschlüsselung optional
3. lokale Dateien für PDF Exporte und Anhänge
4. automatische lokale Backups
5. manuelle Export- und Import-Funktion
6. Datenbank-Integritätsprüfung
7. Reparaturfunktion für beschädigte lokale Datenbanken

> Umsetzungshinweis (recherchiert): Das Tauri-Biometric-Plugin deckt nur iOS/Android ab; **Touch ID auf macOS läuft nicht über das Plugin**, sondern über LocalAuthentication als eigener Rust-Command oder alternativ App-Passwort — siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md).

### 3.2 Selbst gehosteter Server Modus (§4.2)

Die Anwendung kann auf einem **eigenen Server** betrieben werden — kein externer Anbieter erforderlich.

Eigenschaften:

1. Next.js Web App
2. Backend API
3. PostgreSQL Datenbank
4. optional Redis für Hintergrundjobs
5. optional S3 kompatibler Speicher für Exporte und Anhänge
6. Docker Compose Setup
7. klare Umgebungsvariablen
8. Admin Setup Wizard
9. Main Account anlegen
10. Geräte verbinden
11. API Tokens verwalten
12. sichere Sessions
13. Backups
14. Restore
15. Health Check
16. Update Migrations
17. kein externer Anbieter erforderlich

Betriebsthemen (Docker Compose, Env-Vars, Setup-Wizard, Health Check, Migrations) sind in [Architektur](05-architektur.md) ausgeführt.

### 3.3 Hybrid Modus mit Synchronisierung (§4.3)

Die Desktop App speichert Daten **lokal** und synchronisiert mit dem selbst gehosteten Server, sobald eine Verbindung besteht (Local-First; Details in [Synchronisierung](04-sync.md)).

Eigenschaften:

1. Offline weiterarbeiten
2. später synchronisieren
3. lokaler Cache
4. Server als optionaler Synchronisationsknoten
5. Konflikterkennung
6. Konfliktauflösung
7. synchroner Timer Status
8. Ereignisprotokoll
9. Geräteübersicht
10. Synchronisationsstatus je Gerät

### 3.4 Browser Modus (§4.4)

Die Browser App läuft auf dem selbst gehosteten Server.

Eigenschaften:

1. Zugriff per Browser
2. responsive UI
3. Timer starten im Browser
4. Timer im Browser pausieren
5. Timer im Browser stoppen
6. Timer Status wird an Desktop und iOS übertragen
7. Reports und Exporte erstellen
8. Rechnungen erstellen
9. Admin Einstellungen verwalten
10. optional PWA Unterstützung

### 3.5 iOS Modus (§4.5)

Die iOS App verbindet sich entweder mit dem selbst gehosteten Server **oder** arbeitet in einem vorbereiteten lokalen Modus (Details in [UI & Apps](11-ui-apps.md)).

Eigenschaften:

1. Timer starten
2. Timer pausieren
3. Timer stoppen
4. laufenden Timer vom Server anzeigen
5. Projekt wechseln
6. Aufgabe wechseln
7. Tätigkeitsbeschreibung erfassen
8. Arbeitszeit nachtragen
9. Pausen erfassen
10. heutige Arbeitszeit anzeigen
11. Wochenübersicht anzeigen
12. Offline Erfassung
13. später synchronisieren
14. lokale Erinnerungen
15. Widget optional
16. Siri Shortcuts optional
17. Face ID Sperre optional

---

## 4. Main-Account-Konzept (SPEC §3)

Das Produkt wird zuerst für **eine einzelne Hauptperson** entwickelt. Es gibt zunächst **keinen klassischen Multi-User-Cloud-Account-Zwang**, sondern ein Main-Account-Konzept. Die zehn festgelegten Punkte:

1. Im lokalen Modus existiert ein **lokales Hauptprofil** auf dem Gerät.
2. Dieses Hauptprofil gehört **genau einer Person**.
3. Die App kann komplett **ohne externe Registrierung** genutzt werden.
4. Im lokalen Desktop Modus werden **alle Daten lokal gespeichert**.
5. Im lokalen Desktop Modus ist **keine Internetverbindung erforderlich**.
6. Im Server Modus wird ein **selbst gehosteter Server** betrieben.
7. Im Server Modus meldet sich die Hauptperson am **eigenen Server** an.
8. Desktop App, Browser App und iOS App **verbinden sich mit diesem Server**.
9. Der Server **synchronisiert Daten zwischen allen verbundenen Geräten**.
10. Team, Kundenportal und mehrere Nutzer werden **architektonisch vorbereitet, aber nicht als Kernvoraussetzung für Version 1** behandelt.

**Konsequenzen fürs Datenmodell:** Es gibt eine `main_accounts`-Tabelle und pro Gerät ein `local_profiles`- bzw. `devices`-Datensatz. Pro `main_account` läuft standardmäßig **nur ein aktiver Timer** — durchgesetzt über einen partiellen UNIQUE-Index (siehe [Synchronisierung](04-sync.md) und [Datenmodell](06-datenmodell.md)). Die Team-Tabellen (`organizations`, `users`, `memberships`, `roles`, `permissions`, `project_members`, `approvals`, `customer_portal_access`) sind vorbereitet, aber V2.

---

## 5. Vollständige Feature-Liste (V1/V2)

Die folgende Tabelle klassifiziert alle Produktbereiche nach Auslieferungsphase. **V1** = Kern der ersten Version (lokal vollständig nutzbar, plus selbst-gehosteter Server-/Sync-Kern gemäß Roadmap-Phasen 1–4). **V2** = architektonisch vorbereitet, aber später (Roadmap-Phasen 5–6 und optionale Bausteine). Die Roadmap-Phasen sind in [Qualität & Roadmap](12-qualitaet.md) ausgeführt.

### 5.1 Zeiterfassung & Nachtrag

| Feature | Phase | Verweis |
|---------|-------|---------|
| Live-Timer starten / pausieren / fortsetzen / stoppen | V1 | [03-zeiterfassung.md](03-zeiterfassung.md) |
| Pflichtbeschreibung beim Stoppen (projektweise konfigurierbar) | V1 | [03](03-zeiterfassung.md) |
| Mehrere Pausen pro Eintrag, manuell + automatischer Pausenstatus | V1 | [03](03-zeiterfassung.md) |
| Arbeitszeiten nachtragen (Nachtragsassistent, Gründe, Kalender-/Tagesansicht) | V1 | [03 §7](03-zeiterfassung.md) |
| Timer vergessen zu starten / zu stoppen — Rekonstruktion | V1 | [03 §7.6/7.7](03-zeiterfassung.md) |
| Timer-Wiederherstellung nach App-Absturz / Neustart | V1 | [03](03-zeiterfassung.md) |
| Über-Mitternacht-Einträge markieren, Zeitzone speichern | V1 | [07](07-zeitberechnung-rundung.md) |
| Favoriten-Timer, Schnellstart aus letzten Einträgen | V1 | [03](03-zeiterfassung.md) |
| Multi-Timer (parallele Projekte) | V2 | [04](04-sync.md) |

### 5.2 Kunden, Projekte, Aufgaben

| Feature | Phase | Verweis |
|---------|-------|---------|
| Kundenverwaltung (25 Felder inkl. USt-ID, Zahlungsziel, Standardsätze) | V1 | [10 §9](10-abrechnung-export.md) |
| Projektverwaltung (33 Felder inkl. Budget, Rundungsregel, Nachtrag-Policy) | V1 | [10 §10](10-abrechnung-export.md) |
| Aufgaben / Tätigkeitsarten (global + projektbezogen) | V1 | [10 §11](10-abrechnung-export.md) |
| Tags | V1 | [06](06-datenmodell.md) |

### 5.3 Abrechnung

| Feature | Phase | Verweis |
|---------|-------|---------|
| Stundensatz (pro Kunde/Projekt/Aufgabe/Datum, historisiert, Snapshot) | V1 | [10 §13.1](10-abrechnung-export.md) |
| Tagessatz (voller/halber Tag, Mindestabrechnung) | V1 | [10 §13.2](10-abrechnung-export.md) |
| Festpreis (Budgetstunden, Marge, Meilensteine, Teilrechnungen) | V1 | [10 §13.3](10-abrechnung-export.md) |
| Retainer / Pauschale (enthaltene Stunden, Übertrag/Verfall) | V1 | [10 §13.4](10-abrechnung-export.md) |
| Rundungslogik (9 Modi, 6 Intervalle, `actual` vs `billing` getrennt) | V1 | [07](07-zeitberechnung-rundung.md) |

### 5.4 Rechnung

| Feature | Phase | Verweis |
|---------|-------|---------|
| Rechnung aus Stunden / Tagessatz / Festpreis / Retainer | V1 | [10 §19](10-abrechnung-export.md) |
| Fortlaufender Rechnungsnummernkreis, Finalisierung → Immutability | V1 | [10 §19](10-abrechnung-export.md) |
| Storno, Teil-/Schlussrechnung, Snapshots (Kunde/Projekt/Satz/Rundung) | V1 | [10 §19](10-abrechnung-export.md) |
| §14-UStG-Pflichtangaben, Kleinunternehmer §19, Reverse Charge §13b | V1 | [10 §19](10-abrechnung-export.md) |
| Gutschrift, Mahnstatus, mehrere Währungen | V2 | [10 §19](10-abrechnung-export.md) |
| E-Rechnung ZUGFeRD / XRechnung (EN 16931) | V2 | [10 §19](10-abrechnung-export.md) |
| E-Mail-Entwurf zur Rechnung | V2 | [10 §19](10-abrechnung-export.md) |

### 5.5 Reports & Export

| Feature | Phase | Verweis |
|---------|-------|---------|
| Exporte PDF / CSV / XLSX / JSON | V1 | [10 §18](10-abrechnung-export.md) |
| Arbeitszeit-PDF (38 Inhalte) + 7 PDF-Varianten | V1 | [10 §18](10-abrechnung-export.md) |
| Reports (Tag/Woche/Monat/Jahr, Kunde/Projekt/Aufgabe, Umsatz/Budget/Profitabilität) | V1 | [10 §20](10-abrechnung-export.md) |
| ZIP-Archiv mit Anhängen | V2 | [10 §18](10-abrechnung-export.md) |

### 5.6 Compliance

| Feature | Phase | Verweis |
|---------|-------|---------|
| Deutsches Arbeitszeit-Profil (30 Minuten / 45 Minuten Pause, Pausenblöcke mind. 15 Minuten, 8 Stunden Standard / 10 Stunden Max, 11 Stunden Ruhezeit) | V1 | [08](08-compliance.md) |
| Compliance-UI (grün/gelb/rot, Regel erklären, Override mit Audit) | V1 | [08](08-compliance.md) |
| EU-Profil (2003/88/EG) + versionierte Länderprofile | V1 | [08](08-compliance.md) |
| Weitere Länderprofile | V2 | [08](08-compliance.md) |

### 5.7 Synchronisierung

| Feature | Phase | Verweis |
|---------|-------|---------|
| Local-First Event-Log + Feld-Level-LWW mit HLC | V1 | [04](04-sync.md) |
| Live-Timer-Sync über Geräte (WebSocket primär, SSE, Polling-Fallback) | V1 | [04](04-sync.md) |
| Konflikterkennung + Konfliktdialog (10 Konfliktfälle) | V1 | [04](04-sync.md) |
| Geräteübersicht, Sync-Status je Gerät, Uhr-Vertrauen | V1 | [04](04-sync.md) |
| Push-Kanal auf iOS | V2 | [11](11-ui-apps.md) |

### 5.8 Sicherheit, Backup, Import, API, Webhooks

| Feature | Phase | Verweis |
|---------|-------|---------|
| App-Sperre optional, verschlüsselte lokale DB (SQLCipher) optional | V1 | [09](09-datenschutz-sicherheit.md) |
| Server-Sicherheit (TLS, sichere Sessions, CSRF/XSS/SQL-Injection-Schutz, Rate Limiting) | V1 | [09](09-datenschutz-sicherheit.md) |
| Passkeys / 2FA (TOTP) im Server-Modus | V2 | [09](09-datenschutz-sicherheit.md) |
| Lokale Backups (manuell + automatisch), Restore, Integritätsprüfung | V1 | [12](12-qualitaet.md) |
| DSGVO-Export (JSON), Löschkonzept mit Aufbewahrungs-Sperren | V1 | [09](09-datenschutz-sicherheit.md) |
| Import CSV / XLSX / JSON (Import-Assistent) | V1 | [10 §31](10-abrechnung-export.md) |
| Import aus Toggl / Clockify / Harvest / Kimai | V2 | [10 §31](10-abrechnung-export.md) |
| API (Timer, Zeiteinträge, Kunden/Projekte/Aufgaben, Reports, Sync-Events, Geräte) | V1 | [05](05-architektur.md) |
| Webhooks (12 Events, HMAC-Signatur) | V2 | [05](05-architektur.md) |
| Kundenportal / Team / Genehmigungsworkflow | V2 | [06 (Team-Tabellen)](06-datenmodell.md) |

---

## 6. Abgrenzung — was das Produkt bewusst NICHT ist

Aus der Recherche (siehe [Recherche](01-recherche.md)) abgeleitete, bewusste Nicht-Ziele:

- **Kein invasives Auto-Tracking** von Apps/Websites (Abgrenzung zu ManicTime/TimeCamp/Timely).
- **Keine automatische Screenshot-Überwachung**, kein invasives Mitarbeitertracking, keine GPS-Pflicht.
- **Keine Cloud-Pflicht und keine Telemetrie** im Standard.
- **Keine einfache Timer-App** — Abrechnung, Compliance, Audit und revisionsfähige Rechnungen sind First-Class-Module.
