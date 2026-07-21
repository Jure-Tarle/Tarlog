# Datenschutz und Sicherheit

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Arbeitszeitdaten sind personenbezogene Daten. Datenschutz ist kein Zusatz, sondern Produktkern. Dieses Kapitel deckt SPEC §17 (Datenschutzkonzept, 25 Punkte) und SPEC §29 (Sicherheitskonzept, 18 Punkte) ab und verbindet sie mit dem [Datenmodell](06-datenmodell.md), dem [Sync-Konzept](04-sync.md), der [Architektur](05-architektur.md) und dem [Compliance-Modul](08-compliance.md).

Leitprinzip: **local-first, keine Cloud-Pflicht, keine Telemetrie im Standard.** Der Nutzer bleibt jederzeit Herr seiner Daten. Der optionale selbst-gehostete Server ist ein Werkzeug des Nutzers, kein fremder Datenverarbeiter.

---

## 1. DSGVO-Konzept (SPEC §17)

Die folgende Tabelle bildet alle 25 Datenschutz-Anforderungen aus SPEC §17 auf konkrete Produktentscheidungen ab. Jede Anforderung ist verortet, als Standardverhalten, Opt-in-Funktion oder Bezug auf eine andere Doku-Datei.

| # | SPEC §17-Anforderung | Umsetzung im Produkt |
|---|---|---|
| 1 | Datenminimierung | Nur Felder erfassen, die für Zeiterfassung/Abrechnung nötig sind. Kein Auto-Tracking, keine Screenshots, kein GPS im Standard. Optionale Felder bleiben leer, wenn ungenutzt. Umsetzung von Art. 5 Abs. 1 lit. c DSGVO. |
| 2 | lokale Nutzung ohne Cloud | Lokaler Desktop-Modus voll funktionsfähig ohne Server, ohne Internet, ohne Registrierung (siehe [Betriebsarten](02-produkt.md)). SQLite auf dem Gerät. |
| 3 | keine Telemetrie im Standard | Kein Tracking, kein Crash-Reporting an Dritte, kein Analytics-Call ohne ausdrückliche Opt-in-Zustimmung. Standard = aus. |
| 4 | keine externe Analyse im Standard | Keine externen Dienste, keine Fremd-APIs im Standard. Alle Berechnungen laufen lokal im Core-Package. |
| 5 | klare Datenschutzhinweise | In-App-Datenschutzhinweis: welche Daten wo gespeichert werden, wer Verantwortlicher ist, welche Rechte bestehen. Verweis auf dieses Kapitel. |
| 6 | Export personenbezogener Daten | `settings`-gesteuerter DSGVO-Export als JSON aller personenbezogenen Daten (Art. 20, siehe Abschnitt 3). |
| 7 | Löschkonzept | Selektives und vollständiges Löschen (siehe Abschnitt 4), Aufbewahrungspflichten respektierend. |
| 8 | Aufbewahrungskonzept | Fristenmatrix ArbZG/AO/GoBD/HGB (siehe Abschnitt 2), Sperren statt Löschen bei laufender Frist. |
| 9 | Verschlüsselung beim Transport | TLS 1.2+ im Server-Modus verpflichtend; kein Sync-Traffic über Klartext. |
| 10 | lokale Verschlüsselung optional | SQLCipher-verschlüsselte lokale Datenbank optional aktivierbar (siehe Abschnitt 6). |
| 11 | sichere Sessions | HttpOnly-, Secure-, SameSite-Cookies; kurze Server-Session-Lebensdauer; Rotation; `sessions`-Tabelle mit Widerruf. |
| 12 | Zwei-Faktor-Authentifizierung im Server-Modus optional | TOTP-basierte 2FA optional pro Main Account (siehe Abschnitt 6). |
| 13 | Session-Übersicht | Liste aktiver Sessions mit Gerät, IP-Kürzel, letztem Zugriff; einzeln widerrufbar. |
| 14 | Geräte widerrufen | `devices.revoked`-Flag; widerrufenes Gerät verliert Sync-Rechte sofort (siehe [Sync](04-sync.md)). |
| 15 | API-Tokens widerrufen | `api_tokens`-Tabelle; Token sofort ungültig setzbar; nur Hash gespeichert. |
| 16 | Audit-Log | Revisionssicheres Protokoll kritischer Änderungen (`audit_logs`, 25 Events / 15 Felder, siehe [Datenmodell](06-datenmodell.md)). |
| 17 | keine automatische Screenshot-Überwachung im Standard | Bewusste Nicht-Funktion. Wird auch nicht als Opt-in angeboten, Abgrenzung zu TimeCamp/Timely (siehe [Recherche](01-recherche.md)). |
| 18 | kein invasives Mitarbeitertracking | Produkt ist Selbst-Erfassungs-Werkzeug für eine Hauptperson, kein Überwachungswerkzeug. Team-Erweiterung führt Rollen/Rechte ein, aber kein heimliches Tracking. |
| 19 | keine GPS-Pflicht | GPS niemals erzwungen. |
| 20 | GPS nur optional und bewusst aktivierbar | Falls je implementiert, striktes Opt-in pro Eintrag, kein Hintergrund-Standort. |
| 21 | IP-Logging minimieren | Server loggt IPs nur, soweit für Sicherheit/Abwehr nötig, gekürzt und kurz aufbewahrt; keine IP in Fach-Logs. |
| 22 | personenbezogene Daten als JSON exportieren | Vollständiger strukturierter JSON-Export (Art. 20 Datenportabilität), maschinenlesbar. |
| 23 | Datenbank-Backup verschlüsseln optional | Backups optional AES-256-verschlüsselt (siehe [Backup-Konzept](12-qualitaet.md)). |
| 24 | lokale Daten komplett löschen | „Alles löschen" entfernt lokale DB, Exporte, Anhänge, Backups nach Bestätigung; Aufbewahrungswarnung vorgeschaltet. |
| 25 | Server-Daten komplett exportieren | Vollständiger Server-Datenexport als JSON + Anhänge-ZIP für Portabilität/Migration/Selbst-Hosting-Umzug. |

