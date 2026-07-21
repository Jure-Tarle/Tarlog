//! Stable native macOS window-button geometry for the overlay titlebar.
//!
//! Tauri's declarative traffic-light inset is converted through the current
//! backing scale factor. That makes the same configured number resolve to a
//! different AppKit position after moving or resizing a Retina window. Keep one
//! logical AppKit inset instead and restore it after every geometry event.

use objc2_app_kit::{NSView, NSWindow, NSWindowButton};
use tauri::WebviewWindow;

const TRAFFIC_LIGHT_X: f64 = 17.0;
const TRAFFIC_LIGHT_TOP: f64 = 18.0;

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    apply_traffic_light_position(window)?;

    let chrome_window = window.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::Resized(_)
                | tauri::WindowEvent::Moved(_)
                | tauri::WindowEvent::Focused(true)
                | tauri::WindowEvent::ScaleFactorChanged { .. }
        ) {
            let _ = apply_traffic_light_position(&chrome_window);
        }
    });

    Ok(())
}

fn apply_traffic_light_position(window: &WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|webview| unsafe {
        let ns_window: &NSWindow = &*webview.ns_window().cast();
        position_traffic_lights(ns_window, TRAFFIC_LIGHT_X, TRAFFIC_LIGHT_TOP);
    })
}

unsafe fn position_traffic_lights(window: &NSWindow, x: f64, top: f64) {
    let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
        return;
    };
    let Some(minimize) = window.standardWindowButton(NSWindowButton::MiniaturizeButton) else {
        return;
    };
    let zoom = window.standardWindowButton(NSWindowButton::ZoomButton);

    let Some(button_container) = close.superview() else {
        return;
    };
    let close_rect = NSView::frame(&close);
    let button_container_height = NSView::bounds(&button_container).size.height;
    let spacing = NSView::frame(&minimize).origin.x - close_rect.origin.x;
    let mut buttons = vec![close, minimize];
    if let Some(zoom) = zoom {
        buttons.push(zoom);
    }

    for (index, button) in buttons.into_iter().enumerate() {
        let mut origin = NSView::frame(&button).origin;
        origin.x = x + index as f64 * spacing;
        origin.y = button_container_height - top - close_rect.size.height;
        button.setFrameOrigin(origin);
    }
}
