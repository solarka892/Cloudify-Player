//! Other users: who someone follows, and what they've uploaded.
//!
//! `GET /users/{id}/followings` → users. `GET /users/{id}/tracks` → uploads.
//! Both public (`client_id` is enough) and both paginated; verified in recon
//! (`docs/sc-api.md`).

use super::{
    client_id, http_client,
    models::{Profile, RawProfile, RawTrack, RawUser, Track, User},
    paging::collect_all,
    ScApiError, API_V2,
};

/// The full profile behind a user page. Public.
pub async fn get_profile(user_id: u64) -> Result<Profile, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: RawProfile = client
        .get(format!("{API_V2}/users/{user_id}"))
        .query(&[("client_id", cid.as_str())])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(Profile::from(raw))
}

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

/// Fetch the users who follow `user_id`. Public — same shape as followings.
pub async fn get_followers(
    token: Option<&str>,
    user_id: u64,
    max: u32,
) -> Result<Vec<User>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawUser> = collect_all(
        &client,
        format!("{API_V2}/users/{user_id}/followers"),
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
