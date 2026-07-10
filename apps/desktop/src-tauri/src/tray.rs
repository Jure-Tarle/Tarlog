//! tray.rs — menu-bar / system-tray timer (doc 11 §5 nr. 1, §6 nr. 1).
//!
//! STUB: builds the tray icon + a control menu (Start / Pause / Stop / Nachtrag
//! / Beenden). The menu-event handler is empty on purpose — the Rust author
//! wires each item to the corresponding timer command and updates the tray
//! title/icon to reflect running state + sync status (doc 11 §5 nr. 8).

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Runtime,
};

/// Build the tray icon and its control menu. Called once from setup.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let start = MenuItem::with_id(app, "tray_timer_start", "Timer starten", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "tray_timer_pause", "Pause", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "tray_timer_stop", "Stoppen", true, None::<&str>)?;
    let backdate = MenuItem::with_id(app, "tray_entry_backdate", "Nachtrag", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Beenden"))?;

    let menu = Menu::with_items(app, &[&start, &pause, &stop, &backdate, &sep, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Project Time Ledger")
        .on_menu_event(|_app, event| {
            // STUB: route tray actions to the timer commands here.
            match event.id.as_ref() {
                "tray_timer_start"
                | "tray_timer_pause"
                | "tray_timer_stop"
                | "tray_entry_backdate" => { /* TODO: call the matching command */ }
                _ => {}
            }
        });

    // Reuse the app's default icon so the tray renders even before custom art.
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
