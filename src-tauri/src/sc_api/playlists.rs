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

/// How many of those batches to have in flight at once.
///
/// A 477-track playlist is ten batches, and running them one after another was
/// ten round trips deep — several seconds before the list appeared. Four at a
/// time cuts that to three waves without turning a playlist open into a burst
/// SoundCloud might rate-limit.
const HYDRATE_CONCURRENCY: usize = 4;

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

    let batches: Vec<String> = missing
        .chunks(HYDRATE_BATCH)
        .map(|batch| {
            batch
                .iter()
                .map(u64::to_string)
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect();

    for wave in batches.chunks(HYDRATE_CONCURRENCY) {
        let mut handles = Vec::with_capacity(wave.len());
        for ids in wave {
            // Owned clones so each request can move onto its own task; a
            // `reqwest::Client` clone shares the underlying connection pool,
            // so this is a handle copy rather than a new client.
            let client = client.clone();
            let cid = cid.clone();
            let token = token.map(str::to_string);
            let ids = ids.clone();

            handles.push(tokio::spawn(async move {
                let mut req = client
                    .get(format!("{API_V2}/tracks"))
                    .query(&[("ids", ids.as_str()), ("client_id", cid.as_str())]);
                if let Some(token) = token {
                    req = req.header("Authorization", format!("OAuth {token}"));
                }
                req.send()
                    .await?
                    .error_for_status()?
                    .json::<Vec<RawTrack>>()
                    .await
            }));
        }

        for handle in handles {
            // A panicked task is not a reason to lose the playlist: the batch
            // it owned simply stays unhydrated, and those tracks drop out the
            // same way a deleted one does.
            let Ok(result) = handle.await else { continue };
            for track in result? {
                by_id.insert(track.id, Track::from(track));
            }
        }
    }

    Ok(order
        .into_iter()
        .filter_map(|id| by_id.remove(&id))
        .collect())
}