---

## 2. Rechtsgrundlagen und Aufbewahrung

### 2.1 Rechtsgrundlagen der Verarbeitung

| Rechtsgrundlage | Norm | Anwendungsfall im Produkt |
|---|---|---|
| Vertragserfüllung | Art. 6 Abs. 1 lit. b DSGVO | Zeiterfassung zur Leistungsabrechnung gegenüber Kunden; Rechnungsstellung. |
| Rechtliche Verpflichtung | Art. 6 Abs. 1 lit. c DSGVO | Arbeitszeit-Aufzeichnungspflicht (BAG 13.09.2022, 1 ABR 22/21 i.V.m. §3 ArbSchG; EuGH C-55/18); steuerliche Aufbewahrung nach AO/HGB. |
| Beschäftigtenkontext | §26 BDSG | Falls die Erfassung Beschäftigtenverhältnisse betrifft (Team-Erweiterung); Verarbeitung für Zwecke des Beschäftigungsverhältnisses. |
| Privacy by Design / by Default | Art. 25 DSGVO | Datensparsame Voreinstellungen: keine Telemetrie, keine Screenshots, kein GPS, lokal-zuerst; datenschutzfreundliche Defaults werkseitig. |

Hinweis zur Rolle: Selbstständige, die ausschließlich eigene Arbeitszeit erfassen, unterliegen nicht dem ArbZG als Arbeitgeber. Das Produkt bietet das ArbZG-Profil dennoch als Standard, weil es der strengste relevante Maßstab ist und für spätere Team-Nutzung passt (siehe [Compliance](08-compliance.md)).

### 2.2 Aufbewahrungstabelle

Das Löschkonzept (Art. 17 DSGVO) wird durch gesetzliche Aufbewahrungspflichten eingeschränkt. Während einer laufenden Frist wird ein Datensatz **gesperrt statt gelöscht** (verarbeitungseingeschränkt, Art. 18 DSGVO), und erst nach Fristablauf tatsächlich gelöscht.

