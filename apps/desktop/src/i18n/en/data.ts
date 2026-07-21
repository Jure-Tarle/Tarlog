/** English dictionary: data layer (formatters, validation/error messages, PDF export). Keys = exact German source strings. */
export const data: Record<string, string> = {
  "KW {week} | {year}": "Week {week} | {year}",

  // roundingPresentation.ts
  "Wird berechnet": "Calculating",
  "{n} Minuten": "{n} minutes",
  "das Regelintervall": "the rule interval",
  "Keine Rundung": "No rounding",
  "Auf {interval} aufgerundet": "Rounded up to {interval}",
  "Auf {interval} abgerundet": "Rounded down to {interval}",
  "Auf {interval} gerundet": "Rounded to {interval}",
  "Mindestdauer {interval}": "Minimum duration {interval}",
  "Netto- und Abrechnungszeit sind identisch": "Net and billed time are identical",
  "{sign}{n} Min. gegenüber der Nettozeit": "{sign}{n} min vs. net time",
  "Projektregel angewendet": "Project rule applied",

  // timer.ts
  "Dieses Projekt wird bereits erfasst.": "This project is already being tracked.",
  "Beende zuerst den aktuell laufenden Timer.": "Stop the currently running timer first.",
  "Es läuft derzeit kein Timer.": "No timer is currently running.",
  "Der Kurzbefehl gehört nicht zum aktuell laufenden Projekt.": "This shortcut doesn't belong to the currently running project.",

  // rounding.ts
  "Rundungsregel wurde nicht gefunden.": "Rounding rule not found.",
  "Lege zuerst eine andere Regel als globale Basis fest.": "Set another rule as the global base first.",
  "Wähle ein konkretes Ziel für diese Ausnahme.": "Choose a specific target for this exception.",

  // projectAnalytics.ts
  "Ohne Beschreibung": "No description",
  "Unbekannte Aufgabe": "Unknown task",
  "Ohne Aufgabe": "No task",

  // projectTimesheetPdf.ts
  "TARLOG | PROJEKTNACHWEIS": "TARLOG | TIMESHEET",
  "Projekt {code}": "Project {code}",
  "Arbeitszeit": "Working time",
  "Einträge": "Entries",
  "Datum": "Date",
  "Dauer": "Duration",
  "Tätigkeit": "Activity",
  "Erstellt am {date}": "Created on {date}",
  "Projektwert {value}": "Project value {value}",
  "Tarlog | Seite {page} von {pages}": "Tarlog | Page {page} of {pages}",

  // serverClient.ts
  "Server-Adresse muss eine vollständige http(s)-URL sein.": "Server address must be a complete http(s) URL.",
  "Server-Adresse muss mit http:// oder https:// beginnen.": "Server address must start with http:// or https://.",
  "Außerhalb dieses Geräts ist für Sync eine HTTPS-Adresse erforderlich.": "An HTTPS address is required for sync outside this device.",
  "Server-Adresse darf keine Zugangsdaten enthalten.": "Server address must not contain credentials.",
  "Server-Adresse darf keine Query oder Raute enthalten.": "Server address must not contain a query or fragment.",
  "Pairing-Code muss aus acht gültigen Zeichen bestehen.": "Pairing code must consist of eight valid characters.",
};
