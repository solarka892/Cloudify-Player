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
pub async fn get(token: &str) -> Result<Me, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;

    let me = client
        .get(format!("{API_V2}/me"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json::<Me>()
        .await?;

    Ok(me)
}
