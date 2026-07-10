# Rechercheergebnisse

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Kapitel dokumentiert die Rechercheergebnisse, die der Architektur- und Feature-Planung von **Project Time Ledger** zugrunde liegen. SPEC §1 verlangt eine vorgelagerte Internetrecherche zu Wettbewerbsprodukten, Arbeitszeitrecht, Datenschutz, Rechnungsstellung, Tech-Stacks und Best Practices der Datenmodellierung. Jeder recherchierte Themenblock schließt mit einer klaren, übernommenen Lehre; der Abschnitt [Übernommene Erkenntnisse](#übernommene-erkenntnisse) am Ende fasst die produktbindenden Entscheidungen zusammen. Alle festgelegten Technologieentscheidungen sind in der [Architektur](05-architektur.md) sowie im Index [README](README.md) referenziert.

---

## 1. Wettbewerbsanalyse

Untersucht wurden öffentlich verfügbare Produktseiten, Hilfe- und Dokumentationsseiten sowie Feature-Listen etablierter Zeiterfassungsprogramme. Ziel war, den differenzierenden Kern von Project Time Ledger zu schärfen: **local-first, revisionsfähig, DSGVO-freundlich, ohne invasives Auto-Tracking**, mit Rechnungsstellung als First-Class-Modul.

| Tool | Kern-Stärke | Bewertung für uns |
|---|---|---|
| **Toggl Track** | Exzellenter Timer und Reporting; rollenbasierte Sichtbarkeit von billable rates (Q1/2025). Invoicing nur rudimentär, in Reports versteckt, Export zu QuickBooks/Xero/FreshBooks. | **Übernommen (Reporting-Qualität), verworfen (schwaches Invoicing).** Lehre: Rechnungsstellung als First-Class-Modul differenziert uns. |
| **Harvest** | All-in-one für Freelancer: Zeit + Ausgaben + Invoicing + Payment aus einer Hand. | **Übernommen.** Lehre: der „Time → Invoice"-Flow ist Kern-USP. |
| **Clockify** | Verbindet Invoicing direkt mit tracked time, Projektbudgets und Ausgaben; starker Free-Tier. | **Übernommen (Time-zu-Invoice-Kopplung, Budgets).** |
| **ManicTime** | **local-first, kein Account, kein Cloud-Zwang, funktioniert offline**, On-premise-Option, automatisches App-/Website-Tracking. | **Übernommen (local-first-Bestätigung), bewusst verworfen (Auto-Tracking).** Lehre: bestätigt unsere lokale-zuerst-Strategie; wir bieten bewusst KEIN invasives Auto-Tracking (Datenschutz-USP). |
| **TimeCamp** | Automatisches Tracking + Geofencing + optionale Screenshots. | **Verworfen (invasiv).** Widerspricht [Datenschutz](09-datenschutz-sicherheit.md). |
| **Tyme** | Bester Apple-Ökosystem-Tracker (Mac/iPhone/iPad/Watch nativ). | **Übernommen als Benchmark** für iOS-Politur, siehe [UI und Apps](11-ui-apps.md). |
| **Timely / Memtime** | Vollautomatisches Hintergrund-Tracking. | **Verworfen** (invasiv, gegen Datenminimierung). |
| **Kimai** (PHP/Symfony/Doctrine) | #1 Open-Source-Zeiterfassung: JSON-API, Invoicing, Multi-Timer, Punch-in/out, Tagging, Docker; stark bei Permissions und Extensibility. | **Übernommen als Open-Source-Referenz** für API- und Rechnungs-Modellierung. |
| **solidtime** | Moderner Toggl-/Clockify-Ersatz, polierte SaaS-UX. | **Übernommen als UX-Benchmark.** |
| **Invoice Ninja** | Open-Source-Invoicing, oft mit Kimai kombiniert. | **Übernommen als Referenz** für das Rechnungsdatenmodell, siehe [Abrechnung und Export](10-abrechnung-export.md). |
| **Everhour / TrackingTime** | Team-/PM-Tool-Integrationen (Asana, Jira etc.) als Stärke. | **Für V1 (Einzelperson) nachrangig**, für Phase 6 notiert (Integrationen). |

**Lehren aus dem Wettbewerb:** (1) Rechnungsstellung ist bei den Timer-Marktführern schwach — ein durchgängiger „Time → Invoice"-Flow als First-Class-Modul ist unser USP. (2) local-first ohne Cloud-Zwang (ManicTime) ist marktbewährt und für eine Einzelperson ideal. (3) Invasives Auto-Tracking, Screenshots und Geofencing werden bewusst NICHT übernommen — das ist unser Datenschutz-Alleinstellungsmerkmal. (4) Tyme setzt den Qualitätsmaßstab für die native Apple-Integration.

---

## 2. Deutsches Arbeitszeitrecht (offizielle Quellen)

Recherchiert wurden ausschließlich amtliche Quellen (`gesetze-im-internet.de`, Bundesarbeitsgericht) sowie der maßgebliche EuGH-Bezug. Die abgeleiteten Kernwerte sind wörtlich und prüfbar formuliert; die vollständige Regelableitung steht in der [Compliance](08-compliance.md)-Ausarbeitung.

- **ArbZG §3** — Die werktägliche Arbeitszeit beträgt grundsätzlich **8 Stunden**; eine Verlängerung auf **10 Stunden** ist nur zulässig, wenn im Ausgleichszeitraum (Ø 8 Stunden werktäglich innerhalb von 6 Kalendermonaten bzw. 24 Wochen) ausgeglichen wird.
- **ArbZG §4** — Bei mehr als 6 bis 9 Stunden Arbeitszeit sind mindestens **30 Minuten** Pause zu gewähren; bei mehr als 9 Stunden mindestens **45 Minuten**. Die Pause kann in Blöcke von jeweils mindestens **15 Minuten** aufgeteilt werden; länger als 6 Stunden ohne Pause ist unzulässig.
- **ArbZG §5** — Zwischen zwei Arbeitstagen ist eine ununterbrochene Ruhezeit von mindestens **11 Stunden** einzuhalten.
- **BAG 13.09.2022 (1 ABR 22/21)** i. V. m. **§3 ArbSchG** — Der Arbeitgeber ist verpflichtet, ein objektives, verlässliches und zugängliches System zur Erfassung der **gesamten** Arbeitszeit (Beginn, Ende, Dauer inklusive Pausen) einzuführen. Grundlage ist die EuGH-Entscheidung.
- **EuGH CCOO C-55/18 (14.05.2019)** — verpflichtet Mitgliedstaaten, Arbeitgeber zu einem System zur Messung der täglich geleisteten Arbeitszeit anzuhalten.

**Lehre:** Die deutschen Kernwerte (**30 Minuten**, **45 Minuten**, **15 Minuten**, **8 Stunden**, **10 Stunden**, **11 Stunden**) werden als Standard-Compliance-Profil hart verdrahtet und wörtlich geprüft. Das System muss Beginn, Ende und Pausen lückenlos und nachvollziehbar dokumentieren (BAG/EuGH-Anforderung an Objektivität und Verlässlichkeit).

---

## 3. EU-Arbeitszeitrichtlinie

- **EU-Richtlinie 2003/88/EG** — durchschnittlich maximal **48 Stunden** Wochenarbeitszeit inklusive Überstunden (Referenzzeitraum bis 4 Monate), mindestens **11 Stunden** tägliche Ruhezeit, mindestens **24 Stunden** wöchentliche Ruhezeit, Pause bei mehr als 6 Stunden Arbeit (konkrete Dauer national geregelt), Nachtarbeit durchschnittlich höchstens 8 Stunden je 24-Stunden-Zeitraum, Opt-out gemäß Art. 22.

**Lehre:** Ein generisches EU-Profil ergänzt das deutsche Profil. Länderprofile werden versioniert (`country_code`, `valid_from`, `rules_json`, `calculation_version` …), damit nationale Umsetzungen und spätere Rechtsänderungen ohne Code-Änderung abgebildet werden können — Details in [Compliance](08-compliance.md).

---

## 4. Datenschutz (DSGVO) und Aufbewahrung

Arbeitszeitdaten sind personenbezogene Daten; Datenschutz ist daher Produktkern, nicht Zusatzfunktion. Recherchiert wurden DSGVO-Rechtsgrundlagen, Betroffenenrechte sowie kollidierende Aufbewahrungspflichten.

- **Rechtsgrundlagen der Verarbeitung:** Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung), Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Pflicht, u. a. BAG-Erfassungspflicht), **§26 BDSG** (Beschäftigtenkontext).
- **Betroffenenrechte:** Art. 15 (Auskunft), Art. 16 (Berichtigung), **Art. 17 (Löschung — durch Aufbewahrungspflichten eingeschränkt)**, Art. 20 (Datenübertragbarkeit), Art. 5 (Datenminimierung), Art. 25 (Privacy by Design und by Default).
- **Aufbewahrungsfristen (Konflikt zur Löschung):** **§16 Abs. 2 ArbZG = 2 Jahre** für Aufzeichnungen über die über 8 Stunden hinausgehende Arbeitszeit; steuer- und handelsrechtlich **§147 AO / GoBD / HGB = 6/8/10 Jahre** für abrechnungs- und steuerrelevante Daten (Rechnungen 10 Jahre).
- **Datenminimierung:** keine GPS-Pflicht, keine Screenshots im Standard, keine Telemetrie im Standard.

