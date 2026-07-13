//! macOS SF Symbols bridge.
//!
//! React receives only a fixed semantic map. The AppKit symbol names cannot be
//! supplied by the webview, and the generated PNGs live only in memory for the
//! lifetime of the process. Other platforms return an unsupported response so
//! the frontend can keep using its cross-platform icon fallback.

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSymbolSet {
    pub supported: bool,
    pub symbols: BTreeMap<String, String>,
    pub missing: Vec<String>,
}

impl SystemSymbolSet {
    fn unsupported() -> Self {
        Self {
            supported: false,
            symbols: BTreeMap::new(),
            missing: Vec::new(),
        }
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::SystemSymbolSet;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use objc2::{rc::autoreleasepool, runtime::AnyObject};
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSBitmapImageRepPropertyKey, NSFontWeightRegular,
        NSImage, NSImageSymbolConfiguration, NSImageSymbolScale,
    };
    use objc2_foundation::{NSDictionary, NSOperatingSystemVersion, NSProcessInfo, NSString};
    use std::{collections::BTreeMap, ffi::c_void, ptr::NonNull, sync::OnceLock};
    use tauri::AppHandle;

    /// The only SF Symbols Tarlog exposes to its webview. Semantic keys keep
    /// AppKit implementation details out of React and prevent arbitrary symbol
    /// lookup through IPC.
    const SYMBOLS: &[(&str, &str, &str)] = &[
        ("dashboard", "square.grid.2x2", "Übersicht"),
        ("timer", "stopwatch", "Timer"),
        ("today", "calendar", "Heute"),
        ("week", "calendar.badge.clock", "Woche"),
        ("customers", "person.2", "Kunden"),
        ("projects", "folder", "Projekte"),
        ("tasks", "checkmark.circle", "Aufgaben"),
        ("reports", "chart.bar", "Reports"),
        ("invoices", "doc.text", "Rechnungen"),
        ("backdating", "clock.arrow.circlepath", "Nachträge"),
        ("compliance", "checkmark.shield", "Compliance"),
        ("settings", "gearshape", "Einstellungen"),
        ("sync", "arrow.triangle.2.circlepath", "Synchronisieren"),
        ("onboarding", "questionmark.circle", "Einführung"),
        ("sidebarToggle", "sidebar.left", "Seitenleiste"),
        ("timerPlay", "play.fill", "Starten"),
        ("timerPause", "pause.fill", "Pausieren"),
        ("timerStop", "stop.fill", "Stoppen"),
        ("themeSystem", "circle.lefthalf.filled", "Systemdarstellung"),
        ("themeLight", "sun.max", "Helle Darstellung"),
        ("themeDark", "moon", "Dunkle Darstellung"),
    ];

    static CACHE: OnceLock<SystemSymbolSet> = OnceLock::new();

    pub async fn load(app: AppHandle) -> Result<SystemSymbolSet, String> {
        if let Some(cached) = CACHE.get() {
            return Ok(cached.clone());
        }

        // Custom Tauri commands run asynchronously, while AppKit image creation
        // belongs on the UI thread. Only owned Rust strings cross this channel.
        let (sender, mut receiver) = tauri::async_runtime::channel(1);
        app.run_on_main_thread(move || {
            let rendered = CACHE.get_or_init(render).clone();
            let _ = sender.try_send(rendered);
        })
        .map_err(|error| format!("SF Symbols konnten nicht eingeplant werden: {error}"))?;

        receiver
            .recv()
            .await
            .ok_or_else(|| "SF-Symbol-Renderer wurde unerwartet beendet".to_owned())
    }

    fn render() -> SystemSymbolSet {
        autoreleasepool(|_| {
            // `imageWithSystemSymbolName` and symbol configurations require
            // macOS 11 or newer. Guard the selector for older supported hosts.
            let minimum = NSOperatingSystemVersion {
                majorVersion: 11,
                minorVersion: 0,
                patchVersion: 0,
            };
            if !NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(minimum) {
                return SystemSymbolSet::unsupported();
            }

            let configuration = NSImageSymbolConfiguration::configurationWithPointSize_weight_scale(
                18.0,
                // SAFETY: AppKit exposes this as an immutable process-global
                // font-weight constant for symbol configuration.
                unsafe { NSFontWeightRegular },
                NSImageSymbolScale::Medium,
            );
            let mut symbols = BTreeMap::new();
            let mut missing = Vec::new();

            for &(key, system_name, accessibility_description) in SYMBOLS {
                match render_symbol(system_name, accessibility_description, &configuration) {
                    Some(data_url) => {
                        symbols.insert(key.to_owned(), data_url);
                    }
                    None => missing.push(key.to_owned()),
                }
            }

            SystemSymbolSet {
                supported: !symbols.is_empty(),
                symbols,
                missing,
            }
        })
    }

    fn render_symbol(
        system_name: &str,
        accessibility_description: &str,
        configuration: &NSImageSymbolConfiguration,
    ) -> Option<String> {
        let name = NSString::from_str(system_name);
        let description = NSString::from_str(accessibility_description);
        let image =
            NSImage::imageWithSystemSymbolName_accessibilityDescription(&name, Some(&description))?;
        let configured = image.imageWithSymbolConfiguration(configuration)?;
        let tiff = configured.TIFFRepresentation()?;
        let bitmap = NSBitmapImageRep::imageRepWithData(&tiff)?;
        let properties = NSDictionary::<NSBitmapImageRepPropertyKey, AnyObject>::new();
        // SAFETY: the dictionary has AppKit's required property-key and object
        // value types; an empty dictionary requests the standard PNG encoder.
        let png = unsafe {
            bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
        }?;

        let bytes = copy_data(&png);
        if bytes.is_empty() {
            return None;
        }
        Some(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
    }

    fn copy_data(data: &objc2_foundation::NSData) -> Vec<u8> {
        let length = data.length();
        let mut bytes = vec![0_u8; length];
        if length > 0 {
            let destination = NonNull::new(bytes.as_mut_ptr().cast::<c_void>())
                .expect("a non-empty Vec always has a non-null pointer");
            // SAFETY: `destination` points to `length` writable bytes owned by
            // `bytes`, and NSData copies exactly that requested length.
            unsafe { data.getBytes_length(destination, length) };
        }
        bytes
    }

    #[cfg(test)]
    mod tests {
        use super::SYMBOLS;
        use std::collections::BTreeSet;

        #[test]
        fn semantic_symbol_keys_are_unique() {
            let keys = SYMBOLS
                .iter()
                .map(|(key, _, _)| *key)
                .collect::<BTreeSet<_>>();
            assert_eq!(keys.len(), SYMBOLS.len());
        }
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn native_system_symbols(app: tauri::AppHandle) -> Result<SystemSymbolSet, String> {
    macos::load(app).await
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn native_system_symbols(_app: tauri::AppHandle) -> Result<SystemSymbolSet, String> {
    Ok(SystemSymbolSet::unsupported())
}
