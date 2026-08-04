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

use std::sync::Mutex;

use serde::Serialize;

use super::{client_id, http_client, me, ScApiError, API_V2};

/// The HTTP verb that turns a collection membership on.
///
/// Likes and follows disagree, which is not something to guess at: the wrong
/// one is a 404 on a route that exists, and the like silently never happened.
#[derive(Clone, Copy)]
enum On {
    Put,
    Post,
}

/// Add to or remove from a collection endpoint. See docs/sc-api.md.
async fn toggle(token: &str, path: String, on: bool, verb: On) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let url = format!("{API_V2}{path}");

    let request = match (on, verb) {
        (true, On::Put) => client.put(&url),
        (true, On::Post) => client.post(&url),
        (false, _) => client.delete(&url),
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

/// The signed-in user's id, remembered after the first lookup.
///
/// The like routes are nested under the user rather than under `/me`, so they
/// need it; asking `/me` on every heart-click would be a round trip for an id
/// that cannot change while a token is valid.
static SELF_ID: Mutex<Option<u64>> = Mutex::new(None);

/// The signed-in user's id, from cache when it is warm.
///
/// Public because the message routes need it too: conversations are addressed
/// as `/users/{me}/conversations/{other}`, so every one of them starts here.
pub async fn self_id(token: &str) -> Result<u64, ScApiError> {
    if let Some(id) = *SELF_ID.lock().expect("SELF_ID poisoned") {
        return Ok(id);
    }
    let id = me::get(token).await?.id;
    *SELF_ID.lock().expect("SELF_ID poisoned") = Some(id);
    Ok(id)
}

/// Forget the cached id — call when the stored token changes.
pub fn forget_self_id() {
    *SELF_ID.lock().expect("SELF_ID poisoned") = None;
}

/// Like or unlike a track.
pub async fn like_track(token: &str, track_id: u64, on: bool) -> Result<(), ScApiError> {
    let me = self_id(token).await?;
    toggle(
        token,
        format!("/users/{me}/track_likes/{track_id}"),
        on,
        On::Put,
    )
    .await
}

/// Like or unlike a playlist or album.
pub async fn like_playlist(token: &str, playlist_id: u64, on: bool) -> Result<(), ScApiError> {
    let me = self_id(token).await?;
    toggle(
        token,
        format!("/users/{me}/playlist_likes/{playlist_id}"),
        on,
        On::Put,
    )
    .await
}

/// Follow or unfollow a user. `POST` to follow — a `PUT` here is a 404.
pub async fn follow_user(token: &str, user_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/me/followings/{user_id}"), on, On::Post).await
}

/// Repost or un-repost a track.
///
/// Route shape probed 2026-08-04: `PUT /me/track_reposts/{id}` answers `403`
/// unauthenticated — the same response our working like route gives, whereas a
/// route that does not exist answers `404`.
pub async fn repost_track(token: &str, track_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/me/track_reposts/{track_id}"), on, On::Put).await
}

/// Repost or un-repost a playlist or album.
pub async fn repost_playlist(token: &str, playlist_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(
        token,
        format!("/me/playlist_reposts/{playlist_id}"),
        on,
        On::Put,
    )
    .await
}

#[derive(Serialize)]
struct TrackRef {
    id: u64,
}

/// The `playlist` half of the envelope SoundCloud's playlist routes expect.
///
/// Every field is skipped when absent, `tracks` included — and that one
/// matters: this is a PUT, so a serialised `"tracks": []` is not "leave the
/// tracks alone", it is "empty the playlist". Renaming a set must not be able
/// to delete it.
#[derive(Serialize)]
struct PlaylistBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sharing: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tracks: Option<Vec<TrackRef>>,
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
                description: None,
                sharing: Some(if public { "public" } else { "private" }),
                tracks: Some(track_ids.iter().map(|&id| TrackRef { id }).collect()),
            },
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(created.id)
}

/// Edit a playlist's metadata, leaving its tracks untouched.
///
/// `None` means "don't change this field" — `tracks` is never sent from here,
/// so a rename cannot empty the set.
pub async fn edit_playlist(
    token: &str,
    playlist_id: u64,
    title: Option<&str>,
    description: Option<&str>,
    public: Option<bool>,
) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .put(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title,
                description,
                sharing: public.map(|p| if p { "public" } else { "private" }),
                tracks: None,
            },
        })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Delete a playlist for good. `DELETE /playlists/{id}` answers `401`
/// unauthenticated, so the route is real (probed 2026-08-04).
pub async fn delete_playlist(token: &str, playlist_id: u64) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .delete(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
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
                description: None,
                sharing: None,
                tracks: Some(track_ids.iter().map(|&id| TrackRef { id }).collect()),
            },
        })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
