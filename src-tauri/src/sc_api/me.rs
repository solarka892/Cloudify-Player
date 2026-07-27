//! The logged-in user (`/me`).
//!
//! Requires an OAuth token (`Authorization: OAuth <token>`) plus the usual
//! `client_id` query param. Endpoint: `GET api-v2.soundcloud.com/me`.

use serde::{Deserialize, Serialize};

use super::{client_id, ScApiError, API_V2, USER_AGENT};

/// Minimal projection of the SoundCloud user object we need in the UI.
#[derive(Debug, Serialize, Deserialize)]
pub struct Me {
    pub id: u64,
    pub username: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub permalink_url: Option<String>,
    #[serde(default)]
    pub followers_count: Option<u64>,
}

/// Fetch the current user with the given OAuth token.
///
/// A 401 here is ambiguous: either the token died or the `client_id` rotated.
/// One forced re-extraction distinguishes them — if it still fails, the token
/// really is dead and the caller should ask the user to sign in again.
pub async fn get(token: &str) -> Result<Me, ScApiError> {
    match fetch(token, false).await {
        Err(ScApiError::StaleClientId) => fetch(token, true).await,
        other => other,
    }
}

async fn fetch(token: &str, fresh_client_id: bool) -> Result<Me, ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let resp = client
        .get(format!("{API_V2}/me"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?;

    if let Some(reason) = super::classify(resp.status()) {
        return Err(reason);
    }

    Ok(resp.error_for_status()?.json::<Me>().await?)
}
