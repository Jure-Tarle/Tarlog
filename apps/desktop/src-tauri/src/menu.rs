//! Native application menu.
//!
//! macOS receives the standard Apple menu hierarchy and native predefined
//! actions. Other desktop platforms keep Tauri's platform-appropriate default
//! menu so this integration does not introduce macOS-only runtime failures.

use crate::l10n::{tr, Lang};
use crate::native_timer::TimerCommandItems;
#[cfg(target_os = "macos")]
use crate::tray::{
    BACKDATE_EVENT, TIMER_PAUSE_EVENT, TIMER_RESUME_EVENT, TIMER_START_EVENT, TIMER_STOP_EVENT,
};
use tauri::{menu::Menu, AppHandle, Runtime};

#[cfg(target_os = "macos")]
const SETTINGS_EVENT: &str = "menu://navigate/settings";
#[cfg(target_os = "macos")]
const SIDEBAR_TOGGLE_EVENT: &str = "menu://toggle-sidebar";
#[cfg(target_os = "macos")]
const APPEARANCE_SYSTEM_EVENT: &str = "menu://appearance/system";
#[cfg(target_os = "macos")]
const APPEARANCE_LIGHT_EVENT: &str = "menu://appearance/light";
#[cfg(target_os = "macos")]
const APPEARANCE_DARK_EVENT: &str = "menu://appearance/dark";

/// Install the application-wide native menu.
pub fn install<R: Runtime>(app: &AppHandle<R>, lang: Lang) -> tauri::Result<TimerCommandItems<R>> {
    let mut commands = TimerCommandItems::empty();

    #[cfg(target_os = "macos")]
    let menu = {
        let (menu, macos_commands) = macos_menu(app, lang)?;
        commands.extend(macos_commands);
        menu
    };

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let _ = lang;
        Menu::default(app)?
    };

    app.set_menu(menu)?;

    #[cfg(target_os = "macos")]
    register_macos_actions(app);

    Ok(commands)
}

#[cfg(target_os = "macos")]
fn register_macos_actions<R: Runtime>(app: &AppHandle<R>) {
    use tauri::Emitter;

    app.on_menu_event(|app, event| {
        let event_name = match event.id().as_ref() {
            "app_settings" => Some(SETTINGS_EVENT),
            "app_timer_start" => Some(TIMER_START_EVENT),
            "app_timer_pause" => Some(TIMER_PAUSE_EVENT),
            "app_timer_resume" => Some(TIMER_RESUME_EVENT),
            "app_timer_stop" => Some(TIMER_STOP_EVENT),
            "app_entry_backdate" => Some(BACKDATE_EVENT),
            "app_toggle_sidebar" => Some(SIDEBAR_TOGGLE_EVENT),
            "app_appearance_system" => Some(APPEARANCE_SYSTEM_EVENT),
            "app_appearance_light" => Some(APPEARANCE_LIGHT_EVENT),
            "app_appearance_dark" => Some(APPEARANCE_DARK_EVENT),
            _ => None,
        };

        if let Some(event_name) = event_name {
            // Menu clicks can happen while the webview is still booting. The
            // native shell must remain usable even if no listener exists yet.
            let _ = app.emit(event_name, ());
        }
    });
}