| Datenkategorie | Frist | Rechtsgrundlage |
|---|---|---|
| Arbeitszeit-Aufzeichnungen (Nachweis Beginn/Ende/Dauer inkl. Pausen) | **2 Jahre** | §16 Abs. 2 ArbZG |
| Buchungsbelege, abrechnungsrelevante Zeitdaten | **6 Jahre** | §147 Abs. 1 Nr. 4 i.V.m. Abs. 3 AO / GoBD |
| Handelsbriefe, empfangene/abgesandte geschäftliche Korrespondenz | **6 Jahre** | §257 Abs. 4 HGB / §147 AO |
| Rechnungen (Ausgangs-/Eingangsrechnungen), Bücher, Jahresabschlüsse, Inventare | **10 Jahre** | §147 Abs. 3 AO / §257 Abs. 4 HGB / GoBD |
| Sonstige steuerrelevante Unterlagen (Auffangfrist) | **8 Jahre** | §147 AO (Übergang; kürzere Fristen je nach Unterlagenart) |

Umsetzung technisch: jeder Datensatz mit Aufbewahrungspflicht trägt ein berechnetes Löschdatum bzw. eine Sperre. Der DSGVO-Löschlauf prüft je Datensatz die längste einschlägige Frist und löscht erst nach deren Ablauf. Rechnungen bleiben zusätzlich durch die Finalisierungs-Immutability geschützt (siehe [Abrechnung/Export](10-abrechnung-export.md)).

---

## 3. Betroffenenrechte → Feature-Mapping

Jedes Betroffenenrecht wird auf eine konkrete Produktfunktion abgebildet. Da im lokalen Modus der Nutzer selbst Verantwortlicher und Betroffener ist, sind diese Funktionen zugleich Selbstbedienungs-Werkzeuge.

| Recht | Norm | Umsetzung |
|---|---|---|
| Auskunft | Art. 15 DSGVO | DSGVO-JSON-Export (§17 Nr. 6/22) plus lesbare Übersicht aller Datenkategorien; nennt Zweck, Rechtsgrundlage, Aufbewahrungsfrist. |
| Berichtigung | Art. 16 DSGVO | Bearbeitung aller Stamm- und Zeitdaten mit `audit_logs`-Protokoll (before_json/after_json/reason); nachvollziehbare Korrektur ohne Datenverlust (siehe [Datenmodell](06-datenmodell.md)). |
| Löschung | Art. 17 DSGVO | Selektives + vollständiges Löschen (§17 Nr. 7/24), **eingeschränkt durch Aufbewahrungspflichten** (Abschnitt 2.2): gesperrte Datensätze werden erst nach Fristablauf physisch entfernt; Soft-Delete via `deleted_at`, Hard-Delete nach Frist. |
| Datenübertragbarkeit | Art. 20 DSGVO | Strukturierter, maschinenlesbarer JSON-Export aller personenbezogenen Daten + Anhänge-ZIP (§17 Nr. 22/25); gängiges Format zur Migration. |
| Einschränkung | Art. 18 DSGVO | Sperr-Status während laufender Aufbewahrungsfrist (verarbeitungseingeschränkt statt gelöscht). |
| Datenminimierung (Grundsatz) | Art. 5 Abs. 1 lit. c DSGVO | Sparsame Defaults, optionale Felder leer, keine invasive Erfassung. |

---

## 4. Löschkonzept im Detail

1. **Selektiv**: einzelne Kunden/Projekte/Einträge löschbar; Soft-Delete (`deleted_at`) für sync-pflichtige und auditpflichtige Entitäten, damit Löschungen synchronisiert und protokolliert werden.
2. **Aufbewahrungssperre**: vor jedem Hard-Delete prüft der Löschlauf die Fristenmatrix (Abschnitt 2.2). Ist eine Frist offen, wird der Datensatz gesperrt und mit Löschdatum versehen, statt gelöscht.
3. **Vollständig lokal** (§17 Nr. 24): „Alles löschen" entfernt lokale DB, Export-Dateien, Anhänge und lokale Backups, nach expliziter Bestätigung und Aufbewahrungswarnung.
4. **Vollständig Server** (§17 Nr. 25): Server-Datenexport vor Löschung anbieten; danach kaskadierendes Löschen inkl. Sessions, Tokens, Geräte-Verknüpfungen.
5. **Audit**: jede Löschung erzeugt einen `audit_logs`-Eintrag (Aktion, Grund, Zeitpunkt), sofern nicht die Löschung selbst den Audit-Datensatz erfasst (Audit-Log unterliegt eigener Aufbewahrung).

