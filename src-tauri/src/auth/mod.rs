//! Authentication — OAuth token capture + secure storage.
//!
//! SoundCloud has no usable public OAuth app for us, so we reuse the web app's
//! own session: open SoundCloud's real sign-in page in an embedded webview, let
//! the user log in normally (email, Google/Apple SSO, 2FA — all handled by SC),
//! then read the `oauth_token` cookie the web app sets. That cookie is the
//! bearer used as `Authorization: OAuth <token>` on api-v2 (see docs/sc-api.md).
//!
//! The token is stored in the OS keyring (NEVER a file or code — CLAUDE.md).
//! We never log the token.

use std::time::{Duration, Instant};

use keyring::Entry;
use serde::{Serialize, Serializer};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

const KEYRING_SERVICE: &str = "com.cloudifyplayer.app";
const KEYRING_ACCOUNT: &str = "soundcloud-oauth-token";

const LOGIN_LABEL: &str = "sc-login";
const SIGNIN_URL: &str = "https://soundcloud.com/signin";
/// Cookie the SoundCloud web app stores the bearer token in.
const TOKEN_COOKIE: &str = "oauth_token";
/// How long to keep the login window open waiting for a successful sign-in.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const POLL_INTERVAL: Duration = Duration::from_millis(800);

/// Injected into the login window before SoundCloud's own scripts run. SC probes
/// media devices (captcha/anti-fraud), which WebKitGTK surfaces as a system
/// camera/mic permission prompt. We never use media, so stub the APIs out — the
/// page still works, the prompt never appears.
const DENY_MEDIA_JS: &str = r#"
(() => {
  const deny = () => Promise.reject(
    new DOMException('Media access disabled by Cloudify Player', 'NotAllowedError')
  );
  try {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = deny;
      navigator.mediaDevices.getDisplayMedia = deny;
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
    }
    navigator.getUserMedia = navigator.webkitGetUserMedia =
      navigator.mozGetUserMedia = (_c, _ok, err) => { if (err) err(new Error('denied')); };
  } catch (_) {}
})();
"#;

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("keyring error: {0}")]
    Keyring(#[from] keyring::Error),

    #[error("tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("login window was closed before sign-in completed")]
    Cancelled,

    #[error("login timed out")]
    Timeout,
}

impl Serialize for AuthError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

fn entry() -> Result<Entry, AuthError> {
    Ok(Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)?)
}

/// Persist the OAuth token in the OS keyring.
pub fn save_token(token: &str) -> Result<(), AuthError> {
    entry()?.set_password(token)?;
    Ok(())
}

/// Load the stored token, or `None` if the user is not logged in.
pub fn load_token() -> Result<Option<String>, AuthError> {
    match entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Remove the stored token (logout). No-op if nothing is stored.
pub fn clear_token() -> Result<(), AuthError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.into()),
    }
}

/// Open the embedded SoundCloud sign-in window and wait until the OAuth token
/// cookie appears, then store it. Resolves when login succeeds.
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
        .initialization_script(DENY_MEDIA_JS)
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
