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

/// Turn off WebKitGTK's own wheel-scroll animation.
///
/// `WebKitSettings:enable-smooth-scrolling` defaults to on, and it animates
/// every wheel notch on a curve the page cannot see or shape: scrolling starts
/// slow and then lurches forward. It lives below the web content, which is why
/// no amount of CSS or JavaScript changed it — three attempts at fixing the
/// feel from the frontend (an inertia hook, a pre-blurred backdrop, deferred
/// off-screen rows) all missed for that reason.
///
/// Off, a notch scrolls by exactly what the device asked for, immediately.
#[cfg(target_os = "linux")]
pub fn tame_wheel_scrolling(webview: tauri::webview::PlatformWebview) {
    use webkit2gtk::{SettingsExt, WebViewExt};

    let inner = webview.inner();
    if let Some(settings) = WebViewExt::settings(&inner) {
        settings.set_enable_smooth_scrolling(false);
    }
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
        if is_wayland() && has_nvidia() {
            let current = std::env::var("GDK_BACKEND").ok();
            if let Some(reason) = wants_x11(current.as_deref()) {
                eprintln!(
                    "cloudify: NVIDIA on Wayland detected ({reason}); using the X11 \
                     backend, which WebKitGTK survives. Override with \
                     GDK_BACKEND=wayland."
                );
                // SAFETY: as above.
                unsafe { std::env::set_var("GDK_BACKEND", "x11") };
            }
        }
    }

    /// Whether to force X11, and why — `None` to leave `GDK_BACKEND` alone.
    ///
    /// A set `GDK_BACKEND` is not automatically a decision about *this*: a
    /// desktop session commonly exports a preference list like `wayland,x11`,
    /// and taking that at face value left the app on the one backend known to
    /// fail here — a blank window in a release build, while `dev:app` worked
    /// only because its command line happened to force X11. A list that already
    /// names x11 as acceptable is taken up on the offer early. `wayland` on its
    /// own is somebody insisting, and is honoured.
    fn wants_x11(current: Option<&str>) -> Option<&'static str> {
        match current {
            None => Some("no GDK_BACKEND set"),
            Some(value) => {
                let backends: Vec<&str> = value.split(',').map(str::trim).collect();
                match backends.as_slice() {
                    // Already there, or explicitly not Wayland-first.
                    [first, ..] if *first != "wayland" => None,
                    // Wayland first, with x11 offered as a fallback: use it now.
                    _ if backends.contains(&"x11") => Some("GDK_BACKEND lists x11 as a fallback"),
                    // Wayland and nothing else — a deliberate choice.
                    _ => None,
                }
            }
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

    #[cfg(test)]
    mod tests {
        use super::wants_x11;

        #[test]
        fn forces_x11_when_nothing_is_chosen() {
            assert!(wants_x11(None).is_some());
        }

        #[test]
        fn takes_the_x11_fallback_a_session_already_offers() {
            // The case that shipped broken: Hyprland exports this, and reading
            // it as "the user chose Wayland" left the window blank.
            assert!(wants_x11(Some("wayland,x11")).is_some());
            assert!(wants_x11(Some("wayland, x11")).is_some());
        }

        #[test]
        fn honours_wayland_on_its_own() {
            assert!(wants_x11(Some("wayland")).is_none());
        }

        #[test]
        fn leaves_a_non_wayland_choice_alone() {
            assert!(wants_x11(Some("x11")).is_none());
            assert!(wants_x11(Some("x11,wayland")).is_none());
            assert!(wants_x11(Some("broadway")).is_none());
        }
    }
}
