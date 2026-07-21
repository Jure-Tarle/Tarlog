/** English dictionary: settings + sync pages. Keys = exact German source strings. */
export const settingsSync: Record<string, string> = {
  // Settings.tsx — rounding modes + roundingBehavior()
  "Keine Rundung": "No rounding",
  "Immer aufrunden": "Always round up",
  "Immer abrunden": "Always round down",
  "Kaufmännisch runden": "Round commercially",
  "Auf das nächste Intervall runden": "Round to the nearest interval",
  "Jede angefangene Einheit berechnen": "Bill every started unit in full",
  "Mindestdauer je Eintrag": "Minimum duration per entry",
  "{n} Minuten": "{n} minutes",
  "das festgelegte Intervall": "the configured interval",
  "Keine Rundung, die Abrechnungszeit entspricht der tatsächlichen Zeit.":
    "No rounding — billed time matches actual time.",
  "Die Abrechnungszeit wird immer auf {interval} aufgerundet.": "Billed time is always rounded up to {interval}.",
  "Die Abrechnungszeit wird immer auf {interval} abgerundet.": "Billed time is always rounded down to {interval}.",
  "Die Abrechnungszeit wird kaufmännisch auf {interval} gerundet.": "Billed time is rounded commercially to {interval}.",
  "Die Abrechnungszeit wird auf das nächste {interval}-Intervall gerundet.":
    "Billed time is rounded to the nearest {interval} interval.",
  "Jede angefangene {interval}-Einheit wird vollständig berechnet.": "Every started {interval} unit is billed in full.",
  "Pro Zeiteintrag werden mindestens {minimum} berechnet, anschließend wird auf {interval} aufgerundet.":
    "At least {minimum} is billed per time entry, then rounded up to {interval}.",
  "Pro Zeiteintrag werden mindestens {minimum} berechnet.": "At least {minimum} is billed per time entry.",
  "Pro Tag werden mindestens {minimum} berechnet.": "At least {minimum} is billed per day.",
  "Pro Projekt werden mindestens {minimum} berechnet.": "At least {minimum} is billed per project.",
  "Die hinterlegte Rundungsregel wird auf die Abrechnungszeit angewendet.":
    "The configured rounding rule is applied to the billed time.",

  // Settings.tsx — page/card chrome
  "Einstellungen": "Settings",
  "Darstellung, Rundung, Sicherheit, Backup": "Appearance, rounding, security, backup",
  "Darstellung": "Appearance",
  "Erscheinungsbild und Lesbarkeit auf diesem Gerät": "Appearance and readability on this device",
  "Erscheinungsmodus": "Appearance mode",
  "Wechsle sofort zwischen Hell und Dunkel oder lasse Tarlog automatisch dem Mac folgen.":
    "Switch instantly between light and dark, or let Tarlog follow the Mac automatically.",
  "Erscheinungsbild auswählen": "Choose appearance",
  "System": "System",
  "Folgt dem Gerät": "Follows the device",
  "Hell": "Light",
  "Helle Systemflächen": "Light system surfaces",
  "Dunkel": "Dark",
  "Dunkle Systemflächen": "Dark system surfaces",
  "Aktiv:": "Active:",
  "Systemdarstellung": "System appearance",
  "Textgröße": "Text size",
  "Skaliert die Oberfläche auf diesem Gerät.": "Scales the interface on this device.",
  "Klein": "Small",
  "Mehr Inhalt auf einmal": "More content at once",
  "Standard": "Standard",
  "Empfohlene Größe": "Recommended size",
  "Groß": "Large",
  "Besser lesbar": "Easier to read",
  "Sehr groß": "Extra large",
  "Maximale Lesbarkeit": "Maximum readability",

  // Settings.tsx — language picker
  "Sprache": "Language",
  "Sprache der Benutzeroberfläche": "Interface language",
  "Das native macOS-Menü übernimmt die neue Sprache nach einem Neustart der App.":
    "The native macOS menu picks up the new language after restarting the app.",

  // Settings.tsx — global shortcuts
  "Globale Kurzbefehle": "Global shortcuts",
  "Timer für ein Projekt starten oder stoppen, auch wenn Tarlog im Hintergrund ist":
    "Start or stop a project's timer, even while Tarlog is in the background",
  "Sichern": "Save",
  "Projekt": "Project",
  "Projekt auswählen": "Select project",
  "Aktion": "Action",
  "Starten / stoppen": "Start / stop",
  "Nur starten": "Start only",
  "Nur stoppen": "Stop only",
  "Tastenkombination": "Keyboard shortcut",
  "Klicke und drücke z. B. ⌘ ⇧ 1": "Click and press, e.g. ⌘ ⇧ 1",
  "Aufnehmen …": "Record …",
  "Kurzbefehl entfernen": "Remove shortcut",
  "Entfernen": "Remove",
  "Noch keine Kurzbefehle": "No shortcuts yet",
  "Lege für häufig verwendete Projekte eigene Tastenkombinationen an.":
    "Set up your own keyboard shortcuts for frequently used projects.",
  "Kurzbefehl hinzufügen": "Add shortcut",
  "Zuerst Projekt erstellen": "Create a project first",
  "Diese Einstellung gilt nur für diesen Mac beziehungsweise PC.": "This setting only applies to this Mac or PC.",
  "Kurzbefehle sind auf diesem Gerät aktiv.": "Shortcuts are active on this device.",

  // Settings.tsx — rounding rules
  "Rundungsregeln": "Rounding rules",
  "Nur die Abrechnungszeit wird gerundet. Die tatsächlich gearbeitete Zeit bleibt unverändert.":
    "Only the billed time is rounded. The actual time worked stays unchanged.",
  "So funktioniert die Hierarchie": "How the hierarchy works",
  "Ausnahmen werden von oben nach unten geprüft. Die globale Basis darf zur Übersicht frei einsortiert werden, greift fachlich aber immer erst, wenn keine Projekt- oder Kundenregel passt.":
    "Exceptions are checked from top to bottom. The global base rule can be placed anywhere for clarity, but only ever applies when no project or customer rule matches.",
  "Keine Rundungsregeln": "No rounding rules",
  "Priorität und Regel": "Priority and rule",
  "So wird abgerechnet": "How it is billed",
  "Gültigkeit": "Scope",
  "Globale Basis · Rückfallregel": "Global base · fallback rule",
  "Priorität {n}": "Priority {n}",
  "Alle Projekte": "All projects",
  "Projekt: {name}": "Project: {name}",
  "Kunde: {name}": "Customer: {name}",
  "Noch nicht zugeordnet": "Not yet assigned",
  "Bearbeiten": "Edit",
  "{name} nach oben": "Move {name} up",
  "{name} nach unten": "Move {name} down",
  "Regel bearbeiten": "Edit rule",
  "Neue Regel": "New rule",
  "Berechnung, Ziel und Rolle in der Hierarchie aktualisieren.": "Update calculation, target, and role in the hierarchy.",
  "Wähle eine Berechnung und ordne sie direkt einem Ziel zu.": "Choose a calculation and assign it directly to a target.",
  "Name": "Name",
  "z. B. Auf 10 Minuten runden": "e.g. Round to 10 minutes",
  "Rundungsmodus": "Rounding mode",
  "Intervall": "Interval",
  "Nach der Mindestdauer auf dieses Intervall aufrunden": "Round up to this interval after the minimum duration",
  "Schrittweite der Rundung": "Rounding step size",
  "Für diesen Modus nicht erforderlich": "Not required for this mode",
  "Mindestdauer": "Minimum duration",
  "Mindestens berechnete Zeit je Eintrag": "Minimum billed time per entry",
  "Nur bei Mindestdauer je Eintrag": "Only for minimum duration per entry",
  "Bestimmter Kunde": "Specific customer",
  "Bestimmtes Projekt": "Specific project",
  "Kunde": "Customer",
  "Kunde auswählen": "Select customer",
  "Abbrechen": "Cancel",
  "Wird gespeichert …": "Saving …",
  "Änderungen speichern": "Save changes",
  "Regel anlegen": "Create rule",
  "Um die Basis zu wechseln, bearbeite die gewünschte Regel und wähle „Alle Projekte“.":
    "To change the base, edit the desired rule and select “All projects”.",
  "Rundungsregel wurde aktualisiert.": "Rounding rule was updated.",
  "Rundungsregel wurde angelegt.": "Rounding rule was created.",
  "Reihenfolge wurde gespeichert. Ausnahmen werden von oben nach unten geprüft; die globale Basis bleibt die Rückfallregel.":
    "Order was saved. Exceptions are checked from top to bottom; the global base remains the fallback rule.",

  // Settings.tsx — backup + app lock
  "Lokales Backup": "Local backup",
  "Datenbank und Projektunterlagen": "Database and project documents",
  "Erstellt eine geprüfte SQLite-Kopie sowie einen gleichnamigen": "Creates a verified SQLite copy plus a matching",
  "-Begleitordner mit allen Projektunterlagen. Für eine vollständige Wiederherstellung müssen Datenbank, Manifest und Begleitordner gemeinsam aufbewahrt und zurückgespielt werden.":
    " companion folder with all project documents. For a full restore, the database, manifest, and companion folder must be kept and restored together.",
  "Backup jetzt erstellen": "Create backup now",
  "Backup erstellt: {path} ({size} KB)": "Backup created: {path} ({size} KB)",
  "{n} Dokumente im Begleitordner": "{n} documents in the companion folder",
  "Backup fehlgeschlagen: {message}": "Backup failed: {message}",
  "App-Sperre": "App lock",
  "Noch nicht verfügbar": "Not yet available",
  "Eine verlässliche Startsperre benötigt Passwort-Einrichtung, einen Sperrbildschirm vor dem Datenzugriff und eine sichere Wiederherstellung. Diese Strecke ist noch nicht freigegeben; die lokale Datenbank sollte deshalb über FileVault beziehungsweise BitLocker geschützt werden.":
    "A reliable startup lock needs password setup, a lock screen before data access, and secure recovery. This path is not yet available; the local database should therefore be protected via FileVault or BitLocker instead.",
  "In Vorbereitung": "In progress",

  // Sync.tsx — phase copy
  "Lokal": "Local",
  "Kein Server gekoppelt. Alle Daten bleiben auf diesem Gerät.": "No server paired. All data stays on this device.",
  "Gekoppelt": "Paired",
  "Konfiguration vorhanden; Erreichbarkeit wurde in dieser Sitzung noch nicht bestätigt.":
    "Configuration present; reachability has not yet been confirmed in this session.",
  "Koppeln …": "Pairing …",
  "Pairing-Code und Server werden geprüft.": "Pairing code and server are being checked.",
  "Abgleich läuft …": "Sync in progress …",
  "Lokale Änderungen werden gesendet und Serveränderungen abgerufen.":
    "Local changes are being sent and server changes retrieved.",
  "Transport bestätigt": "Transport confirmed",
  "Der Server hat Push und Pull bestätigt; die Datenanwendung bleibt experimentell.":
    "The server confirmed push and pull; applying the data remains experimental.",
  "Offline": "Offline",
  "Der Server war beim Koppeln nicht erreichbar; es wurde keine Verbindung gespeichert.":
    "The server was unreachable while pairing; no connection was saved.",
  "Gepuffert": "Buffered",
  "Der Server ist nicht erreichbar. Bereits erzeugte Outbox-Ereignisse bleiben retrybar.":
    "The server is unreachable. Already-created outbox events remain retryable.",
  "Konflikt": "Conflict",
  "Mindestens eine Änderung benötigt eine bewusste Auflösung und wurde nicht überschrieben.":
    "At least one change needs a deliberate resolution and was not overwritten.",
  "Fehler": "Error",
  "Der Abgleich wurde nicht als erfolgreich markiert.": "The sync was not marked as successful.",

  // Sync.tsx — device info + error messages
  "Geräte-Pairing wird derzeit nur unter macOS und Windows unterstützt.":
    "Device pairing is currently only supported on macOS and Windows.",
  "Tarlog auf diesem Mac": "Tarlog on this Mac",
  "Tarlog auf diesem PC": "Tarlog on this PC",
  "Der native HTTP-Transport konnte nicht aktiviert werden. Bitte Tarlog neu starten und die Installation prüfen.":
    "The native HTTP transport could not be enabled. Please restart Tarlog and check the installation.",
  "Server nicht erreichbar. Adresse, Netzwerk und TLS-Zertifikat prüfen.":
    "Server unreachable. Check the address, network, and TLS certificate.",
  "Der Server antwortet nicht mit einem kompatiblen Tarlog-Sync-Protokoll.":
    "The server is not responding with a compatible Tarlog sync protocol.",
  "{message} Der Pull-Cursor bleibt unverändert; es gehen keine Serverdaten verloren.":
    "{message} The pull cursor stays unchanged; no server data is lost.",
  "{message} Der Pull-Cursor bleibt unverändert und der Vorgang kann erneut versucht werden.":
    "{message} The pull cursor stays unchanged and the operation can be retried.",
  "Pairing-Code ungültig oder abgelaufen. Bitte in der Webanwendung einen neuen Code erzeugen.":
    "Pairing code invalid or expired. Please generate a new code in the web app.",
  "Der Gerätezugang wurde abgelehnt oder widerrufen. Bitte neu koppeln.":
    "Device access was denied or revoked. Please pair again.",
  "Zu viele Pairing-Versuche. Bitte kurz warten und erneut versuchen.":
    "Too many pairing attempts. Please wait a moment and try again.",
  "Server-Adresse oder Pairing-Daten wurden vom Server abgelehnt.":
    "Server address or pairing data was rejected by the server.",
  "Serverfehler {status}. Der Abgleich wurde nicht bestätigt.": "Server error {status}. The sync was not confirmed.",

  // Sync.tsx — round message pluralization
  "Konflikte": "Conflicts",
  "{n} {word} erkannt. Keine Version wurde still verworfen.": "{n} {word} detected. No version was silently discarded.",
  "Änderung wurde": "change was",
  "Änderungen wurden": "changes were",
  "{n} {word} vom Server abgelehnt und bleibt lokal ausstehend.":
    "{n} {word} rejected by the server and remains locally pending.",
  "Der Server hat den Abgleich nicht vollständig bestätigt.": "The server did not fully confirm the sync.",
  "Netzwerk nicht erreichbar. Bereits vorhandene Outbox-Ereignisse bleiben retrybar; lokale Fachmutationen sind in dieser Vorschau noch nicht vollständig angebunden.":
    "Network unreachable. Existing outbox events remain retryable; local business mutations are not yet fully wired up in this preview.",
  "Event": "event",
  "Events": "events",
  "{n} {word} gesendet, {m} empfangen.": "{n} {word} sent, {m} received.",

  // Sync.tsx — page + cards
  "Sync": "Sync",
  "Experimenteller Self-Host-Abgleich": "Experimental self-hosted sync",
  "Modus": "Mode",
  "Server": "Server",
  "gekoppelt": "paired",
  "vollständig offline nutzbar": "fully usable offline",
  "Status": "Status",
  "Gekoppelte Gegenstelle": "Paired endpoint",
  "Nicht gekoppelt": "Not paired",
  "Letzter bestätigter Transport": "Last confirmed transport",
  "nie": "never",
  "Ausstehend": "Pending",
  "Outbox nicht lesbar": "Outbox unreadable",
  "bereits erzeugte lokale Events": "already-created local events",
  "offen": "open",
  "Server-Verbindung": "Server connection",
  "Experimentell, der lokale Datenbestand bleibt die ausfallsichere Basis.":
    "Experimental — the local dataset remains the fail-safe base.",
  "Transport jetzt prüfen": "Check transport now",
  "Gekoppelt mit": "Paired with",
  ". Bei einem Verbindungsfehler bleiben bereits erzeugte Outbox-Ereignisse retrybar. Konflikte und Server-Ablehnungen werden sichtbar gemeldet. Die Erzeugung lokaler Fachereignisse sowie die Anwendung eingehender Änderungen auf die lokalen Fachdaten sind weiterhin experimentell.":
    ". If a connection error occurs, already-created outbox events remain retryable. Conflicts and server rejections are reported visibly. Generating local business events and applying incoming changes to local business data both remain experimental.",
  "Kopplung lokal entfernen und offline weiterarbeiten": "Remove pairing locally and keep working offline",
  "Mit eigenem Server koppeln": "Pair with your own server",
  "In der Webanwendung unter Geräte einen kurzlebigen Pairing-Code erzeugen.":
    "Generate a short-lived pairing code under Devices in the web app.",
  "Server-Adresse": "Server address",
  "z. B. https://tarlog.example.com": "e.g. https://tarlog.example.com",
  "https://…": "https://…",
  "Pairing-Code": "Pairing code",
  "8 Zeichen, z. B. ABCD-EF23": "8 characters, e.g. ABCD-EF23",
  "ABCD-EF23": "ABCD-EF23",
  "Code wird geprüft …": "Checking code …",
  "Koppeln und ersten Sync prüfen": "Pair and check first sync",
};