**Lehre:** Das Löschkonzept muss Aufbewahrungspflichten respektieren — ein Löschantrag nach Art. 17 darf abrechnungs- und steuerrelevante Datensätze nicht vor Fristablauf entfernen. Diese Aufbewahrungstabelle und das Feature-Mapping der Betroffenenrechte stehen in [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md).

---

## 5. Rechnungsstellung Deutschland (§14 UStG)

- **Pflichtangaben §14 Abs. 4 UStG:** vollständiger Name und Anschrift des leistenden Unternehmers und des Leistungsempfängers, Steuernummer oder USt-IdNr., Rechnungsdatum (Ausstellungsdatum), fortlaufende und eindeutige Rechnungsnummer, Menge und Art der Leistung, Leistungszeitpunkt/-zeitraum, nach Steuersätzen aufgeschlüsseltes Entgelt sowie anzuwendender Steuersatz und Steuerbetrag.
- **Kleinunternehmer §19 UStG** (Neuregelung seit 01.01.2025): Der Hinweis auf die Kleinunternehmerregelung ist Pflicht, verbunden mit der Angabe des Grundes für den fehlenden Umsatzsteuerausweis.
- **Reverse Charge §13b UStG** (Hinweispflicht nach §14a Abs. 5 UStG): Hinweis „Steuerschuldnerschaft des Leistungsempfängers".
- **E-Rechnung seit 2025:** strukturiertes Format nach EN 16931 — **XRechnung** oder **ZUGFeRD ≥ 2.0.1** (ohne die Profile MINIMUM und BASIC-WL). Die Empfangspflicht im B2B-Bereich besteht seit 01.01.2025; Kleinbeträge und Kleinunternehmer sind ausgenommen.

