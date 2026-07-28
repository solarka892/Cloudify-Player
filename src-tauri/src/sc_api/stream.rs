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
    /// `audio/mpeg` for the plain mp3; occasionally opus, or an encrypted
    /// preset on Go+ tracks that no `<audio>` element can decode.
    #[serde(default)]
    mime_type: String,
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
///
/// SoundCloud rotates `client_id` without warning, and a rotated key fails
/// every request until it is re-extracted — which used to look like "tracks
/// just stopped playing". One forced retry covers it; a rate limit is passed
/// through instead, because retrying that only deepens the hole.
pub async fn get_stream_url(track_id: u64) -> Result<String, ScApiError> {
    match resolve(track_id, false).await {
        Err(ScApiError::StaleClientId) => resolve(track_id, true).await,
        other => other,
    }
}

async fn resolve(track_id: u64, fresh_client_id: bool) -> Result<String, ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let resp = client
        .get(format!("{API_V2}/tracks/{track_id}"))
        .query(&[("client_id", cid.as_str())])
        .send()
        .await?;
    if let Some(reason) = super::classify(resp.status()) {
        return Err(reason);
    }
    let track: RawTrack = resp.error_for_status()?.json().await?;

    // Prefer the mp3 among the progressive transcodings rather than whichever
    // comes first: a track can also offer opus, or an encrypted preset, and
    // both are a coin toss in a WebView — one that lands on silence or a decode
    // error. Any progressive will still do if there is no mp3 at all.
    let progressive: Vec<Transcoding> = track
        .media
        .transcodings
        .into_iter()
        .filter(|t| t.format.protocol == "progressive")
        .collect();
    let transcoding = progressive
        .iter()
        .find(|t| t.format.mime_type.contains("mpeg") || t.format.mime_type.contains("mp3"))
        .or_else(|| progressive.first())
        .ok_or(ScApiError::NoStream)?;

    let resp = client
        .get(&transcoding.url)
        .query(&[
            ("client_id", cid.as_str()),
            ("track_authorization", track.track_authorization.as_str()),
        ])
        .send()
        .await?;
    if let Some(reason) = super::classify(resp.status()) {
        return Err(reason);
    }
    let resolved: ResolvedUrl = resp.error_for_status()?.json().await?;

    Ok(resolved.url)
}
