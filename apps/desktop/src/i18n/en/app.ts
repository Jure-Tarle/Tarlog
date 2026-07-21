/** English dictionary: app shell (App.tsx, components/ui.tsx, components/PagePlaceholder.tsx, pages/routes.tsx labels). Keys = exact German source strings. */
export const app: Record<string, string> = {
  // pages/routes.tsx — RouteDef labels (t() applied at display in App.tsx)
  "Dashboard": "Dashboard",
  "Timer": "Timer",
  "Heute": "Today",
  "Woche": "Week",
  "Kunden": "Customers",
  "Projekte": "Projects",
  "Aufgaben": "Tasks",
  "Reports": "Reports",
  "Rechnungen": "Invoices",
  "Nachträge": "Backdating",
  "Compliance": "Compliance",
  "Einstellungen": "Settings",
  "Sync": "Sync",

  // App.tsx — NAV_GROUPS labels
  "Arbeitsbereich": "Workspace",
  "Organisation": "Organization",
  "Auswertung": "Reporting",
  "System": "System",

  // App.tsx — TIMER_STATUS_META labels
  "Bereit": "Ready",
  "Läuft": "Running",
  "Pausiert": "Paused",
  "Gestoppt": "Stopped",
  "Beschreibung fehlt": "Description missing",
  "Sync ausstehend": "Sync pending",
  "Konflikt": "Conflict",

  // App.tsx — Sidebar
  "Tarlog Navigation": "Tarlog navigation",
  "Seitenleiste ausblenden": "Hide sidebar",
  "Seitenleiste ausblenden (⌥⌘S)": "Hide sidebar (⌥⌘S)",
  "Tarlog Flow, Dashboard": "Tarlog Flow, Dashboard",
  "Hauptnavigation": "Main navigation",
  "Einführung erneut öffnen": "Reopen introduction",
  "Einführung": "Introduction",
  "Deine Zeit bleibt bei dir.": "Your time stays with you.",
  "Breite der Seitenleiste ändern": "Resize sidebar",

  // App.tsx — PersistentTimer
  "Aktion fehlgeschlagen": "Action failed",
  "Wird aktualisiert": "Updating",
  "Timer {status}": "Timer {status}",
  "Timer pausieren": "Pause timer",
  "Timer fortsetzen": "Resume timer",
  "Timer öffnen": "Open timer",
  "Pausieren": "Pause",
  "Fortsetzen": "Resume",

  // App.tsx — AppearancePicker
  "Darstellung": "Appearance",
  "Hell": "Light",
  "Dunkel": "Dark",

  // App.tsx — Topbar
  "Seitenleiste einblenden": "Show sidebar",

  // App.tsx — boot / onboarding-loading screens
  "Tarlog wird vorbereitet": "Preparing Tarlog",
  "Lokale Datenbank und Arbeitsbereich werden geladen …": "Loading local database and workspace…",
  "Tarlog konnte nicht gestartet werden": "Tarlog could not be started",
  "Die lokale Datenbank ist momentan nicht verfügbar. Beende Tarlog vollständig und versuche es erneut; deine vorhandenen Daten wurden nicht verändert.":
    "The local database is currently unavailable. Quit Tarlog completely and try again; your existing data has not been changed.",
  "Erneut versuchen": "Try again",
  "Arbeitsbereich wird geprüft": "Checking workspace",
  "Tarlog lädt deine lokale Einrichtung …": "Tarlog is loading your local setup…",
  "Einrichtung konnte nicht geladen werden": "Setup could not be loaded",
  "Dein lokaler Arbeitsbereich wurde nicht verändert.": "Your local workspace has not been changed.",
  "Zum Inhalt springen": "Skip to content",

  // components/ui.tsx
  "Aktionen": "Actions",
  "Konform": "Compliant",
  "Risiko": "At risk",
  "Verstoß": "Violation",
  "Keine Daten": "No data",
  "Nicht verfügbar.": "Not available.",
  "Lädt…": "Loading…",

  // components/PagePlaceholder.tsx
  "Platzhalter für": "Placeholder for",
  ". Diese Seite füllt der UI-Autor. Backend über": ". This page is filled in by the UI author. Backend via",
  ", Read-Queries über": ", read queries via",
};