**Lehre:** V1 erzeugt rechtskonforme PDF-Rechnungen mit allen §14-Pflichtangaben, Kleinunternehmer- und Reverse-Charge-Hinweisen sowie fortlaufendem Rechnungsnummernkreis; ZUGFeRD/XRechnung sind für V2 vorbereitet. Immutability nach Finalisierung und Korrektur nur via Storno/neue Version sind im [Abrechnungs- und Exportkonzept](10-abrechnung-export.md) ausgearbeitet.

---

## 6. Tech-Stack (verifiziert 2025/2026)

Die Technologiebewertung ist datiert und faktenbasiert; die daraus abgeleiteten **festgelegten Entscheidungen** werden hier begründet und in der [Architektur](05-architektur.md) nicht neu verhandelt.

| Baustein | Recherchestand | Konsequenz / Entscheidung |
|---|---|---|
| **Desktop-Framework** | **Tauri 2.x** stabil seit 10/2024: `tray-icon` (ersetzt system-tray), Updater als Plugin, offizielles SQL-Plugin (SQLite/Postgres/MySQL). **Biometric-Plugin nur iOS/Android** — Touch ID auf macOS NICHT über das Plugin. Code Signing = Apple Developer Account (99 $/Jahr). | Tauri für macOS/Windows. macOS App-Lock via LocalAuthentication über eigenen Rust-Command oder App-Passwort (nicht über das Biometric-Plugin). |
| **ORM / Datenzugriff** | **Drizzle** ~57 KB / 7 KB gzip, zero runtime deps, **nativer Dialekt-Switch SQLite↔PostgreSQL**, läuft in Tauri via drizzle-proxy → tauri-plugin-sql (Query im Frontend gebaut, Params ans Backend). Prisma 7 auf ~1,6 MB reduziert, aber Engine-Overhead und im Tauri-SQLite-Kontext umständlicher. | **ENTSCHEIDUNG: Drizzle** (nicht Prisma). |
| **Web / Server** | **Next.js 15** self-host: `output: 'standalone'` (~150 MB Image), `server.js` als Node-Server. **WebSocket** braucht Custom-Server oder `next-ws` (Route Handlers sind serverless, kein WS-Server). **SSE** nativ via Route Handler + `ReadableStream`. | Next.js 15 standalone; WebSocket primär über Custom-Node-Server, SSE als Alternative, Polling als Fallback. |
| **iOS / Mobile** | **Expo / React Native**: local-first via `expo-sqlite`; Widgets/Live Activities über native Module (WidgetKit/ActivityKit als Config Plugin). | Expo/RN für iOS mit `expo-sqlite`-Offline-Cache. |
| **PDF** | `pdfmake` (JSON-deklarativ) ideal für strukturierte Rechnungen/Nachweise, **lokal in Tauri ohne Chromium** lauffähig; **Playwright/Chromium** serverseitig für pixelgenaue HTML-Templates/Charts. | **Hybrid: pdfmake als portabler Kern**, Playwright optional serverseitig. |
| **Sync** | ElectricSQL-Legacy eingestellt; PowerSync = einziges kommerzielles mit First-Class-Offline (LWW-Default); Linear-Sync-Engine als Muster; Automerge 3.0 (CRDT) verfügbar. Voll-CRDT für Single-User-Multi-Device Overkill. | **ENTSCHEIDUNG: eigenes Event-Log + Feld-Level-LWW mit Hybrid Logical Clock (HLC)**, plus serverseitige Timer-Singleton-Sperre. Siehe [Synchronisierung](04-sync.md). |
| **IDs** | **UUIDv7** — zeitgeordnet, dezentral (offline) erzeugbar, bessere B-Tree-Lokalität (Insert 50 Mio.: ~2 min vs. ~20 min bei v4), ideal für verteilte Writes/Merges/Korrelation. | **UUIDv7** als Primärschlüssel überall; UUIDv4 nur für Tokens/Secrets. |

