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

    let candidates = ranked(track.media.transcodings);
    if candidates.is_empty() {
        return Err(ScApiError::NoStream);
    }

    // Every candidate gets a turn, in order, because a transcoding that a track
    // *advertises* is not a transcoding that resolves.
    //
    // Observed on 2026-08-08 against the live API: two tracks in a page of
    // eighteen offered a `progressive` entry whose signing URL answered **404**.
    // Taking the first candidate and giving up — which is what this did — is
    // therefore not "the track has no stream", it is one dead preset in front of
    // live ones, and it reached the user as a track that simply would not play
    // with no way round it.
    let mut last_error = None;
    for transcoding in candidates {
        match sign(&client, &transcoding, &cid, &track.track_authorization).await {
            Ok(url) => {
                return Ok(Stream {
                    url,
                    protocol: transcoding.format.protocol,
                    mime_type: transcoding.format.mime_type,
                })
            }
            // Not this preset's fault, and trying the next one would ask the
            // same rejected key or deepen the same rate limit. The caller's one
            // forced retry is the right response to both.
            Err(e @ (ScApiError::StaleClientId | ScApiError::RateLimited)) => return Err(e),
            Err(e) => last_error = Some(e),
        }
    }
    Err(last_error.unwrap_or(ScApiError::NoStream))
}

/// The transcodings worth trying, best first.
///
/// Progressive before HLS, because progressive is a plain file a bare `<audio>`
/// element plays and HLS costs a playlist fetch and a Media Source pipeline.
/// Within each, `audio/mpeg` first: a track can also offer opus, which is a coin
/// toss in a WebView.
///
/// Encrypted presets are dropped outright rather than ranked last — `-hls-aes`
/// and friends need a key exchange nothing here does, so offering one back would
/// be a track that loads and then plays silence. `audio/mpegurl` (the `abr_sq`
/// preset) sorts last instead of being dropped: it is documented as answering
/// 404 on resolve (docs/sc-api.md), and the loop above now costs one wasted
/// request to find that out rather than a dead end.
fn ranked(transcodings: Vec<Transcoding>) -> Vec<Transcoding> {
    fn mpeg(t: &Transcoding) -> bool {
        t.format.mime_type.contains("mpeg") || t.format.mime_type.contains("mp3")
    }

    let mut out: Vec<Transcoding> = transcodings
        .into_iter()
        .filter(|t| !t.url.contains("encrypted") && !t.format.protocol.contains("encrypted"))
        .filter(|t| t.format.protocol == "progressive" || t.format.protocol == "hls")
        .collect();

    out.sort_by_key(|t| {
        let known_dead = t.format.mime_type.contains("mpegurl");
        let progressive = t.format.protocol == "progressive";
        (known_dead, !progressive, !mpeg(t))
    });
    out
}

/// Exchange a transcoding for the signed CDN URL behind it.
async fn sign(
    client: &reqwest::Client,
    transcoding: &Transcoding,
    client_id: &str,
    track_authorization: &str,
) -> Result<String, ScApiError> {
    let resp = client
        .get(&transcoding.url)
        .query(&[
            ("client_id", client_id),
            ("track_authorization", track_authorization),
        ])
        .send()
        .await?;
    if let Some(reason) = super::classify(resp.status()) {
        return Err(reason);
    }
    let resolved: ResolvedUrl = resp.error_for_status()?.json().await?;
    Ok(resolved.url)
}
