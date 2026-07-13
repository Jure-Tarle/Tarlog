//! lib.rs — Tauri application wiring (doc 05, doc 11 §5/§6).
//!
//! Registers the SQL + notification plugins, builds the tray, and exposes every
//! command from `commands.rs` through the invoke handler. This is the stable
//! skeleton: module authors add command bodies (commands.rs) and tray behavior
//! (tray.rs) without changing this registration surface.

// `pub`, damit die Integrationstests unter `tests/` gegen die echten Commands
// und die SQLite-Schicht laufen (headless Laufzeitnachweis des lokalen Modus,
// doc 02 §4.1).
pub mod commands;
pub mod db;
mod menu;
mod tray;

/// Build and run the desktop app. `main.rs` calls this; the mobile entry point
/// attribute keeps the crate iOS/Android-ready even though V1 targets desktop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Local SQLite database (doc 05 §2.1).
        .plugin(tauri_plugin_sql::Builder::new().build())
        // Native local notifications / reminders (doc 11 §5 nr. 4).
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Native application menu. On macOS this follows Apple's standard
            // Tarlog/Ablage/Bearbeiten/Darstellung/Fenster/Hilfe hierarchy.
            menu::install(app.handle())?;
            // Menu-bar / system-tray timer (doc 11 §5 nr. 1, §6 nr. 1).
            tray::build_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_init,
            commands::db_migrate,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_stop,
            commands::timer_get_state,
            commands::entry_backdate,
            commands::list_time_entries,
            commands::create_customer,
            commands::list_customers,
            commands::create_project,
            commands::list_projects,
            commands::run_backup,
            commands::app_lock_check,
            commands::set_server_connection,
            commands::sync_push,
            commands::sync_pull,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tarlog");
}
