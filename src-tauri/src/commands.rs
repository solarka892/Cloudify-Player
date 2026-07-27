//! Tauri commands — the only bridge between the React frontend and Rust.
//!
//! Keep commands thin: validate input, delegate to a module (`sc_api`, `auth`,
//! …), map errors to something serialisable. No SoundCloud URLs here.

use std::time::{Duration, Instant};

use crate::{auth, sc_api};

/// How long to wait for the user to finish logging in in their browser.
const BROWSER_LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
const BROWSER_POLL_INTERVAL: Duration = Duration::from_millis(1500);

/// Returns the app version from Cargo metadata. Used by the frontend to smoke
/// test that the JS↔Rust bridge works.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Auto-extracts SoundCloud's `client_id`. Cached in memory for 24h; pass
/// `force = true` to re-extract. Never log the returned value.
#[tauri::command]
pub async fn get_client_id(force: Option<bool>) -> Result<String, sc_api::ScApiError> {
    sc_api::client_id::get(force.unwrap_or(false)).await
}

/// Open the embedded SoundCloud login window; resolves once the token is
/// captured and stored in the keyring.
#[tauri::command]
pub async fn sc_login(app: tauri::AppHandle) -> Result<(), auth::AuthError> {
    auth::login(app).await
}

/// Remove the stored token.
#[tauri::command]
pub fn sc_logout() -> Result<(), auth::AuthError> {
    auth::clear_token()
}

/// Whether an OAuth token is currently stored.
#[tauri::command]
pub fn sc_is_logged_in() -> Result<bool, auth::AuthError> {
    Ok(auth::load_token()?.is_some())
}

/// Fetch the logged-in user (`/me`). Errors if not logged in.
#[tauri::command]
pub async fn sc_get_me() -> Result<sc_api::me::Me, String> {
    let token = auth::load_token()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "not logged in".to_string())?;
    sc_api::me::get(&token).await.map_err(|e| e.to_string())
}

/// Browser login: open SoundCloud in the user's real browser and wait until the
/// `oauth_token` cookie appears in the browser's cookie store, then validate and
/// store it. Reliable because the anti-bot captcha passes in a real browser.
#[tauri::command]
pub async fn sc_login_browser() -> Result<sc_api::me::Me, String> {
    auth::browser::open_signin().map_err(|e| e.to_string())?;

    let deadline = Instant::now() + BROWSER_LOGIN_TIMEOUT;
    loop {
        if let Some(token) = auth::browser::find_token() {
            // Only accept a token that actually works (skips stale cookies).
            if let Ok(me) = sc_api::me::get(&token).await {
                auth::save_token(&token).map_err(|e| e.to_string())?;
                return Ok(me);
            }
        }
        if Instant::now() >= deadline {
            return Err("timed out waiting for SoundCloud login in the browser".to_string());
        }
        tokio::time::sleep(BROWSER_POLL_INTERVAL).await;
    }
}

/// Manual login: validate a user-provided OAuth token against `/me`, and store
/// it only if valid. This is the reliable fallback when SoundCloud blocks the
/// embedded login with a captcha — the user logs in in their real browser and
/// pastes the `oauth_token` cookie value here. The token is never logged.
#[tauri::command]
pub async fn sc_set_token(token: String) -> Result<sc_api::me::Me, String> {
    let token = token.trim();
    if token.is_empty() {
        return Err("empty token".to_string());
    }
    // Validate before persisting so we never store a bad token.
    let me = sc_api::me::get(token).await.map_err(|e| e.to_string())?;
    auth::save_token(token).map_err(|e| e.to_string())?;
    Ok(me)
}
