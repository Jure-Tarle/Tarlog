# Abrechnung, Rechnung, Export, Reports & Import

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Diese Datei deckt die kaufmännische Kern-Domäne des Tarlog ab: Kunden- und Projektstammdaten, Aufgaben, die vier Abrechnungsmodelle mit deterministischer Raten-Auflösung, das revisionsfähige Rechnungsmodul (inkl. §14-UStG-Pflichtangaben, Kleinunternehmer §19 UStG, Reverse Charge §13b UStG), die Export-Pipeline (fünf Formate, sieben PDF-Varianten), die Reports und den Import-Assistenten.

Querverweise: Datenmodell und Snapshot-Felder in [Datenmodell](06-datenmodell.md); getrennte `actual_duration_seconds`/`billing_duration_seconds` und Rundung in [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md); Compliance-Hinweise in [Compliance](08-compliance.md); Aufbewahrungsfristen für Rechnungen in [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md); Timer/Nachtrag in [Zeiterfassung](03-zeiterfassung.md).

---

## 1. Kundenverwaltung (SPEC §9)

Ein Kunde (`customers`) bündelt Stammdaten und liefert die Standardwerte, aus denen Projekte, Zeiteinträge und Rechnungen ihre Defaults ableiten. Alle Geld-Defaults werden als Integer minor units geführt (`amount_cents BIGINT` + `currency CHAR(3)`, ISO 4217), nie als Float. Ein Kunde ist Sync-pflichtig, Audit-pflichtig und Soft-Delete-fähig (Status `archiviert`).

| # | Feld | `column` | Typ | Hinweis |
|---|------|----------|-----|---------|
| 1 | Name | `name` | TEXT | Anzeigename, Pflicht |
| 2 | Firma | `company_name` | TEXT | juristischer Name für Rechnung |
| 3 | Ansprechpartner | `contact_person` | TEXT | |
| 4 | E-Mail | `email` | TEXT | für E-Mail-Entwurf/E-Rechnung |
| 5 | Telefonnummer | `phone` | TEXT | |
| 6 | Rechnungsadresse | `billing_address` | JSON | strukturiert (Straße, PLZ, Ort, Land) |
| 7 | Lieferadresse optional | `shipping_address` | JSON NULL | |
| 8 | Umsatzsteuer-ID optional | `vat_id` | TEXT NULL | USt-IdNr., Voraussetzung Reverse Charge |
| 9 | Kundennummer | `customer_number` | TEXT | eindeutig je Main Account |
| 10 | Zahlungsziel | `payment_term_days` | INTEGER | Tage, Default z. B. 14 |
| 11 | Standard-Währung | `default_currency` | CHAR(3) | ISO 4217 |
| 12 | Standard-Stundensatz | `default_hourly_rate_cents` | BIGINT | Ausgangswert Raten-Auflösung |
| 13 | Standard-Tagessatz | `default_day_rate_cents` | BIGINT | |
| 14 | Standard-Rundungsregel | `default_rounding_rule_id` | UUID FK | → `rounding_rules` |
| 15 | Standard-Rechnungsnotiz | `default_invoice_note` | TEXT | Fußtext auf Rechnung |
| 16 | Standard-Sprache | `default_language` | TEXT | de/en, steuert PDF-Sprache |
| 17 | Kundenspezifische PDF-Vorlage | `pdf_template_id` | UUID NULL | Nachweis-Layout |
| 18 | Kundenspezifische Rechnungsvorlage | `invoice_template_id` | UUID NULL | |
| 19 | Interne Notizen | `internal_notes` | TEXT | nie im Kundenexport |
| 20 | Externe Notizen | `external_notes` | TEXT | für Kundenreports sichtbar |
| 21 | Status aktiv/pausiert/archiviert | `status` | ENUM | `active`/`paused`/`archived` |
| 22 | Standard-Steuersatz | `default_tax_rate` | NUMERIC | z. B. 19.0, 7.0, 0.0 |
| 23 | Reverse-Charge-Hinweis optional | `reverse_charge_hint` | BOOLEAN | §13b, Auslands-B2B |
| 24 | Kleinunternehmer-Hinweis optional | `small_business_hint` | BOOLEAN | §19 UStG des Leistenden |
| 25 | Bevorzugte Export-Detailtiefe | `preferred_export_detail` | ENUM | `summary`/`detailed`/`full` |

