# Compliance-Modul — Deutsches Arbeitszeitrecht und EU-Profil

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Kapitel beschreibt das Compliance-Modul von Tarlog: das deutsche Arbeitszeit-Profil als Standard, die generische EU-Erweiterung und die versionierten Länderprofile. Das Modul bewertet erfasste Zeiten regelbasiert, erklärt jede Regel, markiert Verstöße nachvollziehbar und speist die Ergebnisse in [Reports und Export](10-abrechnung-export.md), [Datenschutz und Audit](09-datenschutz-sicherheit.md) sowie das [Datenmodell](06-datenmodell.md) ein.

Die Compliance-Prüfung ist eine reine Funktion im Core-Package (`packages/core`) und wird von der [Zeitberechnungsengine](07-zeitberechnung-rundung.md) mit Nettoarbeitszeit, Pausen und Zeitstempeln versorgt. Bewertungsergebnisse landen in der Tabelle `compliance_results` (siehe [Datenmodell](06-datenmodell.md)); jede Überschreibung erzeugt einen Eintrag im Audit-Log.

## 1. Rechtsgrundlagen und Rechercheergebnis

Grundlage der deutschen Regeln sind das Arbeitszeitgesetz (ArbZG) und die höchstrichterliche Rechtsprechung zur Erfassungspflicht. Details und Quellenlinks: [Rechercheergebnisse](01-recherche.md).

| Norm | Kerninhalt (für das Regelwerk relevant) |
|---|---|
| **ArbZG §3** | Werktägliche Arbeitszeit grundsätzlich **8 Stunden**; Verlängerung auf **10 Stunden** nur, wenn im Ausgleichszeitraum (Ø 8 Stunden werktäglich in 6 Kalendermonaten / 24 Wochen) ausgeglichen wird. |
| **ArbZG §4** | Ruhepausen: bei **mehr als 6 Stunden** bis 9 Stunden mindestens **30 Minuten**, bei **mehr als 9 Stunden** mindestens **45 Minuten**; Aufteilung in Zeitabschnitte von jeweils mindestens **15 Minuten** zulässig; nie länger als 6 Stunden ohne Pause. |
| **ArbZG §5** | Nach Beendigung der täglichen Arbeitszeit mindestens **11 Stunden** ununterbrochene Ruhezeit. |
| **BAG 13.09.2022 – 1 ABR 22/21** | i.V.m. §3 ArbSchG: Pflicht zur Einführung eines objektiven, verlässlichen und zugänglichen Systems zur Erfassung der gesamten Arbeitszeit (Beginn, Ende, Dauer inkl. Pausen). |
| **EuGH 14.05.2019 – C-55/18 (CCOO)** | Unionsrechtliche Grundlage der Erfassungspflicht; Mitgliedstaaten müssen ein System zur Messung der täglichen Arbeitszeit verlangen. |
| **RL 2003/88/EG** | EU-Arbeitszeitrichtlinie: Basis des generischen EU-Profils (siehe Abschnitt 4). |

Das Produkt richtet sich primär an eine selbstständige Einzelperson. Selbstständige unterliegen nicht dem ArbZG (das gilt für Arbeitnehmerinnen und Arbeitnehmer). Das DE-Profil ist dennoch **Standard**, weil es (a) für Nutzende mit Angestelltenverhältnis oder Mischtätigkeit relevant ist, (b) die BAG/EuGH-Erfassungslogik als Qualitätsanker dient und (c) revisionsfähige Nachweise stützt. Sämtliche Regeln sind **konfigurierbar und deaktivierbar** (siehe Abschnitt 5, `severity` und Profil-Auswahl).

## 2. Deutsches Arbeitszeit-Profil — alle 13 Regeln

