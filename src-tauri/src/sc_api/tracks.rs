//! Everything a track page needs beyond the row projection.
//!
//! Verified live 2026-08-04 (all `200` with just a `client_id`):
//!   - `GET /tracks/{id}`                          → the full track object
//!   - `GET /tracks/{id}/likers`                   → who liked it
//!   - `GET /tracks/{id}/reposters`                → who reposted it
//!   - `GET /tracks/{id}/playlists_without_albums` → playlists it appears in
//!
//! Auth-only, so probed rather than exercised:
//!   - `GET /tracks/{id}/download` → `401` (route exists; artist-provided file)

use serde::Deserialize;

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, RawUser, TrackDetail, User, Waveform},
    paging::collect_all,
    ScApiError, API_V2,
};

/// The full track object behind a track page. Public.
pub async fn detail(token: Option<&str>, track_id: u64) -> Result<TrackDetail, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let mut req = client
        .get(format!("{API_V2}/tracks/{track_id}"))
        .query(&[("client_id", cid.as_str())]);
    if let Some(token) = token {
        req = req.header("Authorization", format!("OAuth {token}"));
    }

    let raw: RawTrack = req.send().await?.error_for_status()?.json().await?;
    Ok(TrackDetail::from(raw))
}

/// Users who liked a track. Public.
pub async fn likers(track_id: u64, max: u32) -> Result<Vec<User>, ScApiError> {
    people(format!("{API_V2}/tracks/{track_id}/likers"), max).await
}

/// Users who reposted a track. Public.
pub async fn reposters(track_id: u64, max: u32) -> Result<Vec<User>, ScApiError> {
    people(format!("{API_V2}/tracks/{track_id}/reposters"), max).await
}

async fn people(url: String, max: u32) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let raw: Vec<RawUser> = collect_all(&client, url, None, &cid, max as usize).await?;
    Ok(raw.into_iter().map(User::from).collect())
}

/// Playlists a track appears in ("In playlists" on the website). Public.
///
/// The route name is SoundCloud's: albums are excluded, because a track being
/// on its own album is not news to anyone looking at the track.
pub async fn in_playlists(track_id: u64, max: u32) -> Result<Vec<Playlist>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawPlaylist> = collect_all(
        &client,
        format!("{API_V2}/tracks/{track_id}/playlists_without_albums"),
        None,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(Playlist::from).collect())
}

#[derive(Deserialize)]
struct DownloadResponse {
    #[serde(alias = "redirectUri", alias = "redirect_uri", alias = "url")]
    url: String,
}

/// The uploader's own file, for tracks where downloads are enabled.
///
/// This is a different thing from `downloads::download`, which grabs the
/// streaming mp3: here SoundCloud hands back the original upload (often a WAV
/// or a 320k mp3). Requires OAuth even for a public track.
pub async fn download_url(token: &str, track_id: u64) -> Result<String, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let resp: DownloadResponse = client
        .get(format!("{API_V2}/tracks/{track_id}/download"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.url)
}

/// Fetch and normalise a track's waveform.
///
/// `waveform_url` points at a JSON document on `wave.sndcdn.com`, not at an
/// image — `{ "width": 1800, "height": 140, "samples": [...] }`. It is served
/// straight from a CDN and needs no `client_id`.
pub async fn waveform(url: &str) -> Result<Waveform, ScApiError> {
    // Anything but SoundCloud's own waveform host would make this a general
    // purpose fetcher pointed at a URL from an untrusted payload.
    if !url.starts_with("https://wave.sndcdn.com/") {
        return Err(ScApiError::UnexpectedHost);
    }

    let client = http_client()?;
    let wave: Waveform = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(wave)
}
