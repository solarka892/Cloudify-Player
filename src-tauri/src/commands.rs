//! Tauri commands — the only bridge between the React frontend and Rust.
//!
//! Keep commands thin: validate input, delegate to a module (`sc_api`, `auth`,
//! …), map errors to something serialisable. No SoundCloud URLs here.

#[cfg(not(target_os = "android"))]
use std::time::{Duration, Instant};

use crate::{auth, sc_api};

/// How long to wait for the user to finish logging in in their browser.
#[cfg(not(target_os = "android"))]
const BROWSER_LOGIN_TIMEOUT: Duration = Duration::from_secs(180);
#[cfg(not(target_os = "android"))]
const BROWSER_POLL_INTERVAL: Duration = Duration::from_millis(1500);

/// The stored OAuth token, or an error for commands that require a login.
fn require_token() -> Result<String, String> {
    auth::load_token()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "not logged in".to_string())
}

/// The stored token if there is one. Public endpoints send it when available
/// (so private items show up) but must not fail without it.
fn optional_token() -> Option<String> {
    auth::load_token().ok().flatten()
}

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
/// captured and stored securely.
#[cfg(desktop)]
#[tauri::command]
pub async fn sc_login(app: tauri::AppHandle) -> Result<(), auth::AuthError> {
    auth::login(app).await
}

/// As above, but Android cannot open a second window — Kotlin shows the sign-in
/// page in a native `WebView` instead. Same command name, so the frontend does
/// not care which platform it is on.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn sc_login() -> Result<(), auth::AuthError> {
    auth::login_mobile().await
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
///
/// A token SoundCloud still rejects after a `client_id` refresh is dead for
/// good, so it is cleared rather than left to fail on every launch. The error
/// string is a marker the frontend matches on to show the sign-in screen
/// instead of an HTTP dump.
#[tauri::command]
pub async fn sc_get_me() -> Result<sc_api::me::Me, String> {
    let token = require_token()?;
    match sc_api::me::get(&token).await {
        Ok(me) => Ok(me),
        Err(sc_api::ScApiError::StaleClientId) => {
            let _ = auth::clear_token();
            Err("session-expired".to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Browser login is not a thing on Android: there is no other browser's cookie
/// store to read. The command still exists so the frontend can offer the option
/// and get a real explanation rather than an "unknown command" crash.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn sc_login_browser() -> Result<sc_api::me::Me, String> {
    Err("browser sign-in is desktop-only — use the in-app sign-in button".to_string())
}

/// Browsers whose cookie store this build can read. Chromium-family browsers
/// encrypt cookie values with a key held in the OS keychain, so they are out.
#[cfg(target_os = "macos")]
const SUPPORTED_BROWSERS: &str =
    "Safari (needs Full Disk Access for cloudify), Firefox, Zen, LibreWolf and Waterfox";
#[cfg(not(any(target_os = "macos", target_os = "android")))]
const SUPPORTED_BROWSERS: &str = "Firefox, Zen and LibreWolf";

/// Browser login: open SoundCloud in the user's real browser and wait until the
/// `oauth_token` cookie appears in the browser's cookie store, then validate and
/// store it. Reliable because the anti-bot captcha passes in a real browser.
#[cfg(not(target_os = "android"))]
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
            // Name the supported browsers: a timeout here usually means the user
            // signed in somewhere we cannot read, not that they were too slow.
            return Err(format!(
                "timed out waiting for the login cookie. Cookies can be read from \
                 {SUPPORTED_BROWSERS}. If you use a different browser, sign in with a token instead."
            ));
        }
        tokio::time::sleep(BROWSER_POLL_INTERVAL).await;
    }
}

