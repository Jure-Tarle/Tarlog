/** English dictionary: onboarding (desktop setup assistant). Keys = exact German source strings. */
export const onboarding: Record<string, string> = {
  // STEP_META
  "Willkommen": "Welcome",
  "Ersteinrichtung": "Initial setup",
  "Willkommen bei Tarlog": "Welcome to Tarlog",
  "Richte deinen Arbeitsbereich ein und lerne die zwei Wege der Zeiterfassung kennen. Deine Daten bleiben standardmäßig auf diesem Mac.":
    "Set up your workspace and learn the two ways to track time. Your data stays on this Mac by default.",
  "Arbeitsbereich": "Workspace",
  "Kunde & Projekt": "Customer & project",
  "Ersten Arbeitsbereich einrichten": "Set up your first workspace",
  "Lege dein erstes Projekt an. Wenn du für einen Kunden arbeitest, kannst du ihn direkt mit anlegen; für interne Arbeit bleibt das Kundenfeld leer.":
    "Create your first project. If you're working for a customer, you can add them right away; for internal work, leave the customer field blank.",
  "Live-Timer": "Live timer",
  "Aktive Arbeit": "Active work",
  "Arbeitszeit mit dem Timer erfassen": "Track work time with the timer",
  "Der Timer bleibt in der Toolbar sichtbar. Du kannst ihn jederzeit pausieren, fortsetzen und mit einer Beschreibung sauber abschließen.":
    "The timer stays visible in the toolbar. You can pause it, resume it, and finish it cleanly with a description anytime.",
  "Nachträge": "Backdating",
  "Vergangene Arbeit": "Past work",
  "Vergangene Arbeit nachtragen": "Log past work",
  "Im Nachtragsassistenten erfasst du Datum, Zeitraum, Grund und Pausen. Tarlog trennt dabei tatsächliche Zeit und Abrechnungszeit.":
    "The backdating assistant captures date, time range, reason, and breaks. Tarlog keeps actual time and billable time separate.",
  "Sync": "Sync",
  "Geräte & Server": "Devices & server",
  "Sync nach Bedarf einrichten": "Set up sync as needed",
  "Der lokale Desktop-Modus funktioniert ohne Konto und Internet. Einen selbst gehosteten Server kannst du ergänzen, wenn du mehrere Geräte abgleichen möchtest.":
    "Local desktop mode works without an account or internet. You can add a self-hosted server later if you want to sync multiple devices.",
  "Bereit": "Ready",
  "Einrichtung abgeschlossen": "Setup complete",
  "Tarlog ist bereit": "Tarlog is ready",
  "Es wurden keine Demo-Zeiten erzeugt. Starte jetzt eine echte Bearbeitung oder öffne das Dashboard für den Überblick.":
    "No demo time entries were created. Start real work now, or open the dashboard for an overview.",

  // Header / rail / footer
  "Tarlog Ersteinrichtung": "Tarlog initial setup",
  "Tarlog Einführung": "Tarlog introduction",
  "Einführung": "Introduction",
  "Einführung schließen": "Close introduction",
  "Einführungsschritte": "Introduction steps",
  "{current} von {total}": "{current} of {total}",
  "Deine Daten bleiben standardmäßig auf diesem Gerät.": "Your data stays on this device by default.",
  "Wird gesichert …": "Saving…",
  "Zurück": "Back",
  "Schließen": "Close",
  "Zum Dashboard": "Go to dashboard",
  "Timer öffnen": "Open timer",
  "Weiter": "Continue",

  // WelcomeStep
  "Lokal auf deinem Mac": "Local on your Mac",
  "Ohne Anmeldung, Cloud-Zwang oder dauerhafte Internetverbindung.": "No sign-in, cloud requirement, or constant internet connection.",
  "Nachvollziehbare Zeiten": "Traceable time",
  "Ist-Zeit und gerundete Abrechnungszeit bleiben sauber getrennt.": "Actual time and rounded billable time stay cleanly separated.",
  "Timer und Nachträge": "Timer and backdating",
  "Erfasse laufende Arbeit direkt und Vergangenes mit einer Begründung.": "Track work as it happens, or add past work with a reason.",

  // WorkspaceStep
  "Projekte werden geladen …": "Loading projects…",
  "Bitte wähle ein bestehendes Projekt aus.": "Please choose an existing project.",
  "Projektname ist erforderlich.": "Project name is required.",
  "Festpreis": "Fixed fee",
  "Stundensatz": "Hourly rate",
  "Bitte gib den {label} als Zahl mit höchstens zwei Nachkommastellen ein.":
    "Please enter the {label} as a number with at most two decimal places.",
  "Projektquelle": "Project source",
  "Bestehendes Projekt": "Existing project",
  "Neues Projekt": "New project",
  "Projekt": "Project",
  "Projekt auswählen …": "Choose a project…",
  "Die Einführung verändert das ausgewählte Projekt nicht.": "The introduction doesn't change the selected project.",
  "Projekt verwenden": "Use project",
  "Kunde wurde angelegt und wird weiterverwendet.": "Customer created and will continue to be used.",
  "Kunde": "Customer",
  "Optional | Für interne Projekte leer lassen.": "Optional | Leave blank for internal projects.",
  "Name oder Unternehmen": "Name or company",
  "Kundenzuordnung": "Customer assignment",
  "Optional": "Optional",
  "Kein Kunde | internes Projekt": "No customer | internal project",
  "Neuen Kunden anlegen": "Add new customer",
  "z. B. Muster GmbH": "e.g. Acme Inc.",
  "Projektname": "Project name",
  "z. B. Website-Relaunch": "e.g. Website relaunch",
  "Abrechnung": "Billing",
  "Nicht abrechenbar": "Non-billable",
  "Stundensatz (€)": "Hourly rate (€)",
  "optional": "optional",
  "0,00": "0.00",
  "Festpreis (€)": "Fixed fee (€)",
  "Für dieses Projekt wird kein Preis erfasst.": "No price is recorded for this project.",
  "Projekt anlegen": "Create project",

  // LiveTrackingStep
  "Ablauf eines Live-Timers": "Live timer walkthrough",
  "Projekt wählen": "Choose project",
  "Ordne die Bearbeitung deinem Projekt zu und ergänze, woran du arbeitest.": "Assign the work to your project and note what you're doing.",
  "Pausieren & fortsetzen": "Pause & resume",
  "Pausen werden getrennt erfasst und von der Nettozeit abgezogen.": "Breaks are tracked separately and subtracted from net time.",
  "Stoppen & speichern": "Stop & save",
  "Beim Abschluss prüfst du Beschreibung, Endzeit und die Rundungsvorschau.": "When you finish, review the description, end time, and rounding preview.",
  "Immer erreichbar": "Always within reach",
  "Der kompakte Timer oben in der App zeigt Status und Laufzeit in jedem Bereich.": "The compact timer at the top of the app shows status and elapsed time everywhere.",

  // BackdatingStep
  "Beispiel eines Nachtrags": "Backdated entry example",
  "Beispielnachtrag": "Example backdated entry",
  "Konzeptarbeit": "Concept work",
  "Zeitraum": "Period",
  "Heute | 09:00,11:30": "Today | 09:00,11:30",
  "Begründung": "Reason",
  "Timer vergessen, Meeting oder Offline-Arbeit": "Forgot to start the timer, a meeting, or offline work",
  "Vorschau": "Preview",
  "Nettozeit und Abrechnungsrundung vor dem Speichern": "Net time and billing rounding before saving",
  "Als Nachtrag markiert und im Audit-Verlauf nachvollziehbar": "Marked as backdated and traceable in the audit history",

  // SyncStep
  "Standard": "Standard",
  "Nur auf diesem Gerät": "This device only",
  "Voll unterstützt. Kunden, Projekte und Zeiten liegen in deiner lokalen SQLite-Datenbank; Backups kannst du in den Einstellungen erstellen.":
    "Fully supported. Customers, projects, and time entries live in your local SQLite database; you can create backups in Settings.",
  "Kein Server erforderlich": "No server required",
  "Keine Anmeldung": "No sign-in",
  "Offline vollständig nutzbar": "Fully usable offline",
  "Experimentell": "Experimental",
  "Eigener Tarlog-Server": "Self-hosted Tarlog server",
  "Die Webanwendung kann selbst gehostet werden. Der native Desktop-Abgleich über Pairing, Event-Log und Live-Kanal befindet sich noch in Erprobung.":
    "The web app can be self-hosted. Native desktop sync via pairing, event log, and live channel is still in testing.",
  "Server bleibt unter deiner Kontrolle": "Server stays under your control",
  "WebSocket mit Polling-Fallback vorgesehen": "WebSocket with polling fallback planned",
  "Keine Verbindung wird jetzt automatisch hergestellt": "No connection is established automatically right now",
  "Du kannst den Betriebsmodus später jederzeit im Bereich „Sync“ prüfen. Lokal erfasste Daten bleiben dabei erhalten.":
    "You can check the operating mode anytime later in the “Sync” area. Locally recorded data is preserved.",

  // ReadyStep
  "Projekt vorbereitet": "Project ready",
  "Kunde und Projekt sind angelegt.": "Customer and project are set up.",
  "Dein Projekt ist angelegt und kann sofort verwendet werden.": "Your project is set up and ready to use right away.",
  "Live arbeiten": "Work live",
  "Timer öffnen, Projekt wählen und starten": "Open the timer, choose a project, and start",
  "Vergangenes erfassen": "Log past work",
  "„Nachträge“ in der Seitenleiste öffnen": "Open “Backdating” in the sidebar",
  "Einführung wiederholen": "Replay the introduction",
  "Über „Einführung“ unten in der Seitenleiste": "Via “Introduction” at the bottom of the sidebar",
};
