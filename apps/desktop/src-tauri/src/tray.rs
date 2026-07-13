//! tray.rs — menu-bar / system-tray timer (doc 11 §5 nr. 1, §6 nr. 1).
//!
//! Builds the tray icon + a control menu (Start / Pause / Resume / Stop /
//! Nachtrag / Beenden). Menu actions are emitted to the single frontend timer
//! controller, which owns command serialization and the mandatory stop dialog.

use crate::native_timer::TimerCommandItems;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Runtime,
};

pub(crate) const TIMER_START_EVENT: &str = "tray://timer/start";
pub(crate) const TIMER_PAUSE_EVENT: &str = "tray://timer/pause";
pub(crate) const TIMER_RESUME_EVENT: &str = "tray://timer/resume";
pub(crate) const TIMER_STOP_EVENT: &str = "tray://timer/stop";
pub(crate) const BACKDATE_EVENT: &str = "tray://entry/backdate";

#[cfg(target_os = "macos")]
fn macos_template_icon() -> tauri::Result<tauri::image::Image<'static>> {
    use std::io::{Cursor, Error, ErrorKind};

    let decoder = png::Decoder::new(Cursor::new(include_bytes!("../icons/tray-icon.png")));
    let mut reader = decoder
        .read_info()
        .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;
    let mut rgba = vec![0; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut rgba)
        .map_err(|error| Error::new(ErrorKind::InvalidData, error))?;

    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return Err(Error::new(
            ErrorKind::InvalidData,
            "macOS tray template must be an 8-bit RGBA PNG",
        )
        .into());
    }

    rgba.truncate(info.buffer_size());
    Ok(tauri::image::Image::new_owned(
        rgba,
        info.width,
        info.height,
    ))
}

/// Build the tray icon and its control menu. Called once from setup.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<TimerCommandItems<R>> {
    // Timer mutations stay disabled until the frontend has loaded the durable
    // timer state and explicitly synchronizes the native command controller.
    let start = MenuItem::with_id(
        app,
        "tray_timer_start",
        "Timer starten",
        false,
        None::<&str>,
    )?;
    let pause = MenuItem::with_id(app, "tray_timer_pause", "Pause", false, None::<&str>)?;
    let resume = MenuItem::with_id(app, "tray_timer_resume", "Fortsetzen", false, None::<&str>)?;
    let stop = MenuItem::with_id(app, "tray_timer_stop", "Stoppen", false, None::<&str>)?;
    let backdate = MenuItem::with_id(app, "tray_entry_backdate", "Nachtrag", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some("Beenden"))?;

    let menu = Menu::with_items(
        app,
        &[&start, &pause, &resume, &stop, &backdate, &sep, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .tooltip("Tarlog")
        .on_menu_event(|app, event| {
            let event_name = match event.id.as_ref() {
                "tray_timer_start" => Some(TIMER_START_EVENT),
                "tray_timer_pause" => Some(TIMER_PAUSE_EVENT),
                "tray_timer_resume" => Some(TIMER_RESUME_EVENT),
                "tray_timer_stop" => Some(TIMER_STOP_EVENT),
                "tray_entry_backdate" => Some(BACKDATE_EVENT),
                _ => None,
            };

            if let Some(event_name) = event_name {
                // The webview may still be booting; a missed transient menu
                // event must not crash the native application shell.
                let _ = app.emit(event_name, ());
            }
        });

    // The dedicated monochrome alpha mask is separate from the colorful app
    // icon. macOS tints template images for light/dark menu bars automatically.
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon(macos_template_icon()?).icon_as_template(true);
    }

    // Other platforms use the standard application icon and retain their
    // native system-tray behavior.
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon().cloned() {
            builder = builder.icon(icon);
        }
    }

    builder.build(app)?;
    Ok(TimerCommandItems::from_items(start, pause, resume, stop))
}
