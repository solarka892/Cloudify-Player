//! Resolve a track to a playable audio URL.
//!
//! Two hops (see docs/sc-api.md):
//!   1. `GET /tracks/{id}` → the track object with `media.transcodings` and a
//!      `track_authorization` token.
//!   2. `GET <progressive transcoding url>?client_id=..&track_authorization=..`
//!      → `{ "url": "<signed CDN mp3>" }`.
//!
//! We use the `progressive` (plain mp3) transcoding so the frontend can play it
//! with a bare `<audio>` element — no HLS needed. The signed URL is short-lived,
//! so resolve it right before playback (this runs per play, no caching).

use serde::Deserialize;

use super::{client_id, ScApiError, API_V2, USER_AGENT};

#[derive(Deserialize)]
struct Format {
    protocol: String,
}

#[derive(Deserialize)]
struct Transcoding {
    url: String,
    format: Format,
}

#[derive(Deserialize, Default)]
struct Media {
    #[serde(default)]
    transcodings: Vec<Transcoding>,
}

#[derive(Deserialize)]
struct RawTrack {
    #[serde(default)]
    media: Media,
    #[serde(default)]
    track_authorization: String,
}

#[derive(Deserialize)]
struct ResolvedUrl {
    url: String,
}

/// Resolve `track_id` to a signed, directly-playable progressive mp3 URL.
pub async fn get_stream_url(track_id: u64) -> Result<String, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let track: RawTrack = client
        .get(format!("{API_V2}/tracks/{track_id}"))
        .query(&[("client_id", cid.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let transcoding = track
        .media
        .transcodings
        .into_iter()
        .find(|t| t.format.protocol == "progressive")
        .ok_or(ScApiError::NoStream)?;

    let resolved: ResolvedUrl = client
        .get(&transcoding.url)
        .query(&[
            ("client_id", cid.as_str()),
            ("track_authorization", track.track_authorization.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resolved.url)
}
