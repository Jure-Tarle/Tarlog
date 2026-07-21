// Prevents an extra console window on Windows in release (doc 11 §6).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tarlog_desktop_lib::run();
}
