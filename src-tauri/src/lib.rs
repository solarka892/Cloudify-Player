//! Cloudify Player — Rust core.
//!
//! Module map (see CLAUDE.md for the rules that govern each):
//!   - `sc_api`    — EVERYTHING touching the SoundCloud internal API lives here.
//!   - `auth`      — OAuth flow, keyring, sessions.
//!   - `cache`     — local SQLite metadata cache.
//!   - `downloads` — track downloads (added later).
//!   - `commands`  — Tauri commands, the Rust↔JS bridge.

mod auth;
mod cache;
mod commands;
mod downloads;
mod sc_api;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_app_version,
            commands::get_client_id,
            commands::sc_login,
            commands::sc_login_browser,
            commands::sc_logout,
            commands::sc_is_logged_in,
            commands::sc_get_me,
            commands::sc_set_token,
            commands::sc_get_likes,
            commands::sc_get_stream_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