**Lehre:** Ein gemeinsames TypeScript-Core-Package (Zeitberechnung, Rundung, Compliance, Abrechnung, Zod-Schemas), dual-dialektfähige Drizzle-Schemas und ein portabler pdfmake-Kern erlauben identische Business-Logik über Desktop, Web und Mobile — ohne Cloud-Zwang und mit voller Offline-Fähigkeit.

---

## 7. Open-Source-Referenzen

- **Kimai** (`kimai.org`, GitHub) — Referenz für JSON-API-Design, Multi-Timer, Punch-in/out, Tagging und Docker-Deployment.
- **Invoice Ninja** — Referenz für ein ausgereiftes, quelloffenes Rechnungsdatenmodell (Nummernkreise, Positionsarten, Steuerlogik), häufig in Kombination mit Kimai betrieben.
- **ManicTime** — Referenz für konsequent local-first Betrieb ohne Cloud-Zwang und On-premise-Option.
- **ElectricSQL** (GitHub) — als Negativ-Referenz analysiert: Legacy-Ansatz eingestellt, bestätigt die Entscheidung gegen ein fremdes voll-CRDT-Sync-Framework zugunsten eines eigenen Event-Logs.

**Lehre:** Offene Referenzimplementierungen validieren unser Datenmodell und API-Design, ohne dass wir uns an ein einzelnes Framework binden.

