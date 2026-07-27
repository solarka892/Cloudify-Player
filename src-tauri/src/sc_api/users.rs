//! Other users: who someone follows, and what they've uploaded.
//!
//! `GET /users/{id}/followings` → users. `GET /users/{id}/tracks` → uploads.
//! Both public (`client_id` is enough) and both paginated; verified in recon
//! (`docs/sc-api.md`).

use super::{
    client_id, http_client,
    models::{RawTrack, RawUser, Track, User},
    paging::collect_all,
    ScApiError, API_V2,
};

/// Fetch the users `user_id` follows.
pub async fn get_followings(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawUser> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/followings"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(User::from).collect())
}

/// Fetch the tracks `user_id` has uploaded, newest first (SoundCloud's order).
pub async fn get_user_tracks(user_id: u64, max: u32) -> Result<Vec<Track>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawTrack> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/tracks"),
        None,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(Track::from).collect())
}
