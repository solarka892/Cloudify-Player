//! Authentication — OAuth token capture + secure storage.
//!
//! SoundCloud has no usable public OAuth app for us, so we reuse the web app's
//! own session: show SoundCloud's real sign-in page, let the user log in normally
//! (email, Google/Apple SSO, 2FA — all handled by SC), then read the
//! `oauth_token` cookie the web app sets. That cookie is the bearer used as
//! `Authorization: OAuth <token>` on api-v2 (see docs/sc-api.md).
//!
//! Three ways to get there, because no single one works everywhere:
//!
//!   - **Desktop, embedded webview** ([`login`]) — a second Tauri window. Cheap,
//!     but WebKitGTK's fingerprint often trips SoundCloud's captcha.
//!   - **Desktop, real browser** ([`browser`]) — opens the user's own browser and
//!     reads the cookie back out of its store. Survives the captcha.
//!   - **Android, native webview** ([`login_mobile`]) — Tauri cannot open a
//!     second window on mobile, so Kotlin shows the page and reads the cookie
//!     from `CookieManager`. The webview there is Chromium, so the captcha is far
//!     less likely to appear in the first place.
//!
//! The token is stored via [`store`], never in a file or in code (CLAUDE.md).
//! We never log the token.

use serde::{Serialize, Serializer};

#[cfg(not(target_os = "android"))]
pub mod browser;
mod store;

// Both login flows that poll for a cookie need these; a platform with neither
// (iOS, once it exists) would find them unused.
#[cfg(any(desktop, target_os = "android"))]
use std::time::{Duration, Instant};
#[cfg(desktop)]
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(desktop)]
const LOGIN_LABEL: &str = "sc-login";
#[cfg(desktop)]
const SIGNIN_URL: &str = "https://soundcloud.com/signin";
/// Cookie the SoundCloud web app stores the bearer token in.
#[cfg(desktop)]
const TOKEN_COOKIE: &str = "oauth_token";
/// How long to keep the login window open waiting for a successful sign-in.
#[cfg(any(desktop, target_os = "android"))]
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
#[cfg(any(desktop, target_os = "android"))]
const POLL_INTERVAL: Duration = Duration::from_millis(800);

/// Present the embedded webview as a normal desktop Chrome browser. WebKitGTK's
/// default UA triggers SoundCloud's anti-bot verification; a real-looking UA
/// (and NOT tampering with `navigator.*`, which anti-fraud detects) is the best
/// shot at passing. If SC still shows a captcha, use the manual-token path.
#[cfg(desktop)]
const BROWSER_UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/131.0.0.0 Safari/537.36";

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[cfg(not(target_os = "android"))]
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[cfg(target_os = "android")]
    #[error("{0}")]
    Android(#[from] crate::android::AndroidError),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("login window was closed before sign-in completed")]
    Cancelled,

    #[error("login timed out")]
    Timeout,

    /// Only the desktop browser flow can fail this way; Android has no other
    /// browser to reach into.
    #[cfg(not(target_os = "android"))]
    #[error("browser error: {0}")]
    Browser(String),
}

impl Serialize for AuthError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// Persist the OAuth token in the platform's secure store.
pub fn save_token(token: &str) -> Result<(), AuthError> {
    store::set(token)?;
    // A different token may be a different account, and anything cached about
    // "who I am" is now a guess.
    crate::sc_api::actions::forget_self_id();
    Ok(())
}

/// Load the stored token, or `None` if the user is not logged in.
pub fn load_token() -> Result<Option<String>, AuthError> {
    store::get()
}

/// Remove the stored token (logout). No-op if nothing is stored.
pub fn clear_token() -> Result<(), AuthError> {
    crate::sc_api::actions::forget_self_id();
    store::delete()
}

/// Open the embedded SoundCloud sign-in window and wait until the OAuth token
/// cookie appears, then store it. Resolves when login succeeds.
#[cfg(desktop)]
pub async fn login(app: AppHandle) -> Result<(), AuthError> {
    // Reuse an already-open login window instead of stacking a second one.
    if let Some(existing) = app.get_webview_window(LOGIN_LABEL) {
        let _ = existing.set_focus();
    } else {
        WebviewWindowBuilder::new(
            &app,
            LOGIN_LABEL,
            WebviewUrl::External(SIGNIN_URL.parse().expect("valid signin URL")),
        )
        .title("SoundCloud — вход")
        .inner_size(480.0, 720.0)
        .user_agent(BROWSER_UA)
        .build()?;
    }

    let deadline = Instant::now() + LOGIN_TIMEOUT;

    loop {
        // If the user closed the window, treat it as a cancellation.
        let Some(window) = app.get_webview_window(LOGIN_LABEL) else {
            return Err(AuthError::Cancelled);
        };

        // Read the runtime cookie store (includes HttpOnly cookies, unlike JS).
        if let Ok(cookies) = window.cookies() {
            if let Some(cookie) = cookies.iter().find(|c| c.name() == TOKEN_COOKIE) {
                let token = cookie.value().to_string();
                if !token.is_empty() {
                    save_token(&token)?;
                    let _ = window.close();
                    return Ok(());
                }
            }
        }

        if Instant::now() >= deadline {
            let _ = window.close();
            return Err(AuthError::Timeout);
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

/// Android sign-in: hand off to the native `WebView` and wait for it to hand
/// back a token.
///
/// Same shape as the desktop flow, but the cookie is read by Kotlin from
/// `CookieManager` rather than from a Tauri window we own.
#[cfg(target_os = "android")]
pub async fn login_mobile() -> Result<(), AuthError> {
    use crate::android;

    android::login_start().await?;

    let deadline = Instant::now() + LOGIN_TIMEOUT;

    loop {
        let status = android::login_poll().await?;

        if let Some(token) = status.token.filter(|t| !t.is_empty()) {
            save_token(&token)?;
            // The sign-in screen closes itself once it has the cookie; asking
            // again is harmless and covers the case where it did not.
            let _ = android::login_cancel().await;
            return Ok(());
        }

        if status.cancelled {
            return Err(AuthError::Cancelled);
        }

        if Instant::now() >= deadline {
            let _ = android::login_cancel().await;
            return Err(AuthError::Timeout);
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}