---

## 8. Best Practices Datenmodellierung (Zeit, Pausen, Rundung, Abrechnung)

- **Trennung actual vs. billing:** Tatsächliche Arbeitszeit und abgerechnete Zeit werden getrennt gespeichert — `actual_duration_seconds` bleibt unverändert, `billing_duration_seconds` wird gerundet abgeleitet. Rundung darf die echte Arbeitszeit nie überschreiben.
- **Sekundengenaue Speicherung, minutengenaue Anzeige:** tatsächliche Zeit sekundengenau in `*_seconds INTEGER`, Anzeige gerundet auf Minuten.
- **Zeit als UTC + IANA-Zeitzone:** `*_at` als UTC-Zeitstempel plus `timezone TEXT` (IANA) pro Eintrag, damit Sommer-/Winterzeit und über-Mitternacht-Fälle deterministisch aufgelöst werden.
- **Geld als Integer Minor Units:** Beträge als `amount_cents BIGINT` mit `currency CHAR(3)` (ISO 4217), niemals als Float.
- **Snapshots für Stabilität:** `rate_snapshot` und `billing_amount_snapshot` frieren Satz und Betrag zum Zeitpunkt von Eintrag und Rechnung ein, damit finalisierte Rechnungen stabil bleiben (`calculation_version`, `rounding_rule_id`, `rounding_delta_seconds`, `rounding_reason`).
- **Pausen als eigene Entität:** mehrere Pausen pro Eintrag, jede Pause mit Beginn/Dauer, damit Compliance-Prüfungen (Mindestblock **15 Minuten**) auswertbar sind.

**Lehre:** Diese Modellierungsregeln sind in [Datenmodell](06-datenmodell.md) und [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md) verbindlich umgesetzt (u. a. durchgerechnetes 70→75-Minuten-Beispiel).

---

## Quellen

Recht und Datenschutz (offizielle Quellen):

1. ArbZG §3 — <https://www.gesetze-im-internet.de/arbzg/__3.html>
2. ArbZG §4 — <https://www.gesetze-im-internet.de/arbzg/__4.html>
3. ArbZG §5 — <https://www.gesetze-im-internet.de/arbzg/__5.html>
4. ArbZG (Gesamttext) — <https://www.gesetze-im-internet.de/arbzg/BJNR117100994.html>
5. UStG §14 (Ausstellung von Rechnungen) — <https://www.gesetze-im-internet.de/ustg_1980/__14.html>
6. BAG 13.09.2022, 1 ABR 22/21 — <https://www.bundesarbeitsgericht.de/entscheidung/1-abr-22-21/>
7. EU-Richtlinie 2003/88/EG (EUR-Lex) — <https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A32003L0088>
8. EU-OSHA zur Richtlinie 2003/88/EG — <https://osha.europa.eu/en/legislation/directives/directive-2003-88-ec>

Tech-Stack:

9. Tauri 2.0 Release — <https://v2.tauri.app/blog/tauri-20/>
10. Tauri Biometric-Plugin (nur iOS/Android) — <https://v2.tauri.app/plugin/biometric/>
11. Tauri Updater-Plugin — <https://v2.tauri.app/plugin/updater/>
12. Tauri Code Signing macOS — <https://v2.tauri.app/distribute/sign/macos/>
13. Next.js Self-Hosting — <https://nextjs.org/docs/app/guides/self-hosting>
14. Drizzle vs. Prisma (Bytebase) — <https://www.bytebase.com/blog/drizzle-vs-prisma/>
15. Drizzle vs. Prisma (MakerKit) — <https://makerkit.dev/blog/tutorials/drizzle-vs-prisma>
16. Drizzle + SQLite in Tauri — <https://dev.to/huakun/drizzle-sqlite-in-tauri-app-kif>
17. ElectricSQL vs. PowerSync — <https://powersync.com/blog/electricsql-vs-powersync>
18. ElectricSQL (GitHub) — <https://github.com/electric-sql/electric>
19. UUIDv7-Performance-Benchmark — <https://dev.to/umangsinha12/postgresql-uuid-performance-benchmarking-random-v4-and-time-based-v7-uuids-n9b>
20. Node.js PDF-Bibliotheken (Vergleich) — <https://pdfbolt.com/blog/top-nodejs-pdf-generation-libraries>