---

## 2. Projektverwaltung (SPEC §10)

Ein Projekt (`projects`) gehört genau einem Kunden, trägt die konkrete Abrechnungsart und überschreibt die Kunden-Defaults. Budget-Warnschwellen speisen den Budgetreport. Projekte sind Sync-, Audit- und Soft-Delete-pflichtig.

| # | Feld | `column` | Typ | Hinweis |
|---|------|----------|-----|---------|
| 1 | Projektname | `name` | TEXT | Pflicht |
| 2 | Kunde | `customer_id` | UUID FK | → `customers` |
| 3 | Beschreibung | `description` | TEXT | |
| 4 | Projektstatus | `status` | ENUM | `planned`/`active`/`paused`/`completed`/`archived` |
| 5 | Projektcode | `project_code` | TEXT | kurzes Kürzel |
| 6 | Projektfarbe | `color` | TEXT | Kalender-/UI-Kodierung |
| 7 | Startdatum | `start_date` | DATE | |
| 8 | Enddatum optional | `end_date` | DATE NULL | |
| 9 | Abrechnungsart | `billing_type` | ENUM | `hourly`/`day_rate`/`fixed_fee`/`retainer`/`non_billable` |
| 10 | Stundensatz | `hourly_rate_cents` | BIGINT NULL | überschreibt Kunde |
| 11 | Tagessatz | `day_rate_cents` | BIGINT NULL | |
| 12 | Festpreis | `fixed_fee_cents` | BIGINT NULL | → `fixed_fee_contracts` |
| 13 | Retainer | `retainer_id` | UUID FK NULL | → `fixed_fee_contracts` (`type = retainer`); Pauschale/enthaltene Stunden liegen im Vertrag, nicht am Projekt |
| 14 | Budget in Stunden | `budget_hours` | NUMERIC NULL | |
| 15 | Budget in Geld | `budget_amount_cents` | BIGINT NULL | |
| 16 | Budget-Warnschwellen | `budget_thresholds` | JSON | z. B. `[0.75, 0.9, 1.0]` |
| 17 | Geplante Stunden | `planned_hours` | NUMERIC | Soll |
| 18 | Tatsächliche Stunden | `actual_hours` | NUMERIC | aggregiert (Cache) |
| 19 | Abrechenbare Stunden | `billable_hours` | NUMERIC | aggregiert |
| 20 | Nicht abrechenbare Stunden | `non_billable_hours` | NUMERIC | aggregiert |
| 21 | Rundungsregel | `rounding_rule_id` | UUID FK NULL | überschreibt Kunde |
| 22 | Standard-Aufgabe | `default_task_id` | UUID FK NULL | → `tasks` |
| 23 | Erlaubte Aufgaben | `allowed_task_ids` | JSON | Whitelist |
| 24 | Pflicht-Tags | `required_tags` | JSON | Validierung beim Stoppen |
| 25 | Pflicht-Beschreibung | `description_required` | ENUM | `always`/`billable_only`/`never` |
| 26 | Nachtrag erlaubt j/n | `manual_entry_allowed` | BOOLEAN | |
| 27 | Nachtrag-Begründung Pflicht j/n | `manual_entry_reason_required` | BOOLEAN | |
| 28 | Maximale rückwirkende Bearbeitung in Tagen | `max_backdate_days` | INTEGER NULL | Sperre für Alt-Einträge |
| 29 | Interne Notizen | `internal_notes` | TEXT | |
| 30 | Externe Beschreibung für Kundenreports | `external_description` | TEXT | |
| 31 | Rechnungsvorlage | `invoice_template_id` | UUID NULL | überschreibt Kunde |
| 32 | Exportvorlage | `export_template_id` | UUID NULL | |
| 33 | Projektarchiv | `archived_at` | INTEGER NULL | epoch-ms, Soft-Delete-Marker |

---

## 3. Aufgaben und Tätigkeitsarten (SPEC §11)

