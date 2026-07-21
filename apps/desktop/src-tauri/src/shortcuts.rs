//! Native, system-wide project shortcuts.
//!
//! The frontend persists the user configuration per device and replaces this
//! registration set after boot or a settings change. Shortcut
//! presses are emitted back to the single frontend timer controller so they
//! follow the same validation and stop-dialog flow as visible controls.

use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub(crate) const TRACKING_SHORTCUT_EVENT: &str = "shortcut://tracking";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackingShortcutBinding {
    id: String,
    project_id: String,
    action: String,
    accelerator: String,
}

#[tauri::command]
pub(crate) fn tracking_shortcuts_replace<R: Runtime>(
    app: AppHandle<R>,
    bindings: Vec<TrackingShortcutBinding>,
) -> Result<(), String> {
    let manager = app.global_shortcut();
    let parsed = bindings
        .into_iter()
        .map(|binding| {
            if !matches!(binding.action.as_str(), "toggle" | "start" | "stop") {
                return Err(format!("Unbekannte Shortcut-Aktion: {}", binding.action));
            }
            let shortcut = Shortcut::from_str(&binding.accelerator).map_err(|error| {
                format!("Ungültiger Kurzbefehl {}: {error}", binding.accelerator)
            })?;
            Ok((binding, shortcut))
        })
        .collect::<Result<Vec<_>, String>>()?;

    // Parse the complete requested set before touching working registrations.
    manager
        .unregister_all()
        .map_err(|error| error.to_string())?;

    for (binding, shortcut) in parsed {
        let payload = binding.clone();
        manager
            .on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    let _ = app.emit(TRACKING_SHORTCUT_EVENT, payload.clone());
                }
            })
            .map_err(|error| {
                format!(
                    "Kurzbefehl {} konnte nicht registriert werden: {error}",
                    binding.accelerator
                )
            })?;
    }

    Ok(())
}

/// Reveal the main window when a shortcut needs the mandatory stop dialog.
#[tauri::command]
pub(crate) fn reveal_main_window(app: AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Tarlog-Hauptfenster ist nicht verfügbar".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::Shortcut;
    use std::str::FromStr;

    #[test]
    fn frontend_accelerators_match_the_native_parser() {
        for accelerator in [
            "CommandOrControl+Shift+1",
            "CommandOrControl+Alt+P",
            "CommandOrControl+Space",
            "Alt+F8",
        ] {
            assert!(Shortcut::from_str(accelerator).is_ok(), "{accelerator}");
        }
    }
}
