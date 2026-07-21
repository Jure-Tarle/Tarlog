# Nachtrags-Workflow, UX-Audit

## 1. Neue Erfassung

- Zustand: funktionsfähig, aber in der Ausgangsversion zu viel gleichzeitige Verwaltungsoberfläche.
- Risiko: Erfassung, Vorschau, vollständige Historie und Bulk-Auswahl konkurrierten um Aufmerksamkeit.
- Änderung: kompaktere Vorschau, breiterer Erfassungsbereich und nur fünf letzte Nachträge als schnelle Korrekturliste.

## 2. Letzte Nachträge

- Zustand: nach der Überarbeitung fokussiert.
- Änderung: Standardansicht ohne Auswahlspalten; `Alle anzeigen` öffnet bewusst den Verwaltungsmodus mit Auswahl und Bulk-Bearbeitung.
- Zugänglichkeit: Moduswechsel und Auswahl bleiben als beschriftete Buttons und Checkboxen im Accessibility-Tree verfügbar.

## 3. Projektkontext

- Zustand: Nachträge sind im detaillierten Stundennachweis auffindbar.
- Änderung: Einzelne Nachträge lassen sich vom Projekt aus öffnen; Speichern oder Abbrechen führt zurück zum Projekt. Die Aktion `Nachträge verwalten` öffnet die auf das Projekt gefilterte Historie.

## Evidenzgrenzen

- Visuell und über den macOS-Accessibility-Tree geprüft.
- Keine vollständige WCAG-Konformitätsprüfung und kein Screenreader-Durchlauf.