Aufgaben (`tasks`) können global oder projektbezogen sein (`project_id` NULL = global). Sie liefern optionale eigene Sätze und Beschreibungsvorlagen und sind Bestandteil der Raten-Auflösung.

### 3.1 Standard-Katalog (20 Beispiele)

Entwicklung, Beratung, Design, Projektmanagement, Meeting, Recherche, Testing, Bugfixing, Dokumentation, Support, E-Mail-Kommunikation, Administration, Reisezeit, Onboarding, Code Review, Deployment, Konzeptarbeit, Strategie, Kundenabstimmung, nicht abrechenbare Organisation.

Der Katalog wird beim Anlegen des Main Accounts als Vorlage angeboten; jede Aufgabe ist danach frei editier- und archivierbar.

### 3.2 Aufgaben-Felder (10)

| # | Feld | `column` | Typ | Hinweis |
|---|------|----------|-----|---------|
| 1 | Name | `name` | TEXT | Pflicht |
| 2 | Beschreibung | `description` | TEXT | |
| 3 | Standard abrechenbar j/n | `default_billable` | BOOLEAN | z. B. „nicht abrechenbare Organisation" = false |
| 4 | Standard-Stundensatz optional | `default_hourly_rate_cents` | BIGINT NULL | höchste Priorität Raten-Auflösung |
| 5 | Standard-Tagessatz optional | `default_day_rate_cents` | BIGINT NULL | |
| 6 | Standard-Beschreibungsvorlage | `description_template` | TEXT | Vorbelegung Stop-Dialog |
| 7 | Kostenstelle optional | `cost_center` | TEXT NULL | Steuerberater-Export |
| 8 | Farbe | `color` | TEXT | |
| 9 | Aktiv/archiviert | `status` | ENUM | `active`/`archived` |
| 10 | Sortierung | `sort_order` | INTEGER | UI-Reihenfolge |

---

## 4. Abrechnungsmodelle (SPEC §13.1,13.4)

Alle Berechnungen liegen als pure functions im Core-Package (siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md)) und arbeiten deterministisch mit `calculation_version`. Grundsatz: die abrechenbare Zeit wird aus der gerundeten `billing_duration_seconds` berechnet, nie aus `actual_duration_seconds`, die tatsächliche Arbeitszeit bleibt unverändert erhalten.

### 4.0 Raten-Auflösungsreihenfolge (verbindlich)

Der zur Anwendung kommende Stunden- bzw. Tagessatz wird deterministisch in dieser Reihenfolge aufgelöst, der erste nicht-leere, für das `effective_date` gültige Wert gewinnt:

```
Aufgabe > Projekt > Kunde > Default (Main-Account-Setting)
```

Ergänzend gilt die zeitliche Dimension: aus `billing_rates` wird der zum Leistungsdatum (`effective_date`) gültige, historisierte Satz gewählt (`valid_from ≤ Datum < valid_until`). Eine manuelle Überschreibung am Eintrag/Posten schlägt die gesamte Kette, erfordert aber eine Begründung (`rounding_reason`/`override_reason`) und einen Audit-Eintrag `Stundensatz geändert`. Der aufgelöste Satz wird als `rate_snapshot` am Zeiteintrag eingefroren.

### 4.1 Stundensatz (`hourly`)

Funktionen (8): (1) Stundensatz pro Kunde, (2) pro Projekt, (3) pro Aufgabe, (4) pro Datum (historisiert über `billing_rates.valid_from/valid_until`), (5) historisierte Stundensätze, (6) Snapshot bei Zeiteintrag (`rate_snapshot`), (7) Snapshot bei Rechnung (Posten friert Satz erneut ein), (8) manuelle Überschreibung mit Begründung + Audit-Log.

Berechnung: `billing_amount_cents = round_half_even( billing_duration_seconds / 3600 * rate_cents )`. Ergebnis wird als `billing_amount_snapshot` gespeichert.

### 4.2 Tagessatz (`day_rate`, Tabelle `day_rate_rules`)

