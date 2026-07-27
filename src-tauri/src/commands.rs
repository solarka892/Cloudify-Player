//! Tauri commands — the only bridge between the React frontend and Rust.
//!
//! Keep commands thin: validate input, delegate to a module (`sc_api`, `auth`,
//! …), map errors to something serialisable. No SoundCloud URLs here.

use crate::{auth, sc_api};

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