---

## 5. Sicherheitskonzept (SPEC §29)

Die folgende Tabelle deckt alle 18 Sicherheitsanforderungen aus SPEC §29 ab.

| # | SPEC §29-Anforderung | Umsetzung |
|---|---|---|
| 1 | sichere lokale Datenbank, optional verschlüsselt | SQLite + optional **SQLCipher** (AES-256, seitenweise Verschlüsselung); Schlüssel aus App-Passwort via Argon2id abgeleitet (siehe Abschnitt 6). |
| 2 | App-Sperre optional | App-Lock optional: App-Passwort oder Betriebssystem-Biometrie (Einschränkung macOS siehe Abschnitt 6.1). |
| 3 | sichere Passwörter im Server-Modus | Passwort-Hashing mit **Argon2id** (memory-hard); Mindestlänge/Policy; kein Klartext, keine reversible Speicherung. |
| 4 | Passkeys optional | WebAuthn/Passkeys (FIDO2) optional als phishing-resistenter Login im Server-Modus. |
| 5 | Zwei-Faktor-Authentifizierung optional | **TOTP** (RFC 6238) optional; Recovery-Codes einmalig, gehasht gespeichert. |
| 6 | sichere Cookies | HttpOnly, Secure, SameSite=Lax/Strict; kein Session-Token im localStorage. |
| 7 | TLS im Server-Modus | TLS 1.2+ verpflichtend; HSTS empfohlen; Setup-Wizard weist auf Zertifikat (z. B. via Reverse-Proxy) hin. |
| 8 | CSRF-Schutz | Anti-CSRF-Token bzw. SameSite-Cookies + Origin-Prüfung für zustandsändernde Requests. |
| 9 | XSS-Schutz | Ausgabe-Escaping durch das Framework (React/Next.js), Content-Security-Policy, keine `dangerouslySetInnerHTML` mit Nutzerdaten. |
| 10 | SQL-Injection-Schutz | Ausschließlich parametrisierte Queries über **Drizzle ORM**; keine String-Konkatenation von SQL (siehe [Architektur](05-architektur.md)). |
| 11 | serverseitige Rechteprüfung | Autorisierung serverseitig pro Request auf `main_account_id`/`device`-Ebene; Client-Prüfungen sind nur UX, nie Sicherheitsgrenze. |
| 12 | sichere Datei-Uploads | Whitelist der MIME-Typen/Endungen, Größenlimit, kein ausführbarer Inhalt, Speicherung außerhalb des Web-Roots bzw. S3-kompatibel; Virencheck optional. |
| 13 | keine sensiblen Daten in Logs | Kein Passwort/Token/personenbezogener Klartext in Logs; strukturierte Redaction; IP-Logging minimiert (§17 Nr. 21). |
| 14 | Backup-Verschlüsselung optional | Backups optional AES-256-verschlüsselt; Schlüssel nicht mit Backup gespeichert (siehe [Qualität/Backup](12-qualitaet.md)). |
| 15 | API-Rate-Limiting | Rate-Limits pro Token/IP auf Auth- und Sync-Endpunkten; Schutz gegen Brute-Force und Sync-Flooding. |
| 16 | Geräte widerrufen | `devices.revoked` sperrt Sync/Live-Kanal sofort; Re-Pairing nötig (siehe [Sync](04-sync.md)). |
| 17 | Sessions widerrufen | Session-Übersicht mit Einzel- und Sammelwiderruf; Server-seitige Invalidierung, nicht nur Client-Löschung. |
| 18 | API-Tokens widerrufen | `api_tokens` nur als Hash gespeichert; sofort widerrufbar; Scope/Ablaufdatum optional. |