Funktionen (10): (1) voller Tag ab X Stunden, (2) halber Tag ab X Stunden, (3) Mindestabrechnung halber Tag, (4) Mindestabrechnung voller Tag, (5) Tagessatz pro Kunde, (6) pro Projekt, (7) pro Aufgabe, (8) pro Zeitraum (historisiert), (9) Zusatzstunden nach vollem Tag optional (fällt auf Stundensatz zurück), (10) nachvollziehbare Berechnung.

Regelmodell (`day_rate_rules`): `full_day_from_hours`, `half_day_from_hours`, `min_billing` (`half`/`full`), `extra_hours_mode` (`none`/`hourly`). Beispiel: 5,5 h Netto bei `half_day_from_hours=4`, `full_day_from_hours=8` → halber Tag; 8,5 h → voller Tag + 0,5 h Zusatzstunden zum Stundensatz, sofern `extra_hours_mode=hourly`. Die Herleitung (Netto-Stunden → Klassifikation → Betrag) wird als Berechnungsspur im Report und PDF ausgewiesen.

### 4.3 Festpreis (`fixed_fee`, Tabelle `fixed_fee_contracts`)

Funktionen (10): (1) Festpreis definieren, (2) Budgetstunden definieren, (3) interner kalkulatorischer Stundensatz, (4) Ist-Aufwand gegen Budget, (5) Marge berechnen, (6) Change Requests, (7) Meilensteine, (8) Teilrechnungen, (9) Abschlussrechnung, (10) Zusatzaufwand nach Stunden abrechnen.

Marge = `fixed_fee_cents − (actual_billable_hours × internal_rate_cents)`. Meilensteine tragen je einen Fälligkeitsanteil (Teilrechnung); die Summe der Teilrechnungen darf den Festpreis + genehmigte Change Requests nicht überschreiten, die letzte ist die Abschlussrechnung. Change Requests erhöhen `fixed_fee_cents` versioniert und werden separat als Posten aufgeführt. Der Profitabilitätsreport zieht diese Werte.

### 4.4 Retainer (`retainer`, Tabelle `fixed_fee_contracts` mit `type = retainer`)

Ein Retainer wird als Vertrag in `fixed_fee_contracts` (`type = retainer`) modelliert; das Projekt verweist über `retainer_id` (Feld 13) darauf. Pauschale und enthaltene Stunden liegen im Vertrag, nicht am Projekt.

Funktionen (7): (1) monatliche Pauschale, (2) enthaltene Stunden, (3) Übertrag nicht genutzter Stunden optional (`carryover`), (4) Verfall nicht genutzter Stunden optional (`expiry`), (5) Zusatzstunden nach Stundensatz, (6) Retainer-Report, (7) monatliche Rechnung.

Pro Periode: `included_hours` gegen verbrauchte abrechenbare Stunden. Rest → je Konfiguration `carryover` (in Folgeperiode übertragen) oder `expiry` (verfällt). Überschreitung → Zusatzstunden zum aufgelösten Stundensatz als eigener Posten. Die monatliche Rechnung enthält die Pauschale plus etwaige Zusatzstunden; der Retainer-Report zeigt Soll/Ist/Übertrag/Verfall je Monat.

---

## 5. Rechnungsmodul (SPEC §19)

Das Rechnungsmodul ist revisionsfähig: finalisierte Rechnungen sind unveränderlich (Immutability), Korrekturen laufen ausschließlich über Storno oder eine neue Version. Alle für die Rechnung relevanten Stammdaten werden zum Finalisierungszeitpunkt als Snapshot eingefroren, sodass spätere Stammdatenänderungen alte Rechnungen nicht verändern. Rechnungen sind steuerrelevant und unterliegen der 10-jährigen Aufbewahrung (siehe [Datenschutz & Sicherheit](09-datenschutz-sicherheit.md)); Löschung ist während der Frist gesperrt.

### 5.1 Funktionen (alle 29)

