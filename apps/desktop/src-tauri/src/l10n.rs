//! l10n.rs, native-shell localization for menu + tray labels.
//!
//! Mirrors the frontend dictionary approach (src/i18n): the German label is
//! the key, English is looked up, unknown keys fall back to German. The
//! language is read once at startup from the same `ui.language` settings row
//! the frontend writes; an in-session switch therefore applies to the native
//! shell after an app restart.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    De,
    En,
}

/// Managed-state wrapper so runtime tray updates can read the startup language.
pub struct UiLang(pub Lang);

/// Read the persisted UI language (settings key `ui.language`, account scope)
/// directly from the local DB. Missing DB/table/row → German default.
pub fn ui_language() -> Lang {
    let Ok(conn) = crate::db::open() else {
        return Lang::De;
    };
    let value: Result<String, _> = conn.query_row(
        "SELECT value_json FROM settings \
          WHERE main_account_id=?1 AND scope='account' AND device_id IS NULL \
            AND key='ui.language' LIMIT 1",
        rusqlite::params![crate::db::MAIN_ACCOUNT_ID],
        |row| row.get(0),
    );
    match value.as_deref() {
        Ok("\"en\"") => Lang::En,
        _ => Lang::De,
    }
}

/// Translate a German native-shell label. Unknown keys return the German text.
pub fn tr(lang: Lang, de: &'static str) -> &'static str {
    if lang == Lang::De {
        return de;
    }
    match de {
        // Application menu
        "Einstellungen…" => "Settings…",
        "Über Tarlog" => "About Tarlog",
        "Dienste" => "Services",
        "Tarlog ausblenden" => "Hide Tarlog",
        "Andere ausblenden" => "Hide Others",
        "Alle einblenden" => "Show All",
        "Tarlog beenden" => "Quit Tarlog",
        // File menu
        "Ablage" => "File",
        "Timer starten" => "Start Timer",
        "Timer pausieren" => "Pause Timer",
        "Timer fortsetzen" => "Resume Timer",
        "Timer stoppen" => "Stop Timer",
        "Nachtrag…" => "Backdated Entry…",
        "Fenster schließen" => "Close Window",
        // Edit menu
        "Bearbeiten" => "Edit",
        "Widerrufen" => "Undo",
        "Wiederholen" => "Redo",
        "Ausschneiden" => "Cut",
        "Kopieren" => "Copy",
        "Einsetzen" => "Paste",
        "Alles auswählen" => "Select All",
        // View menu
        "Darstellung" => "View",
        "Seitenleiste ein-/ausblenden" => "Show/Hide Sidebar",
        "Systemdarstellung" => "System Appearance",
        "Hell" => "Light",
        "Dunkel" => "Dark",
        "Vollbild ein-/ausschalten" => "Toggle Full Screen",
        // Window + Help menus
        "Fenster" => "Window",
        "Im Dock ablegen" => "Minimize",
        "Zoomen" => "Zoom",
        "Alle nach vorne bringen" => "Bring All to Front",
        "Hilfe" => "Help",
        // Tray
        "Fortsetzen" => "Resume",
        "Stoppen" => "Stop",
        "Nachtrag" => "Backdated Entry",
        "Beenden" => "Quit",
        "Kein Timer aktiv" => "No active timer",
        "Tarlog, kein Timer aktiv" => "Tarlog, no active timer",
        "Projekt" => "Project",
        "pausiert" => "paused",
        "läuft" => "running",
        _ => de,
    }
}

#[cfg(test)]
mod tests {
    use super::{tr, Lang};

    #[test]
    fn german_passes_through_untranslated() {
        assert_eq!(tr(Lang::De, "Einstellungen…"), "Einstellungen…");
    }

    #[test]
    fn english_translates_known_labels_and_falls_back() {
        assert_eq!(tr(Lang::En, "Einstellungen…"), "Settings…");
        assert_eq!(tr(Lang::En, "Kein Timer aktiv"), "No active timer");
        assert_eq!(tr(Lang::En, "Unbekanntes Label"), "Unbekanntes Label");
    }
}
