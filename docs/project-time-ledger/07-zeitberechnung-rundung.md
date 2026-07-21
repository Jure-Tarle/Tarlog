# Zeitberechnungsengine und Rundungslogik

> Hinweis: Rechtliche Aussagen sind Produkt-Hinweise, keine Rechtsberatung. Stand der Recherche: Juli 2026.

Dieses Kapitel beschreibt die Zeitberechnungsengine (SPEC §25) und die Rundungslogik (SPEC §14). Beide liegen im gemeinsamen `packages/core` (siehe [Architektur](05-architektur.md)) und arbeiten ausschließlich auf den Feldern der Tabelle `time_entries` aus dem [Datenmodell](06-datenmodell.md). Die Engine ist die einzige Stelle im System, die aus rohen Zeitstempeln abrechenbare Zahlen erzeugt, Desktop, Web und iOS rufen dieselbe Funktion auf und erhalten bit-identische Ergebnisse.

Leitprinzip aus SPEC §14 und §39: **Die tatsächliche Arbeitszeit und die abgerechnete Zeit müssen getrennt gespeichert werden. Rundung darf nie die echte Arbeitszeit überschreiben.** `actual_duration_seconds` bleibt der Roh-Messwert, `billing_duration_seconds` ist das gerundete Abrechnungsergebnis. Der Nachweis (siehe [Abrechnung und Export](10-abrechnung-export.md)) zeigt beide getrennt.

## 1. Designprinzipien der Engine

