//! Cloudify Player — Rust core.
//!
//! Module map (see CLAUDE.md for the rules that govern each):
//!   - `sc_api`    — EVERYTHING touching the SoundCloud internal API lives here.
//!   - `auth`      — OAuth flow, keyring, sessions.
//!   - `cache`     — local SQLite metadata cache.
//!   - `downloads` — offline library: files on disk + SQLite index.
//!   - `lyrics`    — LRCLIB (the only non-SoundCloud service we talk to).
//!   - `commands`  — Tauri commands, the Rust↔JS bridge.
//!   - `platform`  — startup workarounds that must precede GTK init.

mod auth;
mod cache;
mod commands;
mod downloads;
mod lyrics;
mod platform;
mod sc_api;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Must precede GTK initialisation: GDK reads its backend once, at startup.
    platform::prepare();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Needs the window, so it cannot go in `platform::prepare`.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(platform::tame_wheel_scrolling);
                }
            }
            let _ = app;
            Ok(())
        })
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
            commands::sc_get_liked_playlists,
            commands::sc_get_playlists,
            commands::sc_get_playlist_tracks,
            commands::sc_get_followings,
            commands::sc_get_user_tracks,
            commands::sc_search_tracks,
            commands::sc_search_users,
            commands::sc_search_playlists,
            commands::sc_get_stream_url,
            commands::sc_mixed_selections,
            commands::sc_related_tracks,
            commands::sc_station_tracks,
            commands::sc_stream,
            commands::sc_play_history,
            commands::get_lyrics,
            commands::download_track,
            commands::list_downloads,
            commands::delete_download,
            commands::sc_get_profile,
            commands::sc_like_track,
            commands::sc_like_playlist,
            commands::sc_follow_user,
            commands::sc_create_playlist,
            commands::sc_add_to_playlist,
            commands::sc_remove_from_playlist,
            commands::sc_get_followers,
            commands::clear_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