#[cfg(target_os = "macos")]
fn macos_menu<R: Runtime>(
    app: &AppHandle<R>,
    lang: Lang,
) -> tauri::Result<(Menu<R>, TimerCommandItems<R>)> {
    use tauri::menu::{
        AboutMetadata, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
    };

    let package = app.package_info();
    let about = AboutMetadata {
        name: Some("Tarlog".into()),
        version: Some(package.version.to_string()),
        copyright: app.config().bundle.copyright.clone(),
        authors: Some(vec!["Tarlog".into()]),
        icon: app.default_window_icon().cloned(),
        ..Default::default()
    };
    let settings = MenuItem::with_id(
        app,
        "app_settings",
        tr(lang, "Einstellungen…"),
        true,
        Some("CmdOrCtrl+,"),
    )?;

    let application = Submenu::with_items(
        app,
        "Tarlog",
        true,
        &[
            &PredefinedMenuItem::about(app, Some(tr(lang, "Über Tarlog")), Some(about))?,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some(tr(lang, "Dienste")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some(tr(lang, "Tarlog ausblenden")))?,
            &PredefinedMenuItem::hide_others(app, Some(tr(lang, "Andere ausblenden")))?,
            &PredefinedMenuItem::show_all(app, Some(tr(lang, "Alle einblenden")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some(tr(lang, "Tarlog beenden")))?,
        ],
    )?;

    let timer_start = MenuItem::with_id(
        app,
        "app_timer_start",
        tr(lang, "Timer starten"),
        false,
        Some("CmdOrCtrl+T"),
    )?;
    let timer_pause = MenuItem::with_id(
        app,
        "app_timer_pause",
        tr(lang, "Timer pausieren"),
        false,
        None::<&str>,
    )?;
    let timer_resume = MenuItem::with_id(
        app,
        "app_timer_resume",
        tr(lang, "Timer fortsetzen"),
        false,
        None::<&str>,
    )?;
    let timer_stop =
        MenuItem::with_id(app, "app_timer_stop", tr(lang, "Timer stoppen"), false, None::<&str>)?;
    let backdate = MenuItem::with_id(
        app,
        "app_entry_backdate",
        tr(lang, "Nachtrag…"),
        true,
        Some("CmdOrCtrl+Shift+N"),
    )?;

    let file = Submenu::with_items(
        app,
        tr(lang, "Ablage"),
        true,
        &[
            &timer_start,
            &timer_pause,
            &timer_resume,
            &timer_stop,
            &PredefinedMenuItem::separator(app)?,
            &backdate,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, Some(tr(lang, "Fenster schließen")))?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        tr(lang, "Bearbeiten"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(tr(lang, "Widerrufen")))?,
            &PredefinedMenuItem::redo(app, Some(tr(lang, "Wiederholen")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(tr(lang, "Ausschneiden")))?,
            &PredefinedMenuItem::copy(app, Some(tr(lang, "Kopieren")))?,
            &PredefinedMenuItem::paste(app, Some(tr(lang, "Einsetzen")))?,
            &PredefinedMenuItem::select_all(app, Some(tr(lang, "Alles auswählen")))?,
        ],
    )?;

    let toggle_sidebar = MenuItem::with_id(
        app,
        "app_toggle_sidebar",
        tr(lang, "Seitenleiste ein-/ausblenden"),
        true,
        Some("CmdOrCtrl+Alt+S"),
    )?;
    let appearance_system = MenuItem::with_id(
        app,
        "app_appearance_system",
        tr(lang, "Systemdarstellung"),
        true,
        None::<&str>,
    )?;
    let appearance_light =
        MenuItem::with_id(app, "app_appearance_light", tr(lang, "Hell"), true, None::<&str>)?;
    let appearance_dark =
        MenuItem::with_id(app, "app_appearance_dark", tr(lang, "Dunkel"), true, None::<&str>)?;
    let view = Submenu::with_items(
        app,
        tr(lang, "Darstellung"),
        true,
        &[
            &toggle_sidebar,
            &PredefinedMenuItem::separator(app)?,
            &appearance_system,
            &appearance_light,
            &appearance_dark,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, Some(tr(lang, "Vollbild ein-/ausschalten")))?,
        ],
    )?;

    // These IDs let macOS recognize and enrich the native Window/Help menus.
    let window = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        tr(lang, "Fenster"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(tr(lang, "Im Dock ablegen")))?,
            &PredefinedMenuItem::maximize(app, Some(tr(lang, "Zoomen")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::bring_all_to_front(app, Some(tr(lang, "Alle nach vorne bringen")))?,
        ],
    )?;

    let help = Submenu::with_id(app, HELP_SUBMENU_ID, tr(lang, "Hilfe"), true)?;

    let menu = Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])?;
    let commands =
        TimerCommandItems::from_items(timer_start, timer_pause, timer_resume, timer_stop);

    Ok((menu, commands))
}
