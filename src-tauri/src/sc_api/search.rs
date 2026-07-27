//! Search.
//!
//! `GET /search/tracks?q=…` — public data, `client_id` is enough, no login
//! required. Verified in recon (`docs/sc-api.md`). Users/playlists live on
//! sibling endpoints and get their own functions when the UI needs them.

use serde::Deserialize;

use super::{
    client_id,
    track::{RawTrack, Track},
    ScApiError, API_V2, USER_AGENT,
};

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    collection: Vec<RawTrack>,
}

/// Hard cap on `limit`; api-v2 rejects oversized page sizes.
const MAX_LIMIT: u32 = 200;

/// Search tracks by free-text query. Returns at most `limit` results (clamped
/// to [`MAX_LIMIT`]); an empty/blank query yields an empty list without a
/// request.
pub async fn search_tracks(query: &str, limit: u32) -> Result<Vec<Track>, ScApiError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let cid = client_id::get(false).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;
    let limit = limit.clamp(1, MAX_LIMIT).to_string();

    let resp: SearchResponse = client
        .get(format!("{API_V2}/search/tracks"))
        .query(&[
            ("q", query),
            ("client_id", cid.as_str()),
            ("limit", limit.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.collection.into_iter().map(Track::from).collect())
}