1. **Pure functions.** Jede Berechnung ist eine reine Funktion: gleiche Eingabe → gleiche Ausgabe, keine Seiteneffekte, kein Zugriff auf Systemuhr, Datenbank oder Netzwerk. Die aktuelle Uhrzeit wird immer als Parameter (`now`) hereingereicht. Das macht die Engine deterministisch, testbar und auf allen Plattformen identisch (SPEC §25).
2. **UTC intern, IANA-Zeitzone pro Eintrag.** Alle `*_at`-Zeitpunkte sind UTC-Epoch-Millisekunden (Entscheidung 8 des Plans). Kalenderlogik (Tagesgrenze, DST) nutzt das mitgespeicherte `timezone TEXT` (IANA, z. B. `Europe/Berlin`). Nie die lokale Systemzeitzone des Geräts implizit verwenden.
3. **Dauern als Ganzzahl-Sekunden.** Alle Dauern sind `*_seconds INTEGER`. Keine Floats, Rundung von Geld und Zeit erfolgt in Ganzzahl-Arithmetik (Cents und Sekunden), um Gleitkomma-Drift zu vermeiden.
4. **`calculation_version`.** Jedes Berechnungsergebnis trägt eine `calculation_version`. Ändert sich die Berechnungslogik (neuer Rundungsalgorithmus, korrigierte DST-Behandlung), steigt die Version. Bestehende Einträge behalten ihre alte `calculation_version` und werden nicht still neu berechnet, so bleiben alte Rechnungen stabil (SPEC §25 „alte Rechnungen stabil halten").
5. **Trennung Messen / Runden / Bewerten.** Erst wird die tatsächliche Arbeitszeit gemessen (Brutto-Dauer als `actual_duration_seconds`, daraus Netto `net_work_duration_seconds = actual − break`), dann die Rundung angewandt (auf einer Kopie), dann der Betrag bewertet. Die drei Schritte greifen nie ineinander.

## 2. Die 18 Funktionen der Zeitberechnungsengine (SPEC §25)

Alle Funktionen sind pure functions im Core-Package, mit Zod-validierten Eingaben. Signaturen sind illustrativ (TypeScript).

| # | Funktion (SPEC §25) | Core-Signatur (illustrativ) | Aufgabe |
|---|---|---|---|
| 1 | Bruttozeit berechnen | `computeGrossSeconds(actual_started_at, actual_ended_at): number` | `actual_ended_at − actual_started_at` in Sekunden (Bruttozeit vor Pausenabzug). |
| 2 | Pausen berechnen | `computeBreakSeconds(breaks: Break[]): number` | Summe aller `time_entry_breaks` → `break_duration_seconds`. |
| 3 | Nettoarbeitszeit berechnen | `computeNetSeconds(gross, breaks): number` | `gross − break_duration_seconds` → `net_work_duration_seconds`. Nie negativ (clamp auf 0). |
| 4 | Rundung anwenden | `applyRounding(net_seconds, rule): RoundingResult` | Erzeugt `billing_duration_seconds`, `rounding_delta_seconds`, `rounding_reason` (siehe §3). |
| 5 | Tagesgrenzen behandeln | `resolveDayBoundary(at, timezone): LocalDay` | Ordnet einen UTC-Zeitpunkt dem lokalen Kalendertag der Eintrags-Zeitzone zu (siehe §6). |
| 6 | Über Mitternacht aufteilen (optional) | `splitAtMidnight(entry, timezone): TimeEntry[]` | Optionaler Split eines über Mitternacht laufenden Eintrags in zwei Tagesteile (siehe §6). |
| 7 | Zeitzonen berücksichtigen | `toLocal(at, timezone): LocalDateTime` | Wandelt UTC in lokale Wandzeit der Eintrags-`timezone`. |
| 8 | Sommerzeit berücksichtigen | Teil von `toLocal` / `computeGrossSeconds` | DST-Übergang (Frühjahr, Uhr vor): echte verstrichene Sekunden bleiben korrekt (siehe §6). |
| 9 | Winterzeit berücksichtigen | Teil von `toLocal` / `computeGrossSeconds` | DST-Übergang (Herbst, Uhr zurück): doppelte Stunde wird nicht doppelt gezählt (siehe §6). |
| 10 | Compliance prüfen | `evaluateCompliance(dayEntries, profile): ComplianceResult` | Übergibt an das Compliance-Modul, siehe [Compliance](08-compliance.md). Reine Delegation, kein Nebeneffekt. |
| 11 | Abrechnungsbetrag berechnen | `computeAmountCents(billing_seconds, rate_snapshot): number` | `billing_amount_snapshot` in Cents (Integer, ISO-4217-Währung). |
| 12 | Tagessatz berechnen | `computeDayRate(dayEntries, dayRateRule): number` | Voller/halber Tag ab X Stunden, Mindestabrechnung, Details in [Abrechnung und Export](10-abrechnung-export.md). |
| 13 | Festpreis-Profitabilität berechnen | `computeFixedFeeMargin(actualCost, fixedFee): Margin` | Ist-Aufwand gegen Budget, Marge; Details in [Abrechnung und Export](10-abrechnung-export.md). |
| 14 | Budgetverbrauch berechnen | `computeBudgetUsage(entries, budget): BudgetUsage` | Verbrauchte vs. geplante Stunden/Geld, Warnschwellen. |
| 15 | Nachträge markieren | `flagManualEntry(entry): entry` | Setzt `source = 'manual_backdated'`; das Flag fließt in Nachweis und Audit (siehe [Zeiterfassung](03-zeiterfassung.md)). |
| 16 | Korrekturen versionieren | `versionCorrection(before, after): AuditDelta` | Erzeugt `before_json`/`after_json` für das Audit-Log; erhöht `local_revision`. |
| 17 | Snapshots erstellen | `snapshot(entry, rate): Snapshot` | Friert `rate_snapshot` und `billing_amount_snapshot` ein (siehe §5). |
| 18 | Alte Rechnungen stabil halten | `resolveCalculationVersion(entry): version` | Rechnet finalisierte/gesnapshottete Einträge nie neu; nutzt ihre gespeicherte `calculation_version` (siehe §5). |

Die Hauptpipeline für einen einzelnen Eintrag ist die Komposition der Funktionen 1 → 2 → 3 → 4 → 11:

```
gross      = computeGrossSeconds(actual_started_at, actual_ended_at)
break       = computeBreakSeconds(breaks)                 // break_duration_seconds
net         = computeNetSeconds(gross, break)             // net_work_duration_seconds
rounding    = applyRounding(net, rounding_rule)           // billing_duration_seconds, rounding_delta_seconds
amount_cents = computeAmountCents(rounding.billing_seconds, rate_snapshot)  // billing_amount_snapshot
```

`actual_duration_seconds` wird direkt aus Funktion 1 (`computeGrossSeconds`, Brutto-Rohmessung `actual_ended_at − actual_started_at`) übernommen und **nie** durch die Rundung verändert. `net_work_duration_seconds` ergibt sich daraus als `actual_duration_seconds − break_duration_seconds` (Funktion 3).

## 3. Rundungslogik (SPEC §14)

### 3.1 Die 12 Felder je Zeiteintrag

Diese 12 Felder sind identisch im [Datenmodell](06-datenmodell.md) definiert und in `time_entries` persistiert. `actual_duration_seconds` und `billing_duration_seconds` sind getrennt gespeichert (AC4).

| # | Feld | Typ | Bedeutung |
|---|---|---|---|
| 1 | `actual_started_at` | INTEGER (epoch-ms UTC) | Tatsächlicher Beginn, roh gemessen. |
| 2 | `actual_ended_at` | INTEGER (epoch-ms UTC) | Tatsächliches Ende, roh gemessen. |
| 3 | `actual_duration_seconds` | INTEGER | Tatsächliche Brutto-Dauer Start→Ende (`actual_ended_at − actual_started_at`) in Sekunden, roh gemessen (ohne Pausenabzug). Wird durch Rundung NIE verändert. |
| 4 | `break_duration_seconds` | INTEGER | Summe aller Pausen in Sekunden. |
| 5 | `net_work_duration_seconds` | INTEGER | Brutto minus Pausen = Basis der Rundung. |
| 6 | `billing_duration_seconds` | INTEGER | Gerundete Abrechnungszeit in Sekunden. Ergebnis von `applyRounding`. |
| 7 | `rounding_rule_id` | UUIDv7 (FK) | Verweis auf die angewandte Regel in `rounding_rules`. |
| 8 | `rounding_delta_seconds` | INTEGER (vorzeichenbehaftet) | `billing_duration_seconds − net_work_duration_seconds`. Positiv = aufgerundet, negativ = abgerundet, 0 = keine Änderung. |
| 9 | `rounding_reason` | TEXT | Nachvollziehbarer Grund, z. B. `"ceil_started_interval:900s"`. |
| 10 | `calculation_version` | INTEGER | Version des Berechnungsalgorithmus zum Zeitpunkt der Berechnung. |
| 11 | `rate_snapshot` | JSON | Eingefrorener Satz (Betrag in Cents, Währung, Quelle), siehe §5. |
| 12 | `billing_amount_snapshot` | INTEGER (Cents) | Eingefrorener Abrechnungsbetrag = `billing_duration_seconds × rate` (Integer). |

### 3.2 Die 9 Rundungsmodi (SPEC §14)

Der Modus liegt in `rounding_rules.mode`. Die Engine schaltet über den Enum-Wert.

| # | Rundungsmodus (SPEC) | Enum-Wert | Verhalten |
|---|---|---|---|
| 1 | keine Rundung | `none` | `billing = net`. `rounding_delta_seconds = 0`. |
| 2 | immer aufrunden | `always_up` | Auf das nächste `interval` aufrunden (ceil). |
| 3 | immer abrunden | `always_down` | Auf das nächste `interval` abrunden (floor). |
| 4 | kaufmännisch runden | `commercial` | Kaufmännisch auf das nächste `interval` runden (round half up). |
| 5 | nächstes Intervall | `nearest_interval` | Auf das nächstgelegene `interval` runden (identisch zu `commercial` bei Halbe-hoch-Regel; als eigener Modus geführt, da SPEC beide listet). |
| 6 | Mindestdauer pro Eintrag | `min_per_entry` | `billing = max(net, min_entry_seconds)`. Kurzer Eintrag wird auf Mindestdauer angehoben. |
| 7 | Mindestdauer pro Tag | `min_per_day` | Tagessumme wird auf `min_day_seconds` angehoben; Aufschlag anteilig oder auf letzten Eintrag verbucht (dokumentiert in `rounding_reason`). |
| 8 | Mindestabrechnung pro Projekt | `min_per_project` | Projektsumme im Abrechnungszeitraum wird auf `min_project_seconds` angehoben. |
| 9 | je angefangenes Intervall | `ceil_started_interval` | Jedes **angefangene** `interval` wird voll berechnet (mathematisch ceil, aber semantisch „angefangene Einheit zählt voll"). Standard für den 70→75-Fall. |

Die Modi 2, 3, 4, 5, 9 sind intervallbasiert und benötigen ein `interval`. Die Modi 6, 7, 8 sind schwellenbasiert (Mindestdauern). Modus 1 ist der Pass-through.

### 3.3 Die 6 Intervalle (SPEC §14)

Das Intervall liegt in `rounding_rules.interval_seconds`.

| # | Intervall | `interval_seconds` |
|---|---|---|
| 1 | 5 Minuten | 300 |
| 2 | 6 Minuten | 360 |
| 3 | 10 Minuten | 600 |
| 4 | 15 Minuten | 900 |
| 5 | 30 Minuten | 1800 |
| 6 | 60 Minuten | 3600 |

Das 6-Minuten-Intervall (360 s) ist bewusst enthalten: es entspricht der in der Beratung/Recht verbreiteten „Zehntelstunde" (0,1 h).

### 3.4 Rundungsalgorithmus (Ganzzahl-Sekunden)

Für die intervallbasierten Modi mit `interval_seconds = I` und Netto `N`:

```
always_up            : billing = ceil(N / I) * I
always_down          : billing = floor(N / I) * I
commercial / nearest : billing = round(N / I) * I         // .5 → auf
ceil_started_interval: billing = ceil(N / I) * I           // jedes angefangene Intervall voll
```

`ceil_started_interval` und `always_up` liefern für `N`, das nicht exakt auf einem Intervall liegt, dasselbe Ergebnis; sie unterscheiden sich nur begrifflich in `rounding_reason`. Anschließend immer:

```
rounding_delta_seconds = billing - N
```

## 4. Durchgerechnetes Beispiel: 70 Minuten → 75 Minuten (AC4)

Dieses Beispiel ist der Kern-Testfall (SPEC §14 „Beispiel", SPEC §34 Nr. 9,11, AC4). Es zeigt: Aufrundung auf das 15-Minuten-Intervall, `rounding_delta_seconds = +300`, und **actual bleibt 70 Minuten**.

Formuliert wie in SPEC §14: **Wenn 1 Stunde und 10 Minuten gearbeitet wurde, wird für die Abrechnung auf 1 Stunde und 15 Minuten aufgerundet.** 1 h 10 min = 70 Minuten; 1 h 15 min = 75 Minuten.

**Eingabe:**

- `actual_started_at` = `2026-07-07T09:00:00+02:00` (= `07:00:00Z`)
- `actual_ended_at`   = `2026-07-07T10:10:00+02:00` (= `08:10:00Z`)
- `timezone` = `Europe/Berlin`
- keine Pausen → `break_duration_seconds = 0`
- Rundungsregel: Modus `ceil_started_interval`, `interval_seconds = 900` (15 Minuten)

**Schritt-für-Schritt (Funktionen 1 → 4):**

| Schritt | Funktion | Rechnung | Ergebnis |
|---|---|---|---|
| 1 | `computeGrossSeconds` | `08:10:00Z − 07:00:00Z` = 70 min | `gross = 4200` s |
| 2 | `computeBreakSeconds` | keine Pausen | `break_duration_seconds = 0` s |
| 3 | `computeNetSeconds` | `4200 − 0` | `net_work_duration_seconds = 4200` s (= **70 Minuten**) |
| 3b | actual festhalten | Brutto-Rohmessung (`ended − started`); hier `break = 0`, daher identisch zu net | `actual_duration_seconds = 4200` s (bleibt **70 Minuten**) |
| 4 | `applyRounding` | `ceil(4200 / 900) × 900 = ceil(4,666…) × 900 = 5 × 900` | `billing_duration_seconds = 4500` s (= **75 Minuten**) |
| 4b | Delta | `4500 − 4200` | `rounding_delta_seconds = +300` s |

**Ergebnisfelder:**

| Feld | Wert |
|---|---|
| `actual_duration_seconds` | `4200` (70 Minuten, **unverändert**) |
| `net_work_duration_seconds` | `4200` (70 Minuten) |
| `billing_duration_seconds` | `4500` (75 Minuten) |
| `rounding_delta_seconds` | `+300` |
| `rounding_reason` | `"ceil_started_interval:900s"` |
| `rounding_rule_id` | (FK auf die 15-Minuten-Regel) |
| `calculation_version` | (aktuelle Version) |

**Konsequenzen, exakt wie SPEC §14 fordert:**

1. tatsächliche Brutto-Arbeitszeit **70 Minuten** (`actual_duration_seconds = 4200`; hier ohne Pausen = Netto)
2. Rundungsintervall **15 Minuten** (`interval_seconds = 900`)
3. Abrechnungszeit **75 Minuten** (`billing_duration_seconds = 4500`)
4. tatsächliche Arbeitszeit bleibt **70 Minuten**, Rundung überschreibt sie nicht
5. Rechnung nutzt **75 Minuten** (`billing_duration_seconds`, siehe [Abrechnung und Export](10-abrechnung-export.md))
6. Arbeitszeitnachweis zeigt **70 Minuten** und optional **75 Minuten** separat (`actual_duration_seconds` und `billing_duration_seconds` nebeneinander)

**Betragsbeispiel (Funktion 11).** Bei einem `rate_snapshot` von 90,00 €/h (= 9000 Cents pro 3600 s):
`billing_amount_snapshot = round(4500 / 3600 × 9000) = round(11250) = 11250` Cents = 112,50 €. Der Betrag basiert bewusst auf den 75 Abrechnungsminuten, nicht auf den 70 tatsächlichen Minuten.

Für den Modus `commercial`/`nearest_interval` läge das Ergebnis hier identisch bei 75 Minuten (`round(4,666…) = 5`). Bei `always_down` wären es 60 Minuten (`floor = 4 × 900 = 3600`, `rounding_delta_seconds = −600`); bei `none` blieben es 70 Minuten (`rounding_delta_seconds = 0`).

## 5. Snapshots, alte Rechnungen stabil halten (SPEC §25 Nr. 17, 18)

Rundung, Satz und Betrag hängen von Regeln ab, die sich über die Zeit ändern (Stundensatz-Historisierung, geänderte Rundungsregel, vgl. Konfliktfälle 4 und 5 in [Sync](04-sync.md)). Damit **finalisierte Rechnungen stabil bleiben**, friert die Engine bei relevanten Ereignissen Snapshots ein:

- **`rate_snapshot`**, der zum Berechnungszeitpunkt gültige Satz (Betrag in Cents, Währung, Quelle der Rate: Aufgabe > Projekt > Kunde > Default). Wird nach dem Einfrieren nie durch spätere Satzänderungen berührt.
- **`billing_amount_snapshot`**, der berechnete Abrechnungsbetrag in Cents.
- **`calculation_version`**, die Algorithmus-Version. Ein finalisierter Eintrag wird bei späteren Engine-Updates **nicht** neu gerechnet (Funktion 18 `resolveCalculationVersion`).

Snapshot-Zeitpunkte:

1. **Bei Zeiteintrag**, vorläufiger Snapshot beim Speichern/Stoppen (kann bei Korrektur neu gezogen werden, solange nicht fakturiert).
2. **Bei Rechnung**, finaler Snapshot bei Rechnungsfinalisierung. Danach ist der Eintrag gegenüber Satz-/Rundungsänderungen immun; Korrektur nur über Storno/neue Rechnungsversion (siehe [Abrechnung und Export](10-abrechnung-export.md)).

Die Trennung Snapshot ↔ Live-Wert garantiert: Ändert der Nutzer heute seinen Stundensatz, verändert sich eine bereits im Juni finalisierte Rechnung nicht. Der Audit-Eintrag (Funktion 16) dokumentiert jede Neuberechnung mit `before_json`/`after_json`.

## 6. Zeitzonen, Sommerzeit/Winterzeit, Tagesgrenzen, Mitternacht-Split (SPEC §25 Nr. 5,9)

### 6.1 Grundsatz

Die Dauer eines Eintrags ist **immer** die Differenz zweier UTC-Zeitpunkte (`actual_ended_at − actual_started_at`). Dadurch ist die gemessene Dauer von Zeitzonen und DST-Übergängen unberührt, ein über die DST-Umstellung laufender Timer misst die real verstrichenen Sekunden korrekt. Die IANA-`timezone` wird nur für **kalendarische** Fragen gebraucht: Welchem lokalen Tag gehört der Eintrag? Fällt er in die Nacht? Überschreitet er lokale Mitternacht?

### 6.2 Sommerzeit / Winterzeit (DST)

- **Sommerzeit (Frühjahr, Uhr vor, 02:00 → 03:00).** Ein Eintrag `01:30`,`03:30` lokaler Wandzeit dauert real nur **1 Stunde**, weil die Stunde `02:00`,`03:00` lokal nicht existiert. Da die Engine auf UTC rechnet, ergibt `actual_ended_at − actual_started_at` automatisch die korrekten 3600 Sekunden. Kein Sonderfall im Code nötig, die UTC-Differenz ist die Wahrheit.
- **Winterzeit (Herbst, Uhr zurück, 03:00 → 02:00).** Die lokale Stunde `02:00`,`03:00` existiert **doppelt**. Ein Eintrag über diese Grenze dauert real **eine Stunde mehr** als die Wandzeit-Differenz suggeriert; die UTC-Differenz zählt sie korrekt einfach für jede reale Stunde, also nicht doppelt. Auch hier: UTC-Differenz ist korrekt, keine Doppelzählung.

Regel: **Rechne Dauern nie aus lokalen Wandzeit-Differenzen**, immer aus UTC-Epoch-Differenzen. Die IANA-Zeitzonen-Datenbank (via Plattform-Intl/`Temporal` bzw. serverseitiger tz-Bibliothek) liefert die korrekten Offsets für die Umrechnung in Wandzeit.

### 6.3 Tagesgrenzen

`resolveDayBoundary(at, timezone)` bestimmt den lokalen Kalendertag eines UTC-Zeitpunkts in der Eintrags-Zeitzone. Das ist die Basis für Tages-Aggregationen (Tagesgesamtzeit, Tagessatz, deutsche Pausen-/Ruhezeitprüfung in [Compliance](08-compliance.md)) und für Reports (Tages-/Wochenreport, siehe [Abrechnung und Export](10-abrechnung-export.md)). Zwei Geräte in verschiedenen Zeitzonen dürfen denselben Eintrag nicht unterschiedlichen Tagen zuordnen, deshalb entscheidet ausschließlich die **im Eintrag gespeicherte** `timezone`, nicht die aktuelle Gerätezeitzone.

### 6.4 Über Mitternacht (SPEC §8 Nr. 32, §25 Nr. 6)

Ein Eintrag, dessen `actual_started_at` und `actual_ended_at` in unterschiedlichen lokalen Kalendertagen liegen, wird als **über Mitternacht laufend markiert**. Standardverhalten:

- Der Eintrag bleibt **ein** Datensatz; das Flag `crosses_midnight` wird gesetzt und im Nachweis kenntlich gemacht.
- Optional (`splitAtMidnight`, SPEC §25 Nr. 6) kann der Eintrag zur Tagesabgrenzung in zwei Teile an der lokalen Mitternachtsgrenze aufgeteilt werden, z. B. wenn die Tages-Compliance oder ein Tagessatz eine saubere Tageszuordnung braucht. Der Split ist verlustfrei: Summe der Teil-`actual_duration_seconds` = Original, jeder Teil erhält eine eigene Tageszuordnung, beide referenzieren denselben Ursprungs-Eintrag für das Audit-Log.
- Der Timer-Zustandsübergang (siehe [Sync](04-sync.md)) bleibt unberührt; das Mitternachts-Handling ist rein eine Berechnungs-/Aggregationsfrage. Die Zustände `running`, `paused`, `stopped`, `needs_description` bleiben unverändert.

Der Split ist bewusst **optional** und projekt-/report-abhängig konfigurierbar, damit die tatsächliche Arbeitszeit als ein Vorgang erkennbar bleibt, wo das gewünscht ist.

## 7. Determinismus und calculation_version im Zusammenspiel mit Sync

Weil die Engine deterministisch und pure ist, berechnet jedes Gerät aus denselben Rohfeldern dasselbe Ergebnis. Der Sync (siehe [Sync](04-sync.md)) überträgt daher primär die **Rohfelder** (`actual_started_at`, `actual_ended_at`, Pausen, `rounding_rule_id`) plus die Snapshots; die abgeleiteten Felder (`billing_duration_seconds`, `rounding_delta_seconds`, Beträge) können auf jedem Gerät reproduziert werden. Weicht ein Gerät ab, ist das ein Signal für unterschiedliche `calculation_version` oder eine verstellte Geräteuhr (siehe Uhr-Vertrauen in [Sync](04-sync.md)), beides wird sichtbar gemacht statt still übernommen. So bleiben `actual_duration_seconds` und `billing_duration_seconds` über alle Plattformen konsistent und getrennt.