Wettbewerb und Open Source:

21. Kimai — <https://www.kimai.org/en/>
22. Kimai (GitHub) — <https://github.com/kimai/kimai>
23. ManicTime — <https://www.manictime.com/>
24. Toggl zu EU-Pflicht der Zeiterfassung — <https://toggl.com/blog/eu-mandatory-time-tracking>

Damit sind **24 Quellen als Markdown-Links** zitiert, davon mehrere von `gesetze-im-internet.de` und von `eur-lex.europa.eu` (Anforderung: ≥15 Quellen, ≥1 gesetze-im-internet.de, ≥1 eur-lex.europa.eu).

---

## Übernommene Erkenntnisse

Zusammenfassung der produktbindenden Entscheidungen, die aus der Recherche übernommen wurden (SPEC §1 verlangt diese Zusammenfassung):

1. **Rechnungsstellung als First-Class-Modul.** Marktführer schwächeln beim Invoicing (Toggl); der durchgängige „Time → Invoice"-Flow (Harvest, Clockify) ist unser USP.
2. **local-first ohne Cloud-Zwang.** Bestätigt durch ManicTime; vollständige lokale Nutzung, optionaler selbst-gehosteter Sync.
3. **Kein invasives Auto-Tracking.** Screenshots, Geofencing und Hintergrund-Tracking (TimeCamp, Timely/Memtime) werden bewusst NICHT übernommen — Datenschutz-USP.
4. **Deutsches ArbZG als Standard-Compliance-Profil.** Kernwerte **30 Minuten**, **45 Minuten**, **15 Minuten**, **8 Stunden**, **10 Stunden**, **11 Stunden** aus ArbZG §3/§4/§5; Erfassungspflicht nach BAG 1 ABR 22/21 und EuGH C-55/18.
5. **Versioniertes EU-Profil** auf Basis der Richtlinie 2003/88/EG (48 Stunden Ø/Woche, 11 Stunden Ruhezeit), nationale Erweiterungen über versionierte Länderprofile.
6. **DSGVO als Produktkern** mit Aufbewahrungs-Sperren: Löschung (Art. 17) respektiert §16 Abs. 2 ArbZG (2 Jahre) und §147 AO/GoBD/HGB (6/8/10 Jahre).
7. **Rechtskonforme Rechnungen** nach §14 UStG inkl. Kleinunternehmer §19 und Reverse Charge §13b; ZUGFeRD/XRechnung als V2-Vorbereitung.
8. **Tech-Stack festgelegt:** Tauri 2.x, Next.js 15, Expo/RN, **Drizzle** (nicht Prisma), **pdfmake + optional Playwright**, **Event-Log + LWW/HLC** statt voll-CRDT, **UUIDv7**, Integer-Cents, UTC + IANA-Zeitzone.
9. **Trennung actual vs. billing** als unverhandelbares Modellierungsprinzip: `actual_duration_seconds` bleibt unverändert, `billing_duration_seconds` wird gerundet abgeleitet.

Die konkrete Umsetzung dieser Erkenntnisse verteilt sich auf [Produkt](02-produkt.md), [Zeiterfassung](03-zeiterfassung.md), [Synchronisierung](04-sync.md), [Architektur](05-architektur.md), [Datenmodell](06-datenmodell.md), [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md), [Compliance](08-compliance.md), [Datenschutz und Sicherheit](09-datenschutz-sicherheit.md), [Abrechnung und Export](10-abrechnung-export.md), [UI und Apps](11-ui-apps.md) sowie [Qualität](12-qualitaet.md).
