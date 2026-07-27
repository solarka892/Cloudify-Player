//! Platform workarounds applied before the GUI toolkit initialises.
//!
//! WebKitGTK on Wayland with NVIDIA's proprietary driver dies at window
//! creation with `Gdk-Message: Error 71 (Protocol error) dispatching to Wayland
//! display.` That is a driver/toolkit incompatibility, not an app bug, but it
//! makes a shipped build unusable on a common desktop configuration — so the
//! app applies the fallbacks itself instead of expecting every user to know
//! two environment variables.
//!
//! Anything the user set explicitly is left alone.

/// Apply the fallbacks. Must run **before** GTK initialises, i.e. before
/// `tauri::Builder::default().run(...)`.
pub fn prepare() {
    #[cfg(target_os = "linux")]
    linux::prepare();
}

#[cfg(target_os = "linux")]
mod linux {
    use std::path::Path;

    pub fn prepare() {
        // The DMA-BUF renderer is the specific part that breaks; disabling it
        // costs little and helps on several driver stacks, so it is applied on
        // Wayland regardless of vendor.
        if is_wayland() && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            // SAFETY: single-threaded startup, before any GUI or worker thread.
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }

        // Falling back to XWayland is the heavier hammer — it costs crisp
        // fractional scaling — so it is reserved for the combination that
        // actually fails.
        if is_wayland() && has_nvidia() && std::env::var_os("GDK_BACKEND").is_none() {
            eprintln!(
                "cloudify: NVIDIA on Wayland detected; using the X11 backend, \
                 which WebKitGTK survives. Override with GDK_BACKEND=wayland."
            );
            // SAFETY: as above.
            unsafe { std::env::set_var("GDK_BACKEND", "x11") };
        }
    }

    fn is_wayland() -> bool {
        std::env::var_os("WAYLAND_DISPLAY").is_some()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|v| v.eq_ignore_ascii_case("wayland"))
                .unwrap_or(false)
    }

    /// The proprietary driver, specifically — nouveau doesn't show the fault.
    fn has_nvidia() -> bool {
        Path::new("/sys/module/nvidia").exists() || Path::new("/dev/nvidiactl").exists()
    }
}
