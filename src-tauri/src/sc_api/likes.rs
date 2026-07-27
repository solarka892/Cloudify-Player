//! A user's likes.
//!
//! `GET /users/{id}/likes` returns a mix of liked tracks and playlists;
//! `GET /users/{id}/playlist_likes` returns just the playlists. Both verified
//! in recon (`docs/sc-api.md`). They work with `client_id` for public accounts;
//! we also send the OAuth token so private accounts work.

use serde::Deserialize;

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, Track},
    paging::collect_all,
    ScApiError, API_V2,
};

#[derive(Deserialize)]
struct LikeItem {
    // Playlist likes have no `track`; we skip those here.
    #[serde(default)]
    track: Option<RawTrack>,
}

#[derive(Deserialize)]
struct PlaylistLikeItem {
    #[serde(default)]
    playlist: Option<RawPlaylist>,
}

/// Fetch `user_id`'s liked tracks, following pagination up to `max` tracks.
pub async fn get_liked_tracks(
    token: &str,
    user_id: u64,
    max: u32,
) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<LikeItem> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/likes"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    Ok(items
        .into_iter()
        .filter_map(|item| item.track)
        .map(Track::from)
        .collect())
}

/// Fetch `user_id`'s liked playlists (and albums).
pub async fn get_liked_playlists(
    token: &str,
    user_id: u64,
    max: u32,
) -> Result<Vec<Playlist>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let items: Vec<PlaylistLikeItem> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/playlist_likes"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    Ok(items
        .into_iter()
        .filter_map(|item| item.playlist)
        .map(Playlist::from)
        .collect())
}
