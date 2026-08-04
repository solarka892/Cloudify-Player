//! Discovery: the personal feed, listening history, curated selections,
//! related tracks and stations.
//!
//! ⚠️ `/charts` is **gone** — it returns 404 as of 2026-07-27 (verified). The
//! replacement for "show me something new" is `/mixed-selections`, which is
//! what soundcloud.com itself renders on its home page.
//!
//! Verified live: `/mixed-selections`, `/tracks/{id}/related`,
//! `/stations/soundcloud:{track,artist}-stations:{id}/tracks`.
//! Auth-only and therefore untested here: `/stream`, `/me/play-history`.
//! See `docs/sc-api.md`.

use serde::{Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, Track},
    paging::collect_all,
    ScApiError, API_V2,
};

/// A curated row on the home page: a title plus the playlists inside it.
#[derive(Debug, Serialize)]
pub struct Selection {
    pub id: String,
    pub title: String,
    pub playlists: Vec<Playlist>,
}

#[derive(Deserialize)]
struct RawSelectionItems {
    #[serde(default)]
    collection: Vec<RawPlaylist>,
}

#[derive(Deserialize)]
struct RawSelection {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    items: Option<RawSelectionItems>,
}

#[derive(Deserialize)]
struct Collection<T> {
    #[serde(default = "Vec::new")]
    collection: Vec<T>,
}

/// SoundCloud's own curated home-page rows ("Charts: Top 50", editorial
/// selections, …). Public — no login needed.
pub async fn mixed_selections(limit: u32) -> Result<Vec<Selection>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit = limit.to_string();

    let resp: Collection<RawSelection> = client
        .get(format!("{API_V2}/mixed-selections"))
        .query(&[("client_id", cid.as_str()), ("limit", limit.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp
        .collection
        .into_iter()
        .map(|s| Selection {
            id: s.id,
            title: s.title,
            playlists: s
                .items
                .map(|i| i.collection.into_iter().map(Playlist::from).collect())
                .unwrap_or_default(),
        })
        // Rows whose payload isn't playlists (SC mixes in other shapes) would
        // render as an empty carousel; drop them here instead.
        .filter(|s| !s.playlists.is_empty())
        .collect())
}

/// "More like this" for a track. Public.
pub async fn related_tracks(track_id: u64, limit: u32) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit = limit.to_string();

    let resp: Collection<RawTrack> = client
        .get(format!("{API_V2}/tracks/{track_id}/related"))
        .query(&[("client_id", cid.as_str()), ("limit", limit.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.collection.into_iter().map(Track::from).collect())
}

/// An endless station seeded by a track or by an artist. Public.
///
/// Note the response carries only `collection` — no `next_href` — so this is a
/// single request rather than a paginated walk.
pub async fn station_tracks(
    seed: &str,
    seed_id: u64,
    limit: u32,
) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit = limit.to_string();
    let urn = format!("soundcloud:{seed}-stations:{seed_id}");

    let resp: Collection<RawTrack> = client
        .get(format!("{API_V2}/stations/{urn}/tracks"))
        .query(&[("client_id", cid.as_str()), ("limit", limit.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.collection.into_iter().map(Track::from).collect())
}

/// The newest tracks carrying a tag — SoundCloud's genre/tag pages.
///
/// `GET /recent-tracks/{tag}` (verified live 2026-08-04). This is the
/// replacement for browsing by genre now that `/charts` is a 404.
pub async fn tag_tracks(tag: &str, limit: u32) -> Result<Vec<Track>, ScApiError> {
    let tag = tag.trim();
    if tag.is_empty() {
        return Ok(Vec::new());
    }

    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit = limit.to_string();

    let resp: Collection<RawTrack> = client
        .get(format!("{API_V2}/recent-tracks/{}", urlencoding_lite(tag)))
        .query(&[("client_id", cid.as_str()), ("limit", limit.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.collection.into_iter().map(Track::from).collect())
}

/// Percent-encode the characters that can appear in a tag and break a path.
///
/// A whole URL-encoding crate for this would be a dependency for four
/// characters; tags are words, spaces and the occasional ampersand.
fn urlencoding_lite(tag: &str) -> String {
    tag.chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '/' => "%2F".to_string(),
            '?' => "%3F".to_string(),
            '#' => "%23".to_string(),
            '&' => "%26".to_string(),
            c => c.to_string(),
        })
        .collect()
}

#[derive(Deserialize)]
struct StreamItem {
    /// `track`, `track-repost`, `playlist`, `playlist-repost`.
    #[serde(default)]
    track: Option<RawTrack>,
}

/// The logged-in user's feed — new uploads and reposts from who they follow.
/// Requires OAuth. Playlist entries are skipped; only tracks come back.
pub async fn stream(token: &str, max: u32) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<StreamItem> = collect_all(
        &client,
        format!("{API_V2}/stream"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    Ok(items
        .into_iter()
        .filter_map(|i| i.track)
        .map(Track::from)
        .collect())
}

#[derive(Deserialize)]
struct HistoryItem {
    #[serde(default)]
    track: Option<RawTrack>,
}

/// Recently played, newest first. Requires OAuth.
pub async fn play_history(token: &str, max: u32) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<HistoryItem> = collect_all(
        &client,
        format!("{API_V2}/me/play-history"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    let mut seen = std::collections::HashSet::new();
    Ok(items
        .into_iter()
        .filter_map(|i| i.track)
        .map(Track::from)
        // The same track appears once per play; the UI wants a list of tracks.
        .filter(|t| seen.insert(t.id))
        .collect())
}
