//! Native timer command availability shared by the application menu and tray.
//!
//! The webview owns the timer state machine. It sends only the current status,
//! readiness, and mutation state; this module translates that snapshot into a
//! conservative set of enabled native commands. Unknown or transitional states
//! deliberately expose no timer mutation.

use tauri::{menu::MenuItem, Runtime};

/// Enabled state for the four native timer mutations.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct TimerCommandAvailability {
    start: bool,
    pause: bool,
    resume: bool,
    stop: bool,
}

/// Pure mapping from the frontend timer snapshot to safe native actions.
fn command_availability(
    status: Option<&str>,
    pending: bool,
    ready: bool,
) -> TimerCommandAvailability {
    if !ready || pending {
        return TimerCommandAvailability::default();
    }

    match status {
        Some("idle" | "stopped") => TimerCommandAvailability {
            start: true,
            ..TimerCommandAvailability::default()
        },
        Some("running") => TimerCommandAvailability {
            pause: true,
            stop: true,
            ..TimerCommandAvailability::default()
        },
        Some("paused") => TimerCommandAvailability {
            resume: true,
            stop: true,
            ..TimerCommandAvailability::default()
        },
        // `needs_description`, `sync_pending`, `conflict`, missing state, and
        // future values stay disabled until the webview resolves the state.
        _ => TimerCommandAvailability::default(),
    }
}

/// Menu-item handles from one or more native surfaces.
pub(crate) struct TimerCommandItems<R: Runtime> {
    start: Vec<MenuItem<R>>,
    pause: Vec<MenuItem<R>>,
    resume: Vec<MenuItem<R>>,
    stop: Vec<MenuItem<R>>,
}

impl<R: Runtime> TimerCommandItems<R> {
    pub(crate) fn empty() -> Self {
        Self {
            start: Vec::new(),
            pause: Vec::new(),
            resume: Vec::new(),
            stop: Vec::new(),
        }
    }

    pub(crate) fn from_items(
        start: MenuItem<R>,
        pause: MenuItem<R>,
        resume: MenuItem<R>,
        stop: MenuItem<R>,
    ) -> Self {
        Self {
            start: vec![start],
            pause: vec![pause],
            resume: vec![resume],
            stop: vec![stop],
        }
    }

    pub(crate) fn extend(&mut self, other: Self) {
        self.start.extend(other.start);
        self.pause.extend(other.pause);
        self.resume.extend(other.resume);
        self.stop.extend(other.stop);
    }

    fn update(&self, availability: TimerCommandAvailability) -> tauri::Result<()> {
        set_enabled(&self.start, availability.start)?;
        set_enabled(&self.pause, availability.pause)?;
        set_enabled(&self.resume, availability.resume)?;
        set_enabled(&self.stop, availability.stop)
    }
}

fn set_enabled<R: Runtime>(items: &[MenuItem<R>], enabled: bool) -> tauri::Result<()> {
    for item in items {
        item.set_enabled(enabled)?;
    }
    Ok(())
}

/// Concrete managed state for Tauri's desktop Wry runtime.
pub(crate) type NativeTimerCommands = TimerCommandItems<tauri::Wry>;

/// Synchronize application-menu and tray availability with the frontend state.
#[tauri::command]
pub(crate) fn native_timer_commands_update(
    status: Option<String>,
    pending: bool,
    ready: bool,
    commands: tauri::State<'_, NativeTimerCommands>,
) -> Result<(), String> {
    commands
        .update(command_availability(status.as_deref(), pending, ready))
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{command_availability, TimerCommandAvailability};

    #[test]
    fn disabled_until_frontend_is_ready() {
        assert_eq!(
            command_availability(Some("running"), false, false),
            TimerCommandAvailability::default()
        );
    }

    #[test]
    fn idle_and_stopped_only_enable_start() {
        let start_only = TimerCommandAvailability {
            start: true,
            ..TimerCommandAvailability::default()
        };

        assert_eq!(command_availability(Some("idle"), false, true), start_only);
        assert_eq!(
            command_availability(Some("stopped"), false, true),
            start_only
        );
    }

    #[test]
    fn running_enables_pause_and_stop() {
        assert_eq!(
            command_availability(Some("running"), false, true),
            TimerCommandAvailability {
                pause: true,
                stop: true,
                ..TimerCommandAvailability::default()
            }
        );
    }

    #[test]
    fn paused_enables_resume_and_stop() {
        assert_eq!(
            command_availability(Some("paused"), false, true),
            TimerCommandAvailability {
                resume: true,
                stop: true,
                ..TimerCommandAvailability::default()
            }
        );
    }

    #[test]
    fn pending_overrides_an_actionable_state() {
        assert_eq!(
            command_availability(Some("paused"), true, true),
            TimerCommandAvailability::default()
        );
    }

    #[test]
    fn transitional_unknown_and_missing_states_are_safe() {
        for status in [
            Some("needs_description"),
            Some("sync_pending"),
            Some("conflict"),
            Some("future_status"),
            None,
        ] {
            assert_eq!(
                command_availability(status, false, true),
                TimerCommandAvailability::default()
            );
        }
    }
}
