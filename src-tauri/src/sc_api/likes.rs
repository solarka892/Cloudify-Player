//! A user's liked tracks.
//!
//! `GET /users/{id}/likes` returns a mix of liked tracks and playlists; we keep
//! the tracks. Verified in recon (`docs/sc-api.md`). Works with `client_id` for
//! public users; we also send the OAuth token so private accounts work.

use serde::{Deserialize, Serialize};

use super::{client_id, ScApiError, API_V2, USER_AGENT};

/// Minimal track projection for list/grid rendering in the UI.
#[derive(Debug, Serialize)]
pub struct Track {
    pub id: u64,
    pub title: String,
    /// Duration in milliseconds.
    pub duration: u64,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub artist: Option<String>,
}

#[derive(Deserialize)]
struct RawUser {
    username: String,
}

#[derive(Deserialize)]
struct RawTrack {
    id: u64,
    title: String,
    #[serde(default)]
    duration: u64,
    #[serde(default)]
    artwork_url: Option<String>,
    #[serde(default)]
    permalink_url: Option<String>,
    #[serde(default)]
    user: Option<RawUser>,
}

#[derive(Deserialize)]
struct LikeItem {
    // Playlist likes have no `track`; we skip those.
    #[serde(default)]
    track: Option<RawTrack>,
}

#[derive(Deserialize)]
struct LikesResponse {
    #[serde(default)]
    collection: Vec<LikeItem>,
}

/// Fetch the first page of `user_id`'s liked tracks (up to `limit`).
pub async fn get_liked_tracks(
    token: &str,
    user_id: u64,
    limit: u32,
) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let limit_s = limit.to_string();
    let resp: LikesResponse = client
        .get(format!("{API_V2}/users/{user_id}/likes"))
        .query(&[
            ("client_id", cid.as_str()),
            ("limit", limit_s.as_str()),
            ("linked_partitioning", "1"),
        ])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let tracks = resp
        .collection
        .into_iter()
        .filter_map(|item| item.track)
        .map(|t| Track {
            id: t.id,
            title: t.title,
            duration: t.duration,
            artwork_url: t.artwork_url,
            permalink_url: t.permalink_url,
            artist: t.user.map(|u| u.username),
        })
        .collect();

    Ok(tracks)
}
