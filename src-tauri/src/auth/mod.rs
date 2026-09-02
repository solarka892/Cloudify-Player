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
use std::sync::{Mutex, RwLock};

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

/// Present the embedded webview as a normal desktop browser. The default UA of
/// an embedded webview triggers SoundCloud's anti-bot verification; a
/// real-looking one (and NOT tampering with `navigator.*`, which anti-fraud
/// detects) is the best shot at passing. A captcha may still appear — that one is
/// answerable, and answering it once is the point of this window.
///
/// **Per platform, because a UA that contradicts the engine behind it is itself a
/// bot signal.** Anti-bot systems compare the two, and this used to claim
/// "X11; Linux" everywhere: on macOS that is a Chrome-on-Linux string in front of
/// a WebKit view, which is a combination no real browser produces. Linux keeps
/// exactly the string it has been passing with — there is no reason to
/// experiment on the platform where this works.
#[cfg(all(desktop, target_os = "macos"))]
const BROWSER_UA: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) \
     Version/17.4 Safari/605.1.15";
#[cfg(all(desktop, not(target_os = "macos")))]
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

    /// The sign-in screen handed over a cookie the API will not accept.
    #[cfg(target_os = "android")]
    #[error("SoundCloud rejected the token from that sign-in — please try again")]
    Rejected,
}

impl Serialize for AuthError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

/// The token, once the store has been asked for it.
///
/// `None` means "not asked yet"; `Some(None)` means "asked, and nobody is
/// logged in". The distinction matters — without it every request on a signed
/// out app would go back to the store to be told the same thing again.
///
/// It exists because reaching the store is not free on macOS: the keychain
/// prompts for the login password whenever the binary asking is not one it
/// already trusts, and every command that carries a token was asking. Loading
/// likes, a search, opening a playlist, one tap on a heart — each was a trip to
/// the keychain, so the prompt came back over and over inside a single session.
/// Read once per process and the prompt is a once-per-launch thing at worst.
///
/// (The *other* half of that annoyance is not fixable here: a development build
/// is unsigned and changes identity every time it is compiled, so the keychain
/// treats each rebuild as a different application. Only signing fixes that.)
///
/// Memory only, and deliberately: the token is already held as a `String` for
/// the length of every request that sends it, so keeping one more copy for the
/// life of the process changes nothing about what could read it. What it must
/// not become is a copy that outlives the process — see CLAUDE.md.
static CACHED: RwLock<Option<Option<String>>> = RwLock::new(None);

/// The right to be the one who asks the store.
///
/// The cache above turns many trips into one, but only for threads that arrive
/// after that one has finished. At launch they arrive together — the app asks
/// whether there is a session at the same moment as it loads what is
/// downloaded — and every command that missed an empty cache walked into the
/// keychain on its own. On macOS that is two password prompts stacked on top of
/// each other, which is the complaint this whole cache exists to answer.
///
/// Held *across* the store call, which is the one thing the cache's own lock
/// must never do: a reader waiting here waits for a prompt it would otherwise
/// have raised a second copy of, whereas a reader blocked on `CACHED` would be
/// waiting for a prompt that has nothing to do with it. It guards nothing but a
/// turn, so there is no value to leave inconsistent.
static ASKING: Mutex<()> = Mutex::new(());

/// Persist the OAuth token in the platform's secure store.
pub fn save_token(token: &str) -> Result<(), AuthError> {
    store::set(token)?;
    remember(Some(token.to_string()));
    // A different token may be a different account, and anything cached about
    // "who I am" is now a guess.
    crate::sc_api::actions::forget_self_id();
    Ok(())
}

/// Load the stored token, or `None` if the user is not logged in.
pub fn load_token() -> Result<Option<String>, AuthError> {
    // The cache is read and released, never held across the store call: the
    // store can block on a system dialog, and a write lock held while the user
    // reads a password prompt would stall every command that only wanted the
    // answer already in memory.
    if let Some(token) = cached() {
        return Ok(token);
    }

    // Poisoning is meaningless for a lock over `()`: a thread that panicked
    // inside the store left no half-written value behind it, only an unfinished
    // question, and the next thread through asks it again.
    let _turn = ASKING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());

    // Whoever held the turn has answered it by now, and the answer is the one
    // this thread was queueing for.
    if let Some(token) = cached() {
        return Ok(token);
    }

    let token = store::get()?;
    remember(token.clone());
    Ok(token)
}

/// What the process believes the token is, or `None` if it has not asked yet.
fn cached() -> Option<Option<String>> {
    CACHED.read().ok().and_then(|guard| guard.clone())
}

/// Remove the stored token (logout). No-op if nothing is stored.
pub fn clear_token() -> Result<(), AuthError> {
    crate::sc_api::actions::forget_self_id();
    remember(None);
    store::delete()
}

/// Replace what the process believes the token is.
///
/// A poisoned lock is ignored rather than propagated: the worst it costs is a
/// stale belief that the next `load_token` corrects, and the alternative is
/// failing a sign-in over a lock.
fn remember(token: Option<String>) {
    if let Ok(mut guard) = CACHED.write() {
        *guard = Some(token);
    }
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
            // Only accept a token that actually works, as the desktop browser
            // flow does. A cookie the sign-in screen found is not proof that
            // SoundCloud still honours it, and storing a dead one shows up as a
            // session that expired the instant the user signed in.
            if crate::sc_api::me::get(&token).await.is_err() {
                let _ = android::login_cancel().await;
                return Err(AuthError::Rejected);
            }
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