### Authentifizierungs-Stack (Server-Modus)

- **Passwort**: Argon2id-Hash (Salt pro Nutzer, memory-hard Parameter). Niemals SHA-/bcrypt-Downgrade, niemals Klartext.
- **Passkeys**: optional als primärer oder zusätzlicher Faktor (WebAuthn), phishing-resistent.
- **2FA**: optional TOTP als zweiter Faktor; Recovery-Codes gehasht.
- **Tokens/Secrets**: als UUIDv4 erzeugt (nicht UUIDv7, um Zeitkorrelation zu vermeiden), nur als Hash persistiert (siehe [Architektur](05-architektur.md)).

---

## 6. Lokale Sicherheit und Plattform-Einschränkungen

### 6.1 macOS-Einschränkung: Tauri-Biometric-Plugin nur iOS/Android

Recherchierter Fakt (Stand Juli 2026): Das **Tauri-Biometric-Plugin unterstützt nur iOS und Android**. **Touch ID auf macOS ist über dieses Plugin NICHT verfügbar.**

Folgen für den App-Lock auf macOS:

- **Option A, App-Passwort**: plattformunabhängiger App-Lock über ein lokales App-Passwort (Argon2id-abgeleiteter Schlüssel). Immer verfügbar, auch auf Windows.
- **Option B, LocalAuthentication über eigenen Rust-Command**: Touch ID / Face ID auf macOS über das native **LocalAuthentication**-Framework, angebunden via eigenem Tauri-Rust-Command (kein Plugin). Fällt bei Nichtverfügbarkeit auf das App-Passwort zurück.

Auf **iOS** wird die Face-ID-/Touch-ID-Sperre regulär über das Biometric-Plugin bzw. native Module realisiert (siehe [UI/Apps](11-ui-apps.md)). Windows nutzt das App-Passwort (Windows-Hello-Anbindung optional als spätere Erweiterung).

### 6.2 Verschlüsselte lokale Datenbank

- **SQLCipher** optional aktivierbar: transparente AES-256-Verschlüsselung der SQLite-Datei.
- Schlüsselableitung aus dem App-Passwort mit **Argon2id**; der Schlüssel liegt nie im Klartext auf der Platte.
- Ohne App-Passwort/Biometrie kein Zugriff auf die verschlüsselte DB.
- Backups der verschlüsselten DB bleiben verschlüsselt; optionale zusätzliche Backup-Verschlüsselung (§29 Nr. 14).

### 6.3 Datensparsamkeit im lokalen Betrieb

Im lokalen Desktop-Modus verlassen keine Daten das Gerät: keine Telemetrie, keine externen Calls, kein IP-Logging. Der Sync-Kanal existiert nur, wenn der Nutzer bewusst einen eigenen Server verbindet, und dann ausschließlich TLS-verschlüsselt zu einem Server, den der Nutzer selbst kontrolliert.

---

## 7. Zusammenspiel mit anderen Kapiteln

- **[Datenmodell](06-datenmodell.md)**: `audit_logs`, `sessions`, `api_tokens`, `devices`, Soft-Delete-Felder, Sync-Meta.
- **[Sync](04-sync.md)**: Geräte-/Session-Widerruf, TLS-Transport, Konflikt-Audit.
- **[Compliance](08-compliance.md)**: ArbZG-Aufbewahrung (2 Jahre), Rechtsgrundlage Art. 6 Abs. 1 lit. c.
- **[Abrechnung/Export](10-abrechnung-export.md)**: Rechnungs-Aufbewahrung (10 Jahre), Finalisierungs-Immutability, DSGVO-/Datenexport-Formate.
- **[Qualität/Backup](12-qualitaet.md)**: verschlüsselte Backups, Restore, Integritätsprüfung.

Datenschutz und Sicherheit sind damit keine isolierten Kapitel, sondern durchziehen Datenmodell, Sync, Compliance und Abrechnung als Querschnittsanforderung, mit datensparsamen Defaults als Ausgangspunkt (Privacy by Default, Art. 25 DSGVO).