Das DE-Profil (`country_code = "DE"`) implementiert genau die 13 Regeln der Spezifikation. Jede Regel hat eine stabile `rule_id`, eine Auswertungsgrundlage, einen Schweregrad (`severity`) und eine nutzersichtbare Erklärung. Grün/gelb/rot wird durch `severity` bzw. das Auswertungsergebnis bestimmt (siehe Abschnitt 3).

| # | rule_id | Prüfregel (wörtlich prüfbarer Kernwert) | Grundlage | severity |
|---|---|---|---|---|
| 1 | `de_break_over_6h` | Bei **mehr als 6 Stunden** täglicher Arbeitszeit müssen mindestens **30 Minuten** Pause dokumentiert sein. | ArbZG §4 | Verstoß (rot), wenn dokumentierte Pause < **30 Minuten** |
| 2 | `de_break_over_9h` | Bei **mehr als 9 Stunden** täglicher Arbeitszeit müssen mindestens **45 Minuten** Pause dokumentiert sein. | ArbZG §4 | Verstoß (rot), wenn dokumentierte Pause < **45 Minuten** |
| 3 | `de_break_min_block` | Pausenblöcke sollen mindestens **15 Minuten** dauern, damit sie als echte Ruhepause zählen. | ArbZG §4 | Risiko (gelb): Blöcke < **15 Minuten** zählen nicht auf die Pflichtpause |
| 4 | `de_daily_standard_8h` | Die tägliche Arbeitszeit beträgt grundsätzlich **8 Stunden**. | ArbZG §3 | konform (grün) bis **8 Stunden** |
| 5 | `de_daily_extend_10h` | Verlängerung auf bis zu **10 Stunden** ist nur zulässig, wenn der Ausgleichszeitraum eingehalten wird (Ø 8 Stunden in 24 Wochen / 6 Kalendermonaten). | ArbZG §3 | Risiko (gelb) zwischen **8 Stunden** und **10 Stunden**; Ausgleichs-Hinweis |
| 6 | `de_daily_over_10h` | **Mehr als 10 Stunden** Nettoarbeitszeit pro Tag wird als schwerer Warnhinweis markiert. | ArbZG §3 | schwerer Verstoß (rot) über **10 Stunden** |
| 7 | `de_rest_11h` | Zwischen zwei Arbeitstagen sollen grundsätzlich mindestens **11 Stunden** Ruhezeit liegen. | ArbZG §5 | Verstoß (rot), wenn Ruhezeit < **11 Stunden** |
| 8 | `de_sunday_holiday` | **Sonn**- und Feiertagsarbeit wird gesondert markiert. | ArbZG §9 ff. | Hinweis (gelb), Sonn-/Feiertag markiert |
| 9 | `de_night_work` | **Nacht**arbeit wird gesondert markiert (Arbeit im Zeitfenster 23:00–06:00). | ArbZG §2/§6 | Hinweis (gelb), Nachtarbeit markiert |
| 10 | `de_overtime_flag` | Überstunden werden ausgewiesen (Netto über konfigurierter Tages-/Wochensollzeit). | intern/vertraglich | Hinweis (gelb) |
| 11 | `de_break_violation_flag` | Pausenverstöße werden ausgewiesen (Aggregat aus Regeln 1–3). | ArbZG §4 | Verstoß (rot) |
| 12 | `de_rest_violation_flag` | Ruhezeitverstöße werden ausgewiesen (Aggregat aus Regel 7). | ArbZG §5 | Verstoß (rot) |
| 13 | `de_backdated_flag` | Nachgetragene Zeiten werden gesondert markiert (`source = "manual_backdated"`). | Revisionssicherheit | Hinweis (gelb) |

### 2.1 Auswertungslogik (deterministisch, Core-Package)

Die Bewertung arbeitet pro Kalendertag (in der IANA-Zeitzone des Eintrags) und pro Tagesübergang:

- **Pausenprüfung (Regeln 1–3, 11):** Aus den `time_entry_breaks` wird die Summe der Pausenblöcke ≥ **15 Minuten** gebildet. Übersteigt die Nettoarbeitszeit **6 Stunden**, ist die Mindestpause **30 Minuten**; übersteigt sie **9 Stunden**, ist die Mindestpause **45 Minuten**. Pausenblöcke unter **15 Minuten** zählen nicht auf die Pflichtpause (Regel 3) und lösen einen gelben Hinweis aus.
- **Tageshöchstzeit (Regeln 4–6):** Nettoarbeitszeit ≤ **8 Stunden** = grün. Zwischen **8 Stunden** und **10 Stunden** = gelb mit Ausgleichszeitraum-Hinweis (Regel 5). Über **10 Stunden** = roter schwerer Verstoß (Regel 6).
- **Ruhezeit (Regeln 7, 12):** Differenz zwischen `actual_ended_at` des letzten Eintrags eines Tages und `actual_started_at` des ersten Eintrags des Folgetags. Unter **11 Stunden** = roter Verstoß.
- **Sonn-/Feiertag (Regel 8):** Wochentag Sonntag oder Treffer in der Feiertagsliste des Länderprofils → Markierung.
- **Nachtarbeit (Regel 9):** Überschneidung des Arbeitsintervalls mit dem Nachtfenster 23:00–06:00 → Markierung.
- **Überstunden (Regel 10):** Netto über konfigurierter Sollzeit → Ausweis im Report.
- **Nachtrag (Regel 13):** `source`-Feld des Zeiteintrags = `manual_backdated` → gesonderte Markierung; erscheint auch im PDF-Nachweis (siehe [Export](10-abrechnung-export.md)).

Die tatsächliche Netto-Arbeitszeit (`net_work_duration_seconds`) bleibt für die Compliance-Prüfung maßgeblich — die gerundete Abrechnungszeit (`billing_duration_seconds`) wird **nicht** für Arbeitszeitregeln herangezogen (siehe [Zeitberechnung und Rundung](07-zeitberechnung-rundung.md)).

Jedes Ergebnis wird als Zeile in `compliance_results` gespeichert: `rule_id`, `status` (`green` | `yellow` | `red`), `subject_date`, betroffene `time_entry_id`(s), `message`, `calculation_version`.

## 3. Compliance-UI — alle 9 Punkte

