//! tray.rs, menu-bar / system-tray timer (doc 11 §5 nr. 1, §6 nr. 1).
//!
//! Builds the tray icon + a control menu (Start / Pause / Resume / Stop /
//! Nachtrag / Beenden). Menu actions are emitted to the single frontend timer
//! controller, which owns command serialization and the mandatory stop dialog.

use crate::l10n::{tr, Lang, UiLang};
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
pub(crate) struct TrayTimerStatus<R: Runtime> {
    summary: MenuItem<R>,
}

pub fn build_tray<R: Runtime>(
    app: &AppHandle<R>,
    lang: Lang,
) -> tauri::Result<(TimerCommandItems<R>, TrayTimerStatus<R>)> {
    // Timer mutations stay disabled until the frontend has loaded the durable
    // timer state and explicitly synchronizes the native command controller.
    let start = MenuItem::with_id(
        app,
        "tray_timer_start",
        tr(lang, "Timer starten"),
        false,
        None::<&str>,
    )?;
    let pause = MenuItem::with_id(app, "tray_timer_pause", "Pause", false, None::<&str>)?;
    let resume = MenuItem::with_id(
        app,
        "tray_timer_resume",
        tr(lang, "Fortsetzen"),
        false,
        None::<&str>,
    )?;
    let stop = MenuItem::with_id(
        app,
        "tray_timer_stop",
        tr(lang, "Stoppen"),
        false,
        None::<&str>,
    )?;
    let backdate = MenuItem::with_id(
        app,
        "tray_entry_backdate",
        tr(lang, "Nachtrag"),
        true,
        None::<&str>,
    )?;
    let summary = MenuItem::with_id(
        app,
        "tray_timer_summary",
        tr(lang, "Kein Timer aktiv"),
        false,
        None::<&str>,
    )?;
    let status_sep = PredefinedMenuItem::separator(app)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = PredefinedMenuItem::quit(app, Some(tr(lang, "Beenden")))?;

    let menu = Menu::with_items(
        app,
        &[
            &summary,
            &status_sep,
            &start,
            &pause,
            &resume,
            &stop,
            &backdate,
            &sep,
            &quit,
        ],
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
    Ok((
        TimerCommandItems::from_items(start, pause, resume, stop),
        TrayTimerStatus { summary },
    ))
}

fn compact_project_name(name: &str, lang: Lang) -> String {
    let trimmed = name.trim();
    let mut chars = trimmed.chars();
    let short: String = chars.by_ref().take(18).collect();
    if chars.next().is_some() {
        format!("{short}…")
    } else if short.is_empty() {
        tr(lang, "Projekt").to_string()
    } else {
        short
    }
}

fn format_elapsed(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}")
    } else {
        format!("{minutes:02}:{:02}", seconds % 60)
    }
}

#[cfg(test)]
mod status_tests {
    use super::{compact_project_name, format_elapsed, Lang};

    #[test]
    fn menu_bar_duration_stays_compact() {
        assert_eq!(format_elapsed(65), "01:05");
        assert_eq!(format_elapsed(3_661), "1:01");
    }

    #[test]
    fn project_names_are_trimmed_and_bounded() {
        assert_eq!(compact_project_name("  Alpha  ", Lang::De), "Alpha");
        assert_eq!(
            compact_project_name("Ein sehr langes Kundenprojekt", Lang::De),
            "Ein sehr langes Ku…"
        );
        assert_eq!(compact_project_name("", Lang::En), "Project");
    }
}

/// Update the visible native menu-bar label and the first menu item.
#[tauri::command]
pub(crate) fn native_timer_status_update(
    app: AppHandle,
    project_name: Option<String>,
    status: Option<String>,
    elapsed_seconds: u64,
    tray_status: tauri::State<'_, TrayTimerStatus<tauri::Wry>>,
    ui_lang: tauri::State<'_, UiLang>,
) -> Result<(), String> {
    let lang = ui_lang.0;
    let tray = app
        .tray_by_id("main")
        .ok_or_else(|| "Tarlog-Menüleistenobjekt ist nicht verfügbar".to_string())?;

    let active = matches!(status.as_deref(), Some("running" | "paused"));
    if !active {
        tray_status
            .summary
            .set_text(tr(lang, "Kein Timer aktiv"))
            .map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(tr(lang, "Tarlog, kein Timer aktiv")))
            .map_err(|error| error.to_string())?;
        #[cfg(target_os = "macos")]
        tray.set_title(None::<&str>)
            .map_err(|error| error.to_string())?;
        return Ok(());
    }

    let project = compact_project_name(project_name.as_deref().unwrap_or(""), lang);
    let elapsed = format_elapsed(elapsed_seconds);
    let paused = status.as_deref() == Some("paused");
    let state = if paused {
        tr(lang, "pausiert")
    } else {
        tr(lang, "läuft")
    };
    let title = if paused {
        format!("Ⅱ {project} | {elapsed}")
    } else {
        format!("{project} | {elapsed}")
    };

    tray_status
        .summary
        .set_text(format!("{project} {state} | {elapsed}"))
        .map_err(|error| error.to_string())?;
    tray.set_tooltip(Some(format!("Tarlog, {project} {state} | {elapsed}")))
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "macos")]
    tray.set_title(Some(&title))
        .map_err(|error| error.to_string())?;
    Ok(())
}
