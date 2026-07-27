//! Write operations: likes, follows and playlist editing.
//!
//! ⚠️ **Unverified.** Every endpoint here mutates the signed-in account, so
//! none of them can be exercised by the live test suite (which is read-only
//! and unauthenticated). The shapes follow what soundcloud.com's own web app
//! sends; if one of them turns out to be wrong, this is the first file to
//! look at.
//!
//! All of these require `Authorization: OAuth <token>`. A `401` means the
//! stored token went stale — the UI should prompt for a fresh login rather
//! than retrying.

use serde::Serialize;

use super::{client_id, http_client, ScApiError, API_V2};

/// `PUT` or `DELETE` against a like/follow collection endpoint.
async fn toggle(token: &str, path: String, on: bool) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let url = format!("{API_V2}{path}");

    let request = if on {
        client.put(&url)
    } else {
        client.delete(&url)
    };

    request
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        // SoundCloud rejects a bodyless PUT on these routes with a 415.
        .json(&serde_json::json!({}))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Like or unlike a track.
pub async fn like_track(token: &str, track_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/likes/tracks/{track_id}"), on).await
}

/// Like or unlike a playlist or album.
pub async fn like_playlist(token: &str, playlist_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/likes/playlists/{playlist_id}"), on).await
}

/// Follow or unfollow a user.
pub async fn follow_user(token: &str, user_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/me/followings/{user_id}"), on).await
}

#[derive(Serialize)]
struct TrackRef {
    id: u64,
}

#[derive(Serialize)]
struct PlaylistBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sharing: Option<&'a str>,
    tracks: Vec<TrackRef>,
}

#[derive(Serialize)]
struct PlaylistEnvelope<'a> {
    playlist: PlaylistBody<'a>,
}

/// Create a playlist, optionally seeded with tracks. Returns its id.
pub async fn create_playlist(
    token: &str,
    title: &str,
    track_ids: &[u64],
    public: bool,
) -> Result<u64, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    #[derive(serde::Deserialize)]
    struct Created {
        id: u64,
    }

    let created: Created = client
        .post(format!("{API_V2}/playlists"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title: Some(title),
                sharing: Some(if public { "public" } else { "private" }),
                tracks: track_ids.iter().map(|&id| TrackRef { id }).collect(),
            },
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(created.id)
}

/// Replace a playlist's track list.
///
/// SoundCloud has no "append one track" route — the whole list is sent every
/// time, so callers must read the current tracks first and post the union.
/// `playlists::get_playlist_tracks` is the read side of that pair.
pub async fn set_playlist_tracks(
    token: &str,
    playlist_id: u64,
    track_ids: &[u64],
) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .put(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title: None,
                sharing: None,
                tracks: track_ids.iter().map(|&id| TrackRef { id }).collect(),
            },
        })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
