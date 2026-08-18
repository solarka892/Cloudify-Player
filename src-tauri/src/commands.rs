//! Tauri commands — the only bridge between the React frontend and Rust.
//!
//! Keep commands thin: validate input, delegate to a module (`sc_api`, `auth`,
//! …), map errors to something serialisable. No SoundCloud URLs here.

#[cfg(not(target_os = "android"))]
use std::time::{Duration, Instant};

use crate::sc_api::models::Track;
use crate::{auth, bridge, cache, sc_api};

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
/// ## What is allowed to end a session
///
/// Exactly two things: SoundCloud answering 401 to a token, or the user asking
/// to sign out. Nothing else, and this command is where that rule is kept —
/// deleting the token here is irreversible from the app's side, because the
/// replacement has to be fetched through a browser round trip.
///
/// It used to delete on `StaleClientId`, which `sc_api::classify` raises for
/// **both** 401 and 403. So a bot filter, a region block, or SoundCloud having a
/// bad afternoon signed the user out and made them do that round trip. `me.rs`
/// now reaches its own verdict and only says `SessionExpired` when the token was
/// refused a second time with a key fetched seconds earlier.
///
/// A failure to *ask* — no network, a timeout, a rate limit — leaves the token
/// exactly where it is. It says nothing about whether the token is good, and the
/// frontend keeps the user signed in and shows the sheet it already has.
#[tauri::command]
pub async fn sc_get_me() -> Result<sc_api::me::Me, bridge::Failure> {
    let token = require_token().map_err(|m| bridge::stated("not-logged-in", m))?;
    match sc_api::me::get(&token).await {
        Ok(me) => Ok(me),
        Err(e @ sc_api::ScApiError::SessionExpired) => {
            let _ = auth::clear_token();
            Err(bridge::failure(e))
        }
        Err(e) => Err(bridge::failure(e)),
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
pub async fn sc_get_stream_url(track_id: u64) -> Result<sc_api::stream::Stream, String> {
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

// ───────────────────────────────────────────────────────── window insets ────

/// Publish the window's safe-area insets to CSS as `--inset-*`.
///
/// Android only, and only because `env(safe-area-inset-*)` cannot answer there:
/// its webview fills those from the display cutout, so a gesture bar reads as
/// zero. A no-op everywhere else, where `env()` is correct.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn sync_insets() -> Result<(), String> {
    crate::android::insets_sync()
        .await
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn sync_insets() -> Result<(), String> {
    Ok(())
}

// ────────────────────────────────────────────────────────── navigation ────

/// Tell the host whether the app has anywhere to go back to.
///
/// Android only. Its back gesture belongs to the system and the system needs a
/// synchronous answer, so the frontend publishes the bit ahead of time rather
/// than being asked for it at the moment of the press — see `MainActivity.kt`.
/// A no-op everywhere else, where back is a mouse button we handle ourselves.
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn nav_set_can_go_back(value: bool) -> Result<(), String> {
    crate::android::nav_set_can_go_back(value)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub async fn nav_set_can_go_back(_value: bool) -> Result<(), String> {
    Ok(())
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

// ══════════════════════════════════════════════════════════════════════════
// The local store.
//
// Everything below reads and writes `{app_data}/library.db` and never touches
// SoundCloud — with one marked exception, `thread_waveform`, which is at this
// boundary precisely so that `cache` itself stays offline. They are grouped
// here rather than in `cache` for the same reason every other command is: this
// file is the whole of the Rust↔JS bridge, and a second place commands can live
// is a second place to look for them.
// ══════════════════════════════════════════════════════════════════════════

/// Mirror a page of the user's library locally. Returns how many rows were new.
#[tauri::command]
pub fn cache_sync_tracks(app: tauri::AppHandle, tracks: Vec<Track>) -> Result<usize, String> {
    cache::sync_tracks(&app, &tracks).map_err(|e| e.to_string())
}

/// Report that these tracks were asked for and not returned. Returns the ones
/// that crossed into being tombstoned — three separate misses, never one.
#[tauri::command]
pub fn cache_mark_missing(app: tauri::AppHandle, ids: Vec<u64>) -> Result<Vec<String>, String> {
    cache::mark_missing(&app, &ids).map_err(|e| e.to_string())
}

/// Everything the store believes has been removed from SoundCloud.
#[tauri::command]
pub fn cache_gone_tracks(app: tauri::AppHandle) -> Result<Vec<cache::StoredTrack>, String> {
    cache::gone_tracks(&app).map_err(|e| e.to_string())
}

/// The local snapshot of one track, tombstone or not.
#[tauri::command]
pub fn cache_track(
    app: tauri::AppHandle,
    track_id: u64,
) -> Result<Option<cache::StoredTrack>, String> {
    cache::stored_track(&app, track_id).map_err(|e| e.to_string())
}

/// Search the mirror. Offline, transliterated, and it includes mark notes.
#[tauri::command]
pub fn cache_search(
    app: tauri::AppHandle,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<cache::SearchHit>, String> {
    cache::search(&app, &query, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn marks_list(app: tauri::AppHandle, track_id: u64) -> Result<Vec<cache::Mark>, String> {
    cache::marks_list(&app, track_id).map_err(|e| e.to_string())
}

/// Every mark there is, with whatever the store knows about its track.
#[tauri::command]
pub fn marks_all(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<(cache::Mark, Option<cache::StoredTrack>)>, String> {
    cache::marks_all(&app, limit.unwrap_or(500)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn marks_add(
    app: tauri::AppHandle,
    track_id: u64,
    position_ms: i64,
    note: Option<String>,
) -> Result<cache::Mark, String> {
    cache::marks_add(&app, track_id, position_ms, note).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn marks_update(
    app: tauri::AppHandle,
    id: i64,
    note: Option<String>,
    position_ms: Option<i64>,
) -> Result<(), String> {
    cache::marks_update(&app, id, note, position_ms).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn marks_delete(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    cache::marks_delete(&app, id).map_err(|e| e.to_string())
}

/// Every mark as readable text, for the file the user asked for.
#[tauri::command]
pub fn marks_export(app: tauri::AppHandle) -> Result<String, String> {
    cache::marks_export(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn later_list(app: tauri::AppHandle) -> Result<Vec<cache::LaterItem>, String> {
    cache::later_list(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn later_add(app: tauri::AppHandle, track: Track, source: String) -> Result<(), String> {
    cache::later_add(&app, &track, &source).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn later_remove(app: tauri::AppHandle, track_id: u64) -> Result<(), String> {
    cache::later_remove(&app, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn later_keep(app: tauri::AppHandle, track_id: u64) -> Result<(), String> {
    cache::later_keep(&app, track_id).map_err(|e| e.to_string())
}

/// Open a diary entry. The id comes back so the player can close it with what
/// actually happened.
#[tauri::command]
pub fn diary_start(app: tauri::AppHandle, track: Track) -> Result<i64, String> {
    cache::diary_start(&app, &track).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_finish(
    app: tauri::AppHandle,
    id: i64,
    outcome: String,
    position_ms: i64,
) -> Result<(), String> {
    cache::diary_finish(&app, id, &outcome, position_ms).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_list(
    app: tauri::AppHandle,
    limit: Option<u32>,
) -> Result<Vec<cache::DiaryEntry>, String> {
    cache::diary_list(&app, limit.unwrap_or(500)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_prune(app: tauri::AppHandle, keep_days: i64) -> Result<usize, String> {
    cache::diary_prune(&app, keep_days).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diary_clear(app: tauri::AppHandle) -> Result<(), String> {
    cache::diary_clear(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn loudness_get(app: tauri::AppHandle, track_id: u64) -> Result<Option<f64>, String> {
    cache::loudness_get(&app, track_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn loudness_set(app: tauri::AppHandle, track_id: u64, level_db: f64) -> Result<(), String> {
    cache::loudness_set(&app, track_id, level_db).map_err(|e| e.to_string())
}

/// The waveform for the thread: the local copy if there is one, SoundCloud's
/// CDN if there is not, cached either way.
///
/// A missing waveform is not a fault the interface can act on — the thread draws
/// its own shape and seeking works regardless — so a failure comes back as
/// "nothing", not as an error.
#[tauri::command]
pub async fn thread_waveform(
    app: tauri::AppHandle,
    track_id: u64,
    waveform_url: Option<String>,
) -> Result<Option<cache::CachedWaveform>, String> {
    if let Some(cached) = cache::waveform_get(&app, track_id).map_err(|e| e.to_string())? {
        return Ok(Some(cached));
    }
    let Some(url) = waveform_url else {
        return Ok(None);
    };
    let Ok(wave) = sc_api::tracks::waveform(&url).await else {
        return Ok(None);
    };
    cache::waveform_put(&app, track_id, &wave.samples, wave.height).map_err(|e| e.to_string())?;
    Ok(Some(cache::CachedWaveform {
        samples: wave.samples,
        height: wave.height,
    }))
}

/// Has the user already said no to this link? Only a hash of it is stored.
#[tauri::command]
pub fn link_declined(app: tauri::AppHandle, url: String) -> Result<bool, String> {
    cache::link_declined(&app, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decline_link(app: tauri::AppHandle, url: String) -> Result<(), String> {
    cache::decline_link(&app, &url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kv_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    cache::kv_get(&app, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn kv_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    cache::kv_set(&app, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dupes_find(app: tauri::AppHandle) -> Result<Vec<cache::DuplicateGroup>, String> {
    cache::duplicates(&app).map_err(|e| e.to_string())
}

/// Hide duplicates locally. Nothing is unliked or deleted on SoundCloud.
#[tauri::command]
pub fn dupes_hide(app: tauri::AppHandle, ids: Vec<u64>) -> Result<(), String> {
    cache::hide_tracks(&app, &ids).map_err(|e| e.to_string())
}

/// The undo the interface promises: everything hidden comes back.
#[tauri::command]
pub fn dupes_undo(app: tauri::AppHandle) -> Result<usize, String> {
    cache::unhide_all(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dupes_hidden(app: tauri::AppHandle) -> Result<Vec<u64>, String> {
    cache::hidden_ids(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn storage_report(app: tauri::AppHandle) -> Result<cache::StorageReport, String> {
    cache::storage_report(&app).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn storage_erase(app: tauri::AppHandle, id: String) -> Result<(), String> {
    cache::storage_erase(&app, &id).map_err(|e| e.to_string())
}

/// Marks-per-track and tombstones, for a list that is about to render.
#[tauri::command]
pub fn cache_row_facts(app: tauri::AppHandle) -> Result<cache::RowFacts, String> {
    cache::row_facts(&app).map_err(|e| e.to_string())
}
