//! Resolve a track to a playable audio URL.
//!
//! Two hops (see docs/sc-api.md):
//!   1. `GET /tracks/{id}` → the track object with `media.transcodings` and a
//!      `track_authorization` token.
//!   2. `GET <transcoding url>?client_id=..&track_authorization=..`
//!      → `{ "url": "<signed CDN url>" }`.
//!
//! The signed URL is short-lived, so resolve it right before playback (this runs
//! per play, no caching).
//!
//! ## Why the protocol comes back with the URL
//!
//! `progressive` is a plain mp3 a bare `<audio>` element can play, and it is
//! what this asked for and nothing else. But SoundCloud does not offer it for
//! every track — a large and growing share are **HLS only**, and for those this
//! used to return `NoStream`, which reached the user as "this track will not
//! play" with no reason and no way round it. They play perfectly well; they just
//! need a playlist parser, which the frontend has (`audio/hls.ts`).
//!
//! So the choice is still made here — progressive first, always, because it
//! costs nothing to play — but the answer says which kind it is instead of
//! throwing the other kind away.

use serde::{Deserialize, Serialize};

use super::{client_id, ScApiError, API_V2};

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

/// A signed, playable URL and what has to play it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stream {
    pub url: String,
    /// `"progressive"` — a plain file an `<audio>` element loads directly — or
    /// `"hls"`, an `.m3u8` playlist that needs Media Source Extensions.
    pub protocol: String,
    /// The codec SoundCloud claims, e.g. `audio/mpeg`. Load-bearing for HLS: an
    /// mpeg playlist is a list of raw MP3 frames and can simply be concatenated
    /// into a file, and an opus one cannot.
    pub mime_type: String,
}

/// Resolve `track_id` to a signed, playable URL.
///
/// SoundCloud rotates `client_id` without warning, and a rotated key fails
/// every request until it is re-extracted — which used to look like "tracks
/// just stopped playing". One forced retry covers it; a rate limit is passed
/// through instead, because retrying that only deepens the hole.
pub async fn get_stream_url(track_id: u64) -> Result<Stream, ScApiError> {
    match resolve(track_id, false).await {
        Err(ScApiError::StaleClientId) => resolve(track_id, true).await,
        other => other,
    }
}

async fn resolve(track_id: u64, fresh_client_id: bool) -> Result<Stream, ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let client = super::http_client()?;

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
    //
    // HLS is the fallback and not the first choice, because it costs a playlist
    // fetch and a Media Source pipeline that progressive does not — but it is a
    // fallback rather than a failure, which is the point. Encrypted presets are
    // excluded from both: `-hls-aes` and friends need a key exchange nothing
    // here does, and offering one back would be a track that loads and then
    // plays nothing.
    let playable: Vec<Transcoding> = track
        .media
        .transcodings
        .into_iter()
        .filter(|t| !t.url.contains("encrypted") && !t.format.protocol.contains("encrypted"))
        .collect();
    let progressive: Vec<&Transcoding> = playable
        .iter()
        .filter(|t| t.format.protocol == "progressive")
        .collect();

    let transcoding = progressive
        .iter()
        .copied()
        .find(|t| t.format.mime_type.contains("mpeg") || t.format.mime_type.contains("mp3"))
        .or_else(|| progressive.first().copied())
        .or_else(|| playable.iter().find(|t| t.format.protocol == "hls"))
        .ok_or(ScApiError::NoStream)?;
    let protocol = transcoding.format.protocol.clone();
    let mime_type = transcoding.format.mime_type.clone();

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

    Ok(Stream {
        url: resolved.url,
        protocol,
        mime_type,
    })
}
