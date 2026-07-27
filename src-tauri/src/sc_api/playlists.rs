//! Playlists: a user's own sets, and the tracks inside one.
//!
//! `GET /users/{id}/playlists` lists sets and albums.
//! `GET /playlists/{id}` returns the playlist with a `tracks[]` array in which
//! only the first ~5 entries are hydrated — the rest are `{ id, kind, … }`
//! stubs that must be fetched in bulk via `GET /tracks?ids=…`
//! (all verified in recon; see `docs/sc-api.md`).

use std::collections::HashMap;

use super::{
    client_id, http_client,
    models::{Playlist, PlaylistTrack, RawPlaylist, RawTrack, Track},
    paging::collect_all,
    ScApiError, API_V2,
};

/// How many track ids to hydrate per `GET /tracks?ids=` request. SoundCloud's
/// own web app batches in 50s; larger batches risk a URL-length rejection.
const HYDRATE_BATCH: usize = 50;

/// Fetch the playlists (and albums) `user_id` created.
pub async fn get_user_playlists(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<Playlist>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawPlaylist> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/playlists"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(Playlist::from).collect())
}

/// Fetch a playlist's tracks in playlist order, hydrating the stub entries.
///
/// Tracks that SoundCloud refuses to return (geo-blocked, deleted) are dropped
/// rather than failing the whole playlist.
pub async fn get_playlist_tracks(
    token: Option<&str>,
    playlist_id: u64,
) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let mut req = client
        .get(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str()), ("representation", "full")]);
    if let Some(token) = token {
        req = req.header("Authorization", format!("OAuth {token}"));
    }
    let playlist: RawPlaylist = req.send().await?.error_for_status()?.json().await?;

    // Playlist order is the order of `tracks[]`; remember it before hydrating.
    let order: Vec<u64> = playlist.tracks.iter().map(PlaylistTrack::id).collect();

    let mut by_id: HashMap<u64, Track> = HashMap::new();
    let mut missing: Vec<u64> = Vec::new();
    for entry in playlist.tracks {
        match entry {
            PlaylistTrack::Full(t) => {
                by_id.insert(t.id, Track::from(*t));
            }
            PlaylistTrack::Stub { id } => missing.push(id),
        }
    }

    for batch in missing.chunks(HYDRATE_BATCH) {
        let ids = batch
            .iter()
            .map(u64::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let mut req = client
            .get(format!("{API_V2}/tracks"))
            .query(&[("ids", ids.as_str()), ("client_id", cid.as_str())]);
        if let Some(token) = token {
            req = req.header("Authorization", format!("OAuth {token}"));
        }
        let fetched: Vec<RawTrack> = req.send().await?.error_for_status()?.json().await?;
        for track in fetched {
            by_id.insert(track.id, Track::from(track));
        }
    }

    Ok(order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}
