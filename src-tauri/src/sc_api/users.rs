//! Other users: who someone follows, and what they've uploaded.
//!
//! `GET /users/{id}/followings` → users. `GET /users/{id}/tracks` → uploads.
//! Both public (`client_id` is enough) and both paginated; verified in recon
//! (`docs/sc-api.md`).
//!
//! The rest of a profile's tabs, all verified public on 2026-08-04:
//! `/albums`, `/toptracks`, `/spotlight`, `/relatedartists`, and the reposts
//! feed at `/stream/users/{id}/reposts`.

use serde::{Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{Playlist, Profile, RawPlaylist, RawProfile, RawTrack, RawUser, Track, User},
    paging::collect_all,
    ScApiError, API_V2,
};

/// The full profile behind a user page. Public.
pub async fn get_profile(user_id: u64) -> Result<Profile, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: RawProfile = client
        .get(format!("{API_V2}/users/{user_id}"))
        .query(&[("client_id", cid.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(Profile::from(raw))
}

/// Fetch the users `user_id` follows.
pub async fn get_followings(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawUser> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/followings"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(User::from).collect())
}

/// Fetch the users who follow `user_id`. Public — same shape as followings.
pub async fn get_followers(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawUser> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/followers"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(User::from).collect())
}

/// Fetch the tracks `user_id` has uploaded, newest first (SoundCloud's order).
pub async fn get_user_tracks(user_id: u64, max: u32) -> Result<Vec<Track>, ScApiError> {
    tracks_at(format!("{API_V2}/users/{user_id}/tracks"), max).await
}

/// The uploader's most-played tracks, in SoundCloud's own ranking.
pub async fn get_top_tracks(user_id: u64, max: u32) -> Result<Vec<Track>, ScApiError> {
    tracks_at(format!("{API_V2}/users/{user_id}/toptracks"), max).await
}

async fn tracks_at(url: String, max: u32) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let raw: Vec<RawTrack> = collect_all(&client, url, None, &cid, max as usize).await?;
    Ok(raw.into_iter().map(Track::from).collect())
}

/// Albums the user released. A separate route from `/playlists`, which on this
/// endpoint returns sets only.
pub async fn get_albums(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<Playlist>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawPlaylist> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/albums"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(Playlist::from).collect())
}

/// Artists SoundCloud considers similar. Powers "fans also like".
pub async fn get_related_artists(user_id: u64, max: u32) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawUser> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/relatedartists"),
        None,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(User::from).collect())
}

/// Tracks and playlists in one response, for the endpoints that mix them.
#[derive(Debug, Default, Serialize)]
pub struct Mixed {
    pub tracks: Vec<Track>,
    pub playlists: Vec<Playlist>,
}

/// Split a collection of heterogeneous objects on the `kind` SoundCloud stamps
/// on each. Dispatching on `kind` rather than trying each shape in turn is
/// deliberate: SoundCloud's objects overlap enough that a permissive decode of
/// a playlist as a track succeeds and produces nonsense.
fn split_mixed(items: Vec<serde_json::Value>) -> Mixed {
    let mut out = Mixed::default();
    for item in items {
        match item.get("kind").and_then(|k| k.as_str()) {
            Some("track") => {
                if let Ok(t) = serde_json::from_value::<RawTrack>(item) {
                    out.tracks.push(Track::from(t));
                }
            }
            Some("playlist") => {
                if let Ok(p) = serde_json::from_value::<RawPlaylist>(item) {
                    out.playlists.push(Playlist::from(p));
                }
            }
            _ => {}
        }
    }
    out
}

/// What the user pinned to the top of their profile. Mixes tracks and sets.
pub async fn get_spotlight(user_id: u64, max: u32) -> Result<Mixed, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<serde_json::Value> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/spotlight"),
        None,
        &cid,
        max as usize,
    )
    .await?;

    Ok(split_mixed(items))
}

#[derive(Deserialize)]
struct RepostItem {
    #[serde(default)]
    track: Option<RawTrack>,
    #[serde(default)]
    playlist: Option<RawPlaylist>,
}

/// What the user reposted, newest first. Public — this is the "Reposts" tab.
pub async fn get_reposts(user_id: u64, max: u32) -> Result<Mixed, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<RepostItem> = collect_all(
        &client,
        format!("{API_V2}/stream/users/{user_id}/reposts"),
        None,
        &cid,
        max as usize,
    )
    .await?;

    let mut out = Mixed::default();
    for item in items {
        if let Some(t) = item.track {
            out.tracks.push(Track::from(t));
        }
        if let Some(p) = item.playlist {
            out.playlists.push(Playlist::from(p));
        }
    }
    Ok(out)
}
