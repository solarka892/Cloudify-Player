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
    /// Full URL of the next page (with cursor), or absent on the last page.
    #[serde(default)]
    next_href: Option<String>,
}

/// Per-request page size (api-v2 caps this around 200).
const PAGE_SIZE: u32 = 200;

/// Fetch `user_id`'s liked tracks, following `next_href` pagination until the
/// end (or `max` tracks, a safety bound against very large accounts).
pub async fn get_liked_tracks(
    token: &str,
    user_id: u64,
    max: u32,
) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;
    let auth = format!("OAuth {token}");

    let mut tracks = Vec::new();
    let mut next_url: Option<String> = None;
    let page_size = PAGE_SIZE.to_string();

    loop {
        let mut req = client.get(match &next_url {
            Some(url) => url.clone(),
            None => format!("{API_V2}/users/{user_id}/likes"),
        });
        req = req.header("Authorization", auth.as_str());
        // The first request needs the query params; `next_href` already carries
        // them, but re-add client_id if SC omitted it from the cursor URL.
        match &next_url {
            None => {
                req = req.query(&[
                    ("client_id", cid.as_str()),
                    ("limit", page_size.as_str()),
                    ("linked_partitioning", "1"),
                ]);
            }
            Some(url) if !url.contains("client_id=") => {
                req = req.query(&[("client_id", cid.as_str())]);
            }
            Some(_) => {}
        }

        let resp: LikesResponse = req.send().await?.error_for_status()?.json().await?;

        tracks.extend(resp.collection.into_iter().filter_map(|item| item.track).map(
            |t| Track {
                id: t.id,
                title: t.title,
                duration: t.duration,
                artwork_url: t.artwork_url,
                permalink_url: t.permalink_url,
                artist: t.user.map(|u| u.username),
            },
        ));

        match resp.next_href {
            Some(next) if (tracks.len() as u32) < max => next_url = Some(next),
            _ => break,
        }
    }

    tracks.truncate(max as usize);
    Ok(tracks)
}