| # | Funktion | Umsetzung |
|---|----------|-----------|
| 1 | Rechnung aus Zeiteinträgen | `invoice_time_entries` verknüpft Einträge; billable + nicht fakturiert |
| 2 | Rechnung aus Tagessätzen | Posten aus `day_rate_rules`-Klassifikation |
| 3 | Rechnung aus Festpreis | Posten aus `fixed_fee_contracts` / Meilenstein |
| 4 | Rechnung aus Retainer | monatliche Pauschale + Zusatzstunden |
| 5 | Teilrechnung | `invoice_type = partial`, referenziert Vertrag/Meilenstein |
| 6 | Schlussrechnung | `invoice_type = final`, verrechnet Teilrechnungen |
| 7 | Storno | `invoice_type = cancellation` mit `cancels_invoice_id` |
| 8 | Gutschrift optional | `invoice_type = credit_note` |
| 9 | Rechnungsnummernkreis | `invoice_number_sequences` je Kreis/Jahr |
| 10 | Fortlaufende Rechnungsnummern | lückenlos, erst bei Finalisierung vergeben |
| 11 | Zahlungsziel | `due_date` aus `payment_term_days` |
| 12 | Zahlungsstatus | `payment_status`: `open`/`partial`/`paid`/`overdue` |
| 13 | Mahnstatus optional | `dunning_level` INTEGER |
| 14 | Leistungszeitraum | `service_period_start/end` |
| 15 | Leistungsdatum | `service_date` (§14-pflichtig) |
| 16 | Kunden-Snapshot | `customer_snapshot` JSON eingefroren |
| 17 | Projekt-Snapshot | `project_snapshot` JSON |
| 18 | Stundensatz-Snapshot | je Posten `rate_snapshot` |
| 19 | Rundungsregel-Snapshot | `rounding_snapshot` |
| 20 | Rechnung finalisieren | Übergang `draft → finalized`, Nummer + Snapshots |
| 21 | Finalisierte Rechnung sperren | Immutability, DB-Constraint + App-Guard |
| 22 | Korrektur nur über Storno oder neue Version | keine In-Place-Änderung nach `finalized` |
| 23 | PDF-Rechnung | pdfmake-Pipeline, Variante „Rechnung" |
| 24 | PDF-Rechnungsanlage | Leistungsnachweis als Anlage (PDF-Variante 3) |
| 25 | E-Mail-Entwurf optional | `.eml`/Draft, kein Versand im Standard |
| 26 | Umsatzsteuer | Steuersatz-Gruppierung, Steuerbetrag je Satz |
| 27 | Kleinunternehmer-Hinweis optional | §19 UStG, siehe 5.4 |
| 28 | Reverse-Charge-Hinweis optional | §13b UStG, siehe 5.5 |
| 29 | Mehrere Währungen optional | Posten in Beleg-Währung, keine Auto-Konvertierung |

### 5.2 Rechnungsposten (`invoice_items`, alle 7 Postenarten)

| Postenart | `item_type` | Herkunft |
|-----------|-------------|----------|
| Stundenposition | `hours` | Zeiteinträge × aufgelöster Stundensatz |
| Tagessatzposition | `day_rate` | Tagesklassifikation |
| Festpreisposition | `fixed_fee` | Vertrag/Meilenstein |
| Pauschale | `flat_fee` | Retainer / freie Pauschale |
| Rabatt | `discount` | negativer Betrag, prozentual oder absolut |
| Auslage optional | `expense` | durchlaufende Kosten |
| Reisekosten optional | `travel` | Kilometer/Beleg |

Jeder Posten trägt Menge, Einzelpreis (`unit_price_cents`), Steuersatz, Netto-, Steuer- und Bruttobetrag sowie den eingefrorenen `rate_snapshot`.

### 5.3 §14-UStG-Pflichtangaben

Pflichtangaben nach §14 Abs. 4 UStG, je Feld die Datenquelle:

| # | Pflichtangabe (§14 Abs. 4) | Rechnungsfeld / Quelle |
|---|----------------------------|------------------------|
| 1 | Vollständiger Name + Anschrift des Leistenden | Main-Account-Stammdaten (Aussteller) |
| 2 | Vollständiger Name + Anschrift des Leistungsempfängers | `customer_snapshot.company_name` + `billing_address` |
| 3 | Steuernummer oder USt-IdNr des Leistenden | Aussteller-Settings |
| 4 | Rechnungsdatum (Ausstellungsdatum) | `issue_date` |
| 5 | Fortlaufende, einmalige Rechnungsnummer | `invoice_number` aus Nummernkreis |
| 6 | Menge und Art der Leistung | Posten: `quantity` + `description` |
| 7 | Zeitpunkt der Leistung/Lieferung | `service_date` bzw. `service_period_start/end` |
| 8 | Entgelt, aufgeschlüsselt nach Steuersätzen | Netto je `tax_rate`-Gruppe |
| 9 | Anzuwendender Steuersatz + Steuerbetrag | je Gruppe `tax_rate` + `tax_amount_cents` |
| 10 | Ggf. Hinweis auf Steuerbefreiung | §19- bzw. §13b-Hinweistext (5.4/5.5) |

### 5.4 Kleinunternehmer §19 UStG

Ist `small_business_hint` (Aussteller) gesetzt, weist die Rechnung keine Umsatzsteuer aus (`tax_rate = 0`) und trägt den Pflichthinweis auf die Kleinunternehmerregelung samt Grund für die fehlende USt. Formulierungsvorlage (Neuregelung seit 01.01.2025): „Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung)." Der Steuerbetrag entfällt, das Entgelt entspricht dem Bruttobetrag.

### 5.5 Reverse Charge §13b UStG

Ist `reverse_charge_hint` am Kunden gesetzt (typisch B2B ins EU-Ausland mit gültiger `vat_id`), schuldet der Leistungsempfänger die Steuer. Die Rechnung enthält `tax_rate = 0`, die USt-IdNr. beider Parteien und den Pflichthinweis nach §14a Abs. 5 UStG: „Steuerschuldnerschaft des Leistungsempfängers." Kein Steuerbetrag auf dem Beleg.

### 5.6 Nummernkreis, Finalisierung, Immutability, Storno

- **Nummernkreis**: `invoice_number_sequences` je konfiguriertem Kreis (z. B. pro Jahr `RE-2026-####`). Die fortlaufende, lückenlose Nummer wird atomar erst im Moment der Finalisierung vergeben, Entwürfe (`draft`) haben keine finale Nummer. Damit bleibt die Nummernfolge lückenlos auch bei verworfenen Entwürfen.
- **Finalisierung**: Übergang `draft → finalized` friert Nummer, alle Snapshots (Kunde, Projekt, Stundensatz, Rundungsregel), Beträge und Steuer ein. Audit-Events `Rechnung erstellt` und `Rechnung finalisiert`.
- **Immutability / Sperre**: nach `finalized` ist die Rechnung schreibgeschützt (DB-Trigger/Constraint gegen UPDATE der Kernfelder + App-Guard). Kein In-Place-Edit.
- **Storno**: eine finalisierte Rechnung wird nie gelöscht; Korrektur erfolgt über eine Storno-Rechnung (`invoice_type = cancellation`, `cancels_invoice_id`) mit negiertem Betrag oder über eine neue Version. Audit-Event `Rechnung storniert`. So bleibt die Historie revisionsfähig.

### 5.7 E-Rechnung (V2-Vorbereitung)

Seit 2025 ist der Empfang strukturierter B2B-Rechnungen (EN 16931) Pflicht; Kleinbeträge und Kleinunternehmer sind ausgenommen. V1 liefert PDF und bereitet den Export als **XRechnung** und **ZUGFeRD ≥2.0.1** (ohne MINIMUM/BASIC-WL-Profile) für V2 vor, das Datenmodell hält bereits alle EN-16931-Pflichtfelder (siehe §14-Tabelle). Diese bewusste Entscheidung (E-Rechnung erst V2) ist im [README](README.md) gekennzeichnet.

---

## 6. Exporte (SPEC §18)

### 6.1 Formate (5)

| Format | Zweck |
|--------|-------|
| PDF | Arbeitszeitnachweise, Rechnungen, Reports (pdfmake, optional Playwright) |
| CSV | Rohdaten für Tabellenkalkulation/Steuerberater |
| XLSX | strukturierte Mappen mit Formeln/Summen |
| JSON | verlustfreier Daten-/DSGVO-Export |
| ZIP-Archiv mit Anhängen optional | Bundle aus PDFs + Belegen + JSON |