Die Compliance-Oberfläche (Hauptbereich „Compliance", siehe [UI und Apps](11-ui-apps.md)) stellt Ergebnisse handlungsorientiert dar:

| # | UI-Funktion | Umsetzung |
|---|---|---|
| 1 | **grün für konform** | `status = "green"`: keine Beanstandung, ruhige Darstellung. |
| 2 | **gelb für Risiko** | `status = "yellow"`: Hinweis/Risiko (z. B. 8–10 Stunden, Pausenblock < **15 Minuten**, Nachtarbeit). |
| 3 | **rot für Verstoß** | `status = "red"`: Verstoß (z. B. Pause < **30 Minuten**/**45 Minuten**, > **10 Stunden**, Ruhezeit < **11 Stunden**). |
| 4 | **Regel erklären** | `user_visible_explanation` aus dem Länderprofil + Paragraphenbezug (ArbZG §3/§4/§5). |
| 5 | **betroffene Einträge anzeigen** | Verlinkung auf die auslösenden `time_entries`/Tagesblöcke. |
| 6 | **Handlungsempfehlung anzeigen** | konkrete Empfehlung, z. B. „Pause um X Minuten ergänzen" oder „Eintrag am Folgetag verschieben". |
| 7 | **Begründung für Überschreibung erlauben** | Override mit Pflicht-Begründung; Ergebnis wird als „bewusst akzeptiert" markiert, nie stumm entfernt. |
| 8 | **Audit Log erzeugen** | Jede Überschreibung schreibt ein Event `Compliance Warnung überschrieben` mit `reason`, `actor_id`, `before_json`/`after_json` ins Audit-Log (siehe [Datenschutz und Audit](09-datenschutz-sicherheit.md)). |
| 9 | **Export in PDF aufnehmen** | Compliance-Hinweise erscheinen im Arbeitszeit-PDF und im dedizierten Compliance-Report (siehe [Export](10-abrechnung-export.md)). |

Der Override (Punkt 7) ändert **nicht** die erfasste Zeit; er dokumentiert nur die bewusste Entscheidung. Der ursprüngliche `status` bleibt zusammen mit dem Override-Vermerk erhalten, damit die Historie revisionsfähig ist.

## 4. Generisches EU-Profil — alle 6 Regeln

Zusätzlich zum DE-Profil existiert ein generisches EU-Profil (`country_code = "EU"`) auf Basis der Richtlinie **2003/88/EG**. Es dient als Fallback für Länder ohne eigenes Profil und als Ausgangspunkt länderspezifischer Ableitungen.

| # | rule_id | Regel | Grundlage RL 2003/88/EG |
|---|---|---|---|
| 1 | `eu_weekly_48h` | Durchschnittlich maximal **48 Stunden** Wochenarbeitszeit inklusive Überstunden, abhängig von nationaler Umsetzung (Referenzzeitraum bis 4 Monate). | Art. 6, Art. 16 |
| 2 | `eu_rest_11h` | Mindestens **11 Stunden** tägliche Ruhezeit. | Art. 3 |
| 3 | `eu_weekly_rest` | Wöchentliche Ruhezeit berücksichtigen (mindestens 24 Stunden zusammenhängend zzgl. der 11 Stunden Tagesruhe). | Art. 5 |
| 4 | `eu_break_over_6h` | Pause bei mehr als **6 Stunden** Arbeit; konkrete Dauer über das Länderprofil. | Art. 4 |
| 5 | `eu_night_work` | **Nacht**arbeit gesondert markieren (Ø ≤ 8 Stunden je 24-Stunden-Zeitraum). | Art. 8 |
| 6 | `eu_country_extension` | Länderspezifische Erweiterungen vorbereiten (nationale Umsetzung, Opt-out nach Art. 22). | Art. 15, Art. 22 |

Das EU-Profil trägt bewusst keine festen Pausenminuten für Regel 4 — die konkrete Dauer wird durch das jeweilige Länderprofil (z. B. DE mit **30 Minuten**/**45 Minuten**) gesetzt. So bleibt das EU-Profil generisch und länderneutral.

## 5. Versionierte Länderprofile

Compliance-Regeln ändern sich (Gesetzesreformen, Feiertagsanpassungen). Länderprofile sind deshalb **versioniert** und werden in der Tabelle `compliance_profiles` gehalten (siehe [Datenmodell](06-datenmodell.md)). Eine Zeiterfassung wird immer gegen das zum `subject_date` **gültige** Profil geprüft; das Prüfergebnis speichert `calculation_version`, damit historische Bewertungen stabil bleiben.

### 5.1 Alle 9 Felder

| # | Feld | Typ | Bedeutung |
|---|---|---|---|
| 1 | `country_code` | `TEXT` (ISO 3166-1 alpha-2, plus Sonderwert `"EU"`) | Kennung des Profils, z. B. `"DE"`, `"AT"`, `"EU"`. |
| 2 | `jurisdiction_name` | `TEXT` | Klartextname, z. B. „Deutschland (ArbZG)". |
| 3 | `valid_from` | `DATE` | Beginn der Gültigkeit dieser Profilversion. |
| 4 | `valid_until` | `DATE` (nullable) | Ende der Gültigkeit; `NULL` = derzeit gültig. |
| 5 | `rules_json` | `JSON`/`TEXT` | Maschinenlesbares Regelwerk (Schwellen, Schweregrade, Feiertage) — siehe Beispiel unten. |
| 6 | `source_note` | `TEXT` | Quellenverweis, z. B. „ArbZG §3/§4/§5, BAG 1 ABR 22/21, EuGH C-55/18". |
| 7 | `severity` | `TEXT` (`info` \| `warning` \| `violation`) | Default-Schweregrad des Profils; je Regel in `rules_json` überschreibbar. |
| 8 | `user_visible_explanation` | `TEXT` | Nutzersichtbare Erklärung für die UI („Regel erklären", UI-Punkt 4). |
| 9 | `calculation_version` | `INTEGER` | Version der Auswertungslogik; wird in `compliance_results` gespiegelt für stabile Historie. |

Versionsauswahl: Für ein Datum `d` wird die Zeile mit `country_code = X AND valid_from <= d AND (valid_until IS NULL OR valid_until >= d)` gewählt. Neue Profilversionen setzen `valid_until` der Vorgängerversion und fügen eine neue Zeile mit fortgeschriebenem `calculation_version` hinzu — bestehende `compliance_results` bleiben unverändert.

### 5.2 rules_json-Beispiel (DE-Profil)

```json
{
  "profile": "DE",
  "night_window": { "start": "23:00", "end": "06:00" },
  "min_break_block_minutes": 15,
  "breaks": [
    { "rule_id": "de_break_over_6h", "over_minutes": 360, "min_break_minutes": 30, "severity": "violation" },
    { "rule_id": "de_break_over_9h", "over_minutes": 540, "min_break_minutes": 45, "severity": "violation" }
  ],
  "daily_limits": {
    "standard_hours": 8,
    "max_hours": 10,
    "compensation_window_weeks": 24,
    "over_standard_severity": "warning",
    "over_max_severity": "violation"
  },
  "daily_rest": { "rule_id": "de_rest_11h", "min_rest_hours": 11, "severity": "violation" },
  "flags": {
    "sunday": true,
    "public_holidays": ["2026-01-01", "2026-04-03", "2026-05-01", "2026-12-25", "2026-12-26"],
    "night_work": true,
    "mark_backdated": true
  },
  "calculation_version": 1
}
```

Die Felder `over_minutes`, `min_break_minutes`, `standard_hours`, `max_hours` und `min_rest_hours` bilden exakt die Kernwerte der 13 DE-Regeln ab: **30 Minuten** und **45 Minuten** Pause, **15 Minuten** Mindestblock, **8 Stunden** Standard, **10 Stunden** Maximum mit Ausgleichszeitraum, **11 Stunden** Ruhezeit. So bleibt das Regelwerk datengetrieben und ohne Codeänderung versionierbar.

## 6. Zusammenspiel und Grenzen

- **Datenfluss:** [Zeitberechnungsengine](07-zeitberechnung-rundung.md) → Compliance-Prüfung (Core) → `compliance_results` ([Datenmodell](06-datenmodell.md)) → UI-Badges (grün/gelb/rot) + PDF ([Export](10-abrechnung-export.md)) + Erinnerungen (z. B. „6 Stunden ohne Pause", „**10 Stunden** Arbeitszeit erreicht"; siehe [Zeiterfassung](03-zeiterfassung.md)).
- **Warnungen im Timer:** Der laufende Timer trägt `compliance_warnings` im Timer-State (siehe [Sync](04-sync.md)), damit Verstöße bereits während der Erfassung sichtbar werden.
- **Override-Prinzip:** Verstöße werden nie stumm entfernt; sie werden akzeptiert und auditiert (UI-Punkte 7–8).

**Disclaimer:** Die hier abgebildeten Regeln sind Produkt-Hinweise auf Basis der genannten Normen (Stand der Recherche: Juli 2026) und **keine Rechtsberatung**. Das DE-Profil ist Standard, aber vollständig konfigurierbar und deaktivierbar; Selbstständige unterliegen dem ArbZG nicht, können das Profil jedoch als Qualitäts- und Nachweisrahmen nutzen. Maßgeblich für rechtliche Beurteilungen sind stets die aktuellen Gesetzestexte und eine individuelle Rechtsberatung.
