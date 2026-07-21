//! lib.rs, Tauri application wiring (doc 05, doc 11 §5/§6).
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
mod l10n;
mod menu;
mod native_timer;
mod shortcuts;
mod sync_http;
mod system_symbols;
mod tray;
#[cfg(target_os = "macos")]
mod window_chrome;

/// Build and run the desktop app. `main.rs` calls this; the mobile entry point
/// attribute keeps the crate iOS/Android-ready even though V1 targets desktop.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;

    tauri::Builder::default()
        // Local SQLite database (doc 05 §2.1).
        .plugin(tauri_plugin_sql::Builder::new().build())
        // Native local notifications / reminders (doc 11 §5 nr. 4).
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Rust-backed HTTP avoids WebView CORS while Tauri's scoped ACL limits
        // each request to a base URL explicitly configured by the user.
        .plugin(tauri_plugin_http::init())
        .manage(sync_http::SyncHttpScopes::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                window_chrome::install(&window)?;
            }
            // UI language for the native shell, read once from the same
            // settings row the frontend writes (restart applies changes).
            let lang = l10n::ui_language();
            // Native application menu. On macOS this follows Apple's standard
            // Tarlog/Ablage/Bearbeiten/Darstellung/Fenster/Hilfe hierarchy.
            let mut native_timer_commands = menu::install(app.handle(), lang)?;
            // Menu-bar / system-tray timer (doc 11 §5 nr. 1, §6 nr. 1).
            let (tray_timer_commands, tray_timer_status) = tray::build_tray(app.handle(), lang)?;
            native_timer_commands.extend(tray_timer_commands);
            // Keep strong menu-item handles in managed state. All mutations
            // start disabled and the mounted frontend timer controller updates
            // them only after loading the persisted state.
            let _ = app.manage(native_timer_commands);
            let _ = app.manage(tray_timer_status);
            let _ = app.manage(l10n::UiLang(lang));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_init,
            commands::db_migrate,
            commands::save_export_file,
            commands::project_document_import,
            commands::project_document_open,
            commands::project_document_delete,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_stop,
            commands::timer_get_state,
            commands::entry_backdate,
            commands::entry_backdate_update,
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
            sync_http::allow_sync_server_http,
            native_timer::native_timer_commands_update,
            tray::native_timer_status_update,
            shortcuts::tracking_shortcuts_replace,
            shortcuts::reveal_main_window,
            system_symbols::native_system_symbols,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tarlog");
}