/// Resolve a track to a directly-playable (progressive mp3) stream URL. Public;
/// no login required. The URL is short-lived — call this right before playback.
#[tauri::command]
pub async fn sc_get_stream_url(track_id: u64) -> Result<String, String> {
    sc_api::stream::get_stream_url(track_id)
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the logged-in user's liked tracks (all pages, up to `limit`). Requires
/// login. `limit` bounds very large accounts; defaults to 5000.
#[tauri::command]
pub async fn sc_get_likes(user_id: u64, limit: Option<u32>) -> Result<Vec<sc_api::Track>, String> {
    let token = require_token()?;
    sc_api::likes::get_liked_tracks(&token, user_id, limit.unwrap_or(5000))
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the logged-in user's liked playlists and albums. Requires login.
#[tauri::command]
pub async fn sc_get_liked_playlists(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Playlist>, String> {
    let token = require_token()?;
    sc_api::likes::get_liked_playlists(&token, user_id, limit.unwrap_or(1000))
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the playlists a user created. Public, but the token is sent when we
/// have one so the user's own private sets show up too.
#[tauri::command]
pub async fn sc_get_playlists(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Playlist>, String> {
    let token = optional_token();
    sc_api::playlists::get_user_playlists(token.as_deref(), user_id, limit.unwrap_or(1000))
        .await
        .map_err(|e| e.to_string())
}

/// Fetch a playlist's tracks, in playlist order. Public.
#[tauri::command]
pub async fn sc_get_playlist_tracks(playlist_id: u64) -> Result<Vec<sc_api::Track>, String> {
    let token = optional_token();
    sc_api::playlists::get_playlist_tracks(token.as_deref(), playlist_id)
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the users someone follows. Public.
#[tauri::command]
pub async fn sc_get_followings(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::User>, String> {
    let token = optional_token();
    sc_api::users::get_followings(token.as_deref(), user_id, limit.unwrap_or(2000))
        .await
        .map_err(|e| e.to_string())
}

/// Fetch a user's uploaded tracks. Public.
#[tauri::command]
pub async fn sc_get_user_tracks(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Track>, String> {
    sc_api::users::get_user_tracks(user_id, limit.unwrap_or(500))
        .await
        .map_err(|e| e.to_string())
}

/// Search tracks. Public — works logged out. A blank query returns an empty
/// page. `limit` defaults to 50; page with the returned `next_offset`.
///
/// The `filter_*` arguments mirror soundcloud.com's own narrowing controls;
/// see `sc_api::search::Filters` for the accepted values.
#[tauri::command]
pub async fn sc_search_tracks(
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
    filter_genre: Option<String>,
    filter_duration: Option<String>,
    filter_created_at: Option<String>,
    filter_license: Option<String>,
) -> Result<sc_api::search::SearchPage<sc_api::Track>, String> {
    let filters = sc_api::search::Filters {
        genre: filter_genre.as_deref(),
        duration: filter_duration.as_deref(),
        created_at: filter_created_at.as_deref(),
        license: filter_license.as_deref(),
    };
    sc_api::search::search_tracks(&query, limit.unwrap_or(50), offset.unwrap_or(0), &filters)
        .await
        .map_err(|e| e.to_string())
}

/// Search albums. Distinct from playlists on SoundCloud. Public.
#[tauri::command]
pub async fn sc_search_albums(
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<sc_api::search::SearchPage<sc_api::Playlist>, String> {
    sc_api::search::search_albums(&query, limit.unwrap_or(50), offset.unwrap_or(0))
        .await
        .map_err(|e| e.to_string())
}

/// "Everything": tracks, users and playlists in one ranked list. Public.
#[tauri::command]
pub async fn sc_search_all(
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<sc_api::search::SearchPage<sc_api::search::Mixed>, String> {
    sc_api::search::search_all(&query, limit.unwrap_or(50), offset.unwrap_or(0))
        .await
        .map_err(|e| e.to_string())
}

/// Autocomplete suggestions for the search box. Public.
#[tauri::command]
pub async fn sc_search_suggest(query: String, limit: Option<u32>) -> Result<Vec<String>, String> {
    sc_api::search::suggest(&query, limit.unwrap_or(10))
        .await
        .map_err(|e| e.to_string())
}

/// Search users. Public.
#[tauri::command]
pub async fn sc_search_users(
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<sc_api::search::SearchPage<sc_api::User>, String> {
    sc_api::search::search_users(&query, limit.unwrap_or(50), offset.unwrap_or(0))
        .await
        .map_err(|e| e.to_string())
}

/// Search playlists. Public.
#[tauri::command]
pub async fn sc_search_playlists(
    query: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<sc_api::search::SearchPage<sc_api::Playlist>, String> {
    sc_api::search::search_playlists(&query, limit.unwrap_or(50), offset.unwrap_or(0))
        .await
        .map_err(|e| e.to_string())
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

// ─────────────────────────────────────────────────────────── discovery ────

/// SoundCloud's own curated home-page rows. Public.
#[tauri::command]
pub async fn sc_mixed_selections(
    limit: Option<u32>,
) -> Result<Vec<sc_api::discover::Selection>, String> {
    sc_api::discover::mixed_selections(limit.unwrap_or(10))
        .await
        .map_err(|e| e.to_string())
}

/// "More like this" for a track. Public.
#[tauri::command]
pub async fn sc_related_tracks(
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Track>, String> {
    sc_api::discover::related_tracks(track_id, limit.unwrap_or(30))
        .await
        .map_err(|e| e.to_string())
}

/// An endless station seeded by a track (`seed = "track"`) or an artist
/// (`seed = "artist"`). Public.
#[tauri::command]
pub async fn sc_station_tracks(
    seed: String,
    seed_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Track>, String> {
    if seed != "track" && seed != "artist" {
        return Err("seed must be \"track\" or \"artist\"".to_string());
    }
    sc_api::discover::station_tracks(&seed, seed_id, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// The logged-in user's feed. Requires login.
#[tauri::command]
pub async fn sc_stream(limit: Option<u32>) -> Result<Vec<sc_api::Track>, String> {
    let token = require_token()?;
    sc_api::discover::stream(&token, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Recently played, newest first, de-duplicated. Requires login.
#[tauri::command]
pub async fn sc_play_history(limit: Option<u32>) -> Result<Vec<sc_api::Track>, String> {
    let token = require_token()?;
    sc_api::discover::play_history(&token, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

// ────────────────────────────────────────────────────────────── lyrics ────

/// Lyrics for a track, from LRCLIB. `None` when the track has none — which is
/// the common case on SoundCloud, and not an error.
#[tauri::command]
pub async fn get_lyrics(
    artist: Option<String>,
    title: String,
    duration_ms: Option<u64>,
) -> Result<Option<crate::lyrics::Lyrics>, String> {
    crate::lyrics::get(artist.as_deref().unwrap_or(""), &title, duration_ms)
        .await
        .map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────────── downloads ────

/// Download a track for offline playback. Progress arrives on the
/// `download://progress` event.
#[tauri::command]
pub async fn download_track(
    app: tauri::AppHandle,
    track: sc_api::Track,
) -> Result<crate::downloads::DownloadedTrack, String> {
    crate::downloads::download(&app, track)
        .await
        .map_err(|e| e.to_string())
}

/// Everything in the offline library, newest first.
#[tauri::command]
pub fn list_downloads(
    app: tauri::AppHandle,
) -> Result<Vec<crate::downloads::DownloadedTrack>, String> {
    crate::downloads::list(&app).map_err(|e| e.to_string())
}

/// Delete a downloaded track, file and index row.
#[tauri::command]
pub fn delete_download(app: tauri::AppHandle, track_id: u64) -> Result<(), String> {
    crate::downloads::remove(&app, track_id).map_err(|e| e.to_string())
}

// ───────────────────────────────────────────────────── profiles & writes ────

/// The full profile behind a user page. Public.
#[tauri::command]
pub async fn sc_get_profile(user_id: u64) -> Result<sc_api::Profile, String> {
    sc_api::users::get_profile(user_id)
        .await
        .map_err(|e| e.to_string())
}

/// Like or unlike a track. Requires login.
#[tauri::command]
pub async fn sc_like_track(track_id: u64, on: bool) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::like_track(&token, track_id, on)
        .await
        .map_err(|e| e.to_string())
}

/// Like or unlike a playlist or album. Requires login.
#[tauri::command]
pub async fn sc_like_playlist(playlist_id: u64, on: bool) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::like_playlist(&token, playlist_id, on)
        .await
        .map_err(|e| e.to_string())
}

/// Follow or unfollow a user. Requires login.
#[tauri::command]
pub async fn sc_follow_user(user_id: u64, on: bool) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::follow_user(&token, user_id, on)
        .await
        .map_err(|e| e.to_string())
}

/// Create a playlist, optionally seeded with tracks. Returns its id.
#[tauri::command]
pub async fn sc_create_playlist(
    title: String,
    track_ids: Vec<u64>,
    public: Option<bool>,
) -> Result<u64, String> {
    let token = require_token()?;
    sc_api::actions::create_playlist(&token, &title, &track_ids, public.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

/// Add a track to a playlist.
///
/// SoundCloud replaces the whole track list on every edit, so this reads the
/// current contents first and posts the union — appending is a read-modify-write.
#[tauri::command]
pub async fn sc_add_to_playlist(playlist_id: u64, track_id: u64) -> Result<(), String> {
    let token = require_token()?;
    let existing = sc_api::playlists::get_playlist_tracks(Some(&token), playlist_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut ids: Vec<u64> = existing.iter().map(|t| t.id).collect();
    if ids.contains(&track_id) {
        return Ok(()); // already there; a no-op beats a duplicate
    }
    ids.push(track_id);

    sc_api::actions::set_playlist_tracks(&token, playlist_id, &ids)
        .await
        .map_err(|e| e.to_string())
}

/// Remove a track from a playlist. Same read-modify-write as adding.
#[tauri::command]
pub async fn sc_remove_from_playlist(playlist_id: u64, track_id: u64) -> Result<(), String> {
    let token = require_token()?;
    let existing = sc_api::playlists::get_playlist_tracks(Some(&token), playlist_id)
        .await
        .map_err(|e| e.to_string())?;

    let ids: Vec<u64> = existing
        .iter()
        .map(|t| t.id)
        .filter(|&id| id != track_id)
        .collect();

    sc_api::actions::set_playlist_tracks(&token, playlist_id, &ids)
        .await
        .map_err(|e| e.to_string())
}

/// Fetch the users who follow someone. Public.
#[tauri::command]
pub async fn sc_get_followers(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::User>, String> {
    let token = optional_token();
    sc_api::users::get_followers(token.as_deref(), user_id, limit.unwrap_or(2000))
        .await
        .map_err(|e| e.to_string())
}

/// Delete every downloaded track. Returns how many were removed.
#[tauri::command]
pub fn clear_downloads(app: tauri::AppHandle) -> Result<usize, String> {
    crate::downloads::clear(&app).map_err(|e| e.to_string())
}

// ─────────────────────────────────────────────────────── media session ────

/// Publish what is playing to the OS. Safe to call on every track change and
/// play/pause: a no-op on desktop, where the webview's own Media Session API
/// already covers MPRIS and SMTC.
///
/// On Android this is what keeps playback alive with the screen off — see
/// `crate::media`.
#[tauri::command]
pub async fn media_session_update(state: crate::media::NowPlaying) -> Result<(), String> {
    crate::media::update(state).await
}

/// Playback has stopped for good; drop the OS session and its notification.
#[tauri::command]
pub async fn media_session_stop() -> Result<(), String> {
    crate::media::stop().await
}

// ───────────────────────────────────────────────────────── track pages ────

/// The full track object behind a track page. Public.
#[tauri::command]
pub async fn sc_track_detail(track_id: u64) -> Result<sc_api::TrackDetail, String> {
    let token = optional_token();
    sc_api::tracks::detail(token.as_deref(), track_id)
        .await
        .map_err(|e| e.to_string())
}

/// Users who liked a track. Public.
#[tauri::command]
pub async fn sc_track_likers(
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::User>, String> {
    sc_api::tracks::likers(track_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Users who reposted a track. Public.
#[tauri::command]
pub async fn sc_track_reposters(
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::User>, String> {
    sc_api::tracks::reposters(track_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Playlists a track appears in. Public.
#[tauri::command]
pub async fn sc_track_in_playlists(
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Playlist>, String> {
    sc_api::tracks::in_playlists(track_id, limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

/// The uploader's original file, for tracks with downloads enabled. Requires
/// login even for a public track.
#[tauri::command]
pub async fn sc_track_download_url(track_id: u64) -> Result<String, String> {
    let token = require_token()?;
    sc_api::tracks::download_url(&token, track_id)
        .await
        .map_err(|e| e.to_string())
}

/// A track's waveform samples, fetched from the URL in its detail object.
#[tauri::command]
pub async fn sc_waveform(url: String) -> Result<sc_api::Waveform, String> {
    sc_api::tracks::waveform(&url)
        .await
        .map_err(|e| e.to_string())
}

// ───────────────────────────────────────────────────────────── comments ────

/// A track's comments, newest first. Public.
#[tauri::command]
pub async fn sc_track_comments(
    track_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Comment>, String> {
    let token = optional_token();
    sc_api::comments::list(token.as_deref(), track_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Post a comment, optionally pinned to a point in the track. Requires login.
#[tauri::command]
pub async fn sc_post_comment(
    track_id: u64,
    body: String,
    timestamp_ms: Option<u64>,
) -> Result<sc_api::Comment, String> {
    let token = require_token()?;
    let body = body.trim();
    if body.is_empty() {
        return Err("empty comment".to_string());
    }
    sc_api::comments::post(&token, track_id, body, timestamp_ms)
        .await
        .map_err(|e| e.to_string())
}

/// Delete one of your own comments. Requires login.
#[tauri::command]
pub async fn sc_delete_comment(comment_id: u64) -> Result<(), String> {
    let token = require_token()?;
    sc_api::comments::delete(&token, comment_id)
        .await
        .map_err(|e| e.to_string())
}

// ───────────────────────────────────────────────────────────── messages ────

/// The signed-in user's id, which every message route is keyed on.
async fn me_id() -> Result<(String, u64), String> {
    let token = require_token()?;
    let id = sc_api::actions::self_id(&token)
        .await
        .map_err(|e| e.to_string())?;
    Ok((token, id))
}

/// The inbox: one entry per thread, newest activity first. Requires login.
#[tauri::command]
pub async fn sc_conversations(
    limit: Option<u32>,
) -> Result<Vec<sc_api::messages::Conversation>, String> {
    let (token, me) = me_id().await?;
    sc_api::messages::conversations(&token, me, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// How many threads are unread — the inbox badge. Requires login.
#[tauri::command]
pub async fn sc_unread_messages() -> Result<u64, String> {
    let (token, me) = me_id().await?;
    sc_api::messages::unread_count(&token, me)
        .await
        .map_err(|e| e.to_string())
}

/// One thread's messages, oldest first. Requires login.
#[tauri::command]
pub async fn sc_conversation(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::messages::Message>, String> {
    let (token, me) = me_id().await?;
    sc_api::messages::thread(&token, me, user_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Send a message. Requires login.
#[tauri::command]
pub async fn sc_send_message(user_id: u64, content: String) -> Result<(), String> {
    let (token, me) = me_id().await?;
    let content = content.trim();
    if content.is_empty() {
        return Err("empty message".to_string());
    }
    sc_api::messages::send(&token, me, user_id, content)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a thread read or unread. Requires login.
#[tauri::command]
pub async fn sc_mark_conversation(user_id: u64, read: bool) -> Result<(), String> {
    let (token, me) = me_id().await?;
    sc_api::messages::set_read(&token, me, user_id, read)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a thread. Requires login.
#[tauri::command]
pub async fn sc_delete_conversation(user_id: u64) -> Result<(), String> {
    let (token, me) = me_id().await?;
    sc_api::messages::delete(&token, me, user_id)
        .await
        .map_err(|e| e.to_string())
}

// ──────────────────────────────────────────────────────── notifications ────

/// Likes, comments, follows and reposts on your own things. Requires login.
#[tauri::command]
pub async fn sc_notifications(
    limit: Option<u32>,
) -> Result<Vec<sc_api::activities::Activity>, String> {
    let token = require_token()?;
    sc_api::activities::list(&token, limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

// ───────────────────────────────────────────────────── profile sections ────

/// Albums a user released. Public.
#[tauri::command]
pub async fn sc_get_albums(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Playlist>, String> {
    let token = optional_token();
    sc_api::users::get_albums(token.as_deref(), user_id, limit.unwrap_or(500))
        .await
        .map_err(|e| e.to_string())
}

/// A user's most-played tracks. Public.
#[tauri::command]
pub async fn sc_get_top_tracks(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::Track>, String> {
    sc_api::users::get_top_tracks(user_id, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// What a user pinned to the top of their profile. Public.
#[tauri::command]
pub async fn sc_get_spotlight(
    user_id: u64,
    limit: Option<u32>,
) -> Result<sc_api::users::Mixed, String> {
    sc_api::users::get_spotlight(user_id, limit.unwrap_or(20))
        .await
        .map_err(|e| e.to_string())
}

/// What a user reposted. Public.
#[tauri::command]
pub async fn sc_get_reposts(
    user_id: u64,
    limit: Option<u32>,
) -> Result<sc_api::users::Mixed, String> {
    sc_api::users::get_reposts(user_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

/// Artists SoundCloud considers similar. Public.
#[tauri::command]
pub async fn sc_get_related_artists(
    user_id: u64,
    limit: Option<u32>,
) -> Result<Vec<sc_api::User>, String> {
    sc_api::users::get_related_artists(user_id, limit.unwrap_or(20))
        .await
        .map_err(|e| e.to_string())
}

// ───────────────────────────────────────────────── browse & link paste ────

/// The newest tracks carrying a tag — SoundCloud's genre pages. Public.
#[tauri::command]
pub async fn sc_tag_tracks(tag: String, limit: Option<u32>) -> Result<Vec<sc_api::Track>, String> {
    sc_api::discover::tag_tracks(&tag, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

/// Resolve a pasted soundcloud.com link to the track, user or playlist it
/// points at. Public.
#[tauri::command]
pub async fn sc_resolve(url: String) -> Result<sc_api::resolve::Resolved, String> {
    let token = optional_token();
    sc_api::resolve::resolve(token.as_deref(), &url)
        .await
        .map_err(|e| e.to_string())
}

// ──────────────────────────────────────────── reposts & playlist edits ────

/// Repost or un-repost a track. Requires login.
#[tauri::command]
pub async fn sc_repost_track(track_id: u64, on: bool) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::repost_track(&token, track_id, on)
        .await
        .map_err(|e| e.to_string())
}

/// Repost or un-repost a playlist or album. Requires login.
#[tauri::command]
pub async fn sc_repost_playlist(playlist_id: u64, on: bool) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::repost_playlist(&token, playlist_id, on)
        .await
        .map_err(|e| e.to_string())
}

/// Rename a playlist, change its description or its visibility. Fields left
/// out are untouched — including the track list. Requires login.
#[tauri::command]
pub async fn sc_edit_playlist(
    playlist_id: u64,
    title: Option<String>,
    description: Option<String>,
    public: Option<bool>,
) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::edit_playlist(
        &token,
        playlist_id,
        title.as_deref(),
        description.as_deref(),
        public,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Delete a playlist. Requires login.
#[tauri::command]
pub async fn sc_delete_playlist(playlist_id: u64) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::delete_playlist(&token, playlist_id)
        .await
        .map_err(|e| e.to_string())
}

/// Set a playlist's tracks outright — how reordering and bulk removal work,
/// since SoundCloud replaces the whole list on every edit. Requires login.
#[tauri::command]
pub async fn sc_set_playlist_tracks(playlist_id: u64, track_ids: Vec<u64>) -> Result<(), String> {
    let token = require_token()?;
    sc_api::actions::set_playlist_tracks(&token, playlist_id, &track_ids)
        .await
        .map_err(|e| e.to_string())
}