Jeder Export erzeugt einen Eintrag in `exports`/`export_files` mit eindeutiger Exportnummer und Audit-Event `Export erstellt`.

### 6.2 Arbeitszeit-PDF, alle 38 Inhalte

Kopf/Metadaten: (1) Titel, (2) Logo, (3) Name des Nutzers, (4) Unternehmen optional, (5) Kunde, (6) Projekt, (7) Zeitraum, (8) Erstellungsdatum, (9) eindeutige Exportnummer, (10) Zeitzone, (11) Filterkriterien.

Summenblock: (12) tatsächliche Gesamtarbeitszeit, (13) Pausenzeit, (14) Nettoarbeitszeit, (15) gerundete Abrechnungszeit, (16) abrechenbarer Betrag, (17) nicht abrechenbare Zeit.

Einträge-Tabelle: (18) Tabelle aller Einträge mit Spalten (19) Datum, (20) Startzeit, (21) Endzeit, (22) Pausen, (23) Nettozeit, (24) Abrechnungszeit, (25) Projekt, (26) Aufgabe, (27) Beschreibung, (28) interne Notiz (optional ausgeblendet), (29) Tags, (30) abrechenbar j/n, (31) Stundensatz, (32) Betrag, (33) Nachtrag j/n, (34) Nachtragsgrund, (35) Compliance-Hinweise.

Fuß: (36) Seitenzahlen, (37) Prüfsumme optional, (38) Unterschriftsfeld optional.

Der Nachweis führt tatsächliche Arbeitszeit (Nettozeit, Punkt 14) und gerundete Abrechnungszeit (Punkt 15/24) getrennt aus, Details siehe [Zeitberechnung & Rundung](07-zeitberechnung-rundung.md).

### 6.3 PDF-Varianten (7)

| # | Variante | Interne Notizen | Beträge | Compliance |
|---|----------|-----------------|---------|-----------|
| 1 | Interner Arbeitszeitnachweis | sichtbar | ja | ja |
| 2 | Kundenreport | ausgeblendet | konfigurierbar | nein |
| 3 | Rechnungsanlage | ausgeblendet | ja (fakturiert) | nein |
| 4 | Compliance Report |, | nein | ja (Verstöße/Overrides) |
| 5 | Steuerberater-Export | ausgeblendet | ja + Kostenstelle | nein |
| 6 | Detaillierter Tagesbericht | wählbar | ja | ja |
| 7 | Zusammengefasster Monatsbericht | ausgeblendet | Summen | Zusammenfassung |

### 6.4 PDF-Pipeline

**Hybrid** gemäß festgelegter Entscheidung: `pdfmake` (JSON-deklarativ) ist der portable Kern und läuft lokal in Tauri ohne Chromium sowie serverseitig, geeignet für strukturierte Nachweise und Rechnungen. `Playwright/Chromium` ist optional serverseitig für pixelgenaue HTML-Templates und Charts. So funktioniert der reine Desktop-Modus offline ohne Chromium, während der Server bei Bedarf hochwertigere Layouts rendert. Details der Stack-Entscheidung in [Architektur](05-architektur.md).

---

## 7. Reports (SPEC §20)

### 7.1 Report-Katalog (alle 20)

| # | Report | Inhalt |
|---|--------|--------|
| 1 | Tagesreport | Einträge, Netto, Pausen, Compliance eines Tages |
| 2 | Wochenreport | Wochensummen, Tagesverteilung |
| 3 | Monatsreport | Monatssummen, Umsatz, offene Zeit |
| 4 | Jahresreport | Jahresaggregation |
| 5 | Kundenreport | je Kunde: Zeit, Umsatz, offene Posten |
| 6 | Projektreport | je Projekt: Ist/Soll, Budget |
| 7 | Aufgabenreport | Zeit je Tätigkeitsart |
| 8 | Tag-Report | Auswertung nach Tags |
| 9 | Umsatzreport | abgerechneter Umsatz je Zeitraum |
| 10 | Budgetreport | Verbrauch gegen Budget, Warnschwellen |
| 11 | Profitabilitätsreport | Marge (v. a. Festpreis: Ist-Aufwand × interner Satz) |
| 12 | Nicht abgerechnete Zeiten | billable + nicht fakturiert |
| 13 | Abgerechnete Zeiten | in Rechnung enthalten |
| 14 | Nachgetragene Zeiten | `source = manual_backdated` |
| 15 | Korrigierte Zeiten | Einträge mit Korrektur-Historie |
| 16 | Unvollständige Zeiten | fehlende Beschreibung/Endzeit |
| 17 | Compliance Report | Verstöße, Overrides, Ruhezeit/Pausen |
| 18 | Pausenreport | Pausensummen, Pausenverstöße |
| 19 | Ruhezeitreport | Ruhezeit zwischen Arbeitstagen |
| 20 | Exporthistorie | alle erzeugten Exporte/PDFs |

### 7.2 Filter (alle 14)

(1) Zeitraum, (2) Kunde, (3) Projekt, (4) Aufgabe, (5) Tags, (6) abrechenbar, (7) nicht abrechenbar, (8) fakturiert, (9) nicht fakturiert, (10) nachgetragen, (11) korrigiert, (12) unvollständig, (13) Compliance-Status, (14) Beschreibung enthält.

Filter sind kombinierbar; die gewählten Filterkriterien werden im PDF-Kopf (Inhalt 11) mit ausgegeben, damit ein Nachweis reproduzierbar bleibt.

---

## 8. Import (SPEC §31)

### 8.1 Quellen (7)

CSV, XLSX, JSON, Toggl-Export (optional), Clockify-Export (optional), Harvest-Export (optional), Kimai-Export (optional). Für die vier Fremdtools liefert der Import vorkonfigurierte Spalten-Mappings; generisches CSV/XLSX/JSON nutzt manuelles Mapping.

### 8.2 Import-Assistent (alle 10 Schritte)

| # | Schritt | Funktion |
|---|---------|----------|
| 1 | Datei auswählen | Quelle + Format erkennen |
| 2 | Spalten zuordnen | Mapping auf `time_entries`-Felder; Fremdtool-Presets |
| 3 | Vorschau | erste N Zeilen normalisiert anzeigen |
| 4 | Fehler anzeigen | Validierung (Zod), fehlende Pflichtfelder, ungültige Zeiten |
| 5 | Duplikate erkennen | Match über Datum + Start/Ende + Projekt |
| 6 | Kunden automatisch erstellen optional | anlegen bei unbekanntem Kundennamen |
| 7 | Projekte automatisch erstellen optional | anlegen bei unbekanntem Projekt |
| 8 | Testimport | Dry-Run, keine Persistenz, nur Ergebnisbericht |
| 9 | Finaler Import | transaktional schreiben; importierte Einträge `source = imported` |
| 10 | Audit-Log | Audit-Event je Import mit Datei, Zeilenzahl, Ergebnis |

Importierte Zeiteinträge behalten ihre tatsächliche Zeit; Rundung/Abrechnung werden nach dem Import über die Core-Engine neu berechnet (`calculation_version`), damit `actual_duration_seconds` und `billing_duration_seconds` konsistent zum lokalen Regelwerk sind.

---

## Bewusste Entscheidungen (dokumentiert, nicht neu verhandelt)

- Geld ausschließlich als Integer minor units (`amount_cents BIGINT` + `currency CHAR(3)`), nie Float.
- Raten-Auflösung deterministisch: Aufgabe > Projekt > Kunde > Default, plus zeitliche Historisierung; aufgelöster Satz als `rate_snapshot` eingefroren.
- Rechnungen revisionsfähig: Finalisierung → Immutability, Korrektur nur via Storno/neue Version, lückenloser Nummernkreis erst bei Finalisierung.
- PDF-Pipeline hybrid: pdfmake als portabler Kern (lokal + Server), Playwright/Chromium optional serverseitig.
- E-Rechnung (ZUGFeRD/XRechnung) erst in V2; V1 hält bereits alle EN-16931-Pflichtfelder vor.
