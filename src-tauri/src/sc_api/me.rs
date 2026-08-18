//! The logged-in user (`/me`).
//!
//! Requires an OAuth token (`Authorization: OAuth <token>`) plus the usual
//! `client_id` query param. Endpoint: `GET api-v2.soundcloud.com/me`.

use serde::{Deserialize, Serialize};

use super::{client_id, ScApiError, API_V2};

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

/// What a refusal of `/me` means.
///
/// A separate step from making the request because it is the part with a rule in
/// it, and the rule is worth testing without a network: `sc_get_me` deletes the
/// stored token on exactly one of these outcomes, and the deletion cannot be
/// undone from inside the app — the replacement comes through a browser.
#[derive(Debug, PartialEq, Eq)]
enum Verdict {
    /// Not a refusal. Read the body.
    Proceed,
    /// Back off; says nothing about the token.
    RateLimited,
    /// The bot filter, not SoundCloud. Says nothing about the token.
    BotFiltered,
    /// Worth one forced `client_id` re-extraction before blaming anything.
    RetryWithFreshKey,
    /// The token is dead. **The one outcome that ends the session.**
    TokenDead,
    /// Refused for a reason that is not about the token: a region block, or
    /// SoundCloud simply saying no.
    Forbidden,
}

/// Why this route does not use `super::classify`.
///
/// `classify` is written for the read routes, and they authenticate with the
/// `client_id` and nothing else — so it reads every 401 and 403 as a rotated
/// key, which for them is the only thing it can be. `/me` is the one read that
/// also carries an OAuth token, which makes that reading wrong in a way the
/// caller acts on: a 403 from a bot filter or a region block would take the
/// user's session with it.
///
/// So the verdict is its own, and matches the one the write routes already reach
/// in `actions.rs`: one retry, then name what actually happened.
fn verdict(status: u16, bot_filtered: bool, fresh_client_id: bool) -> Verdict {
    match status {
        // Success first, and not merely for tidiness: DataDome sits in front of
        // SoundCloud on the way *out* as well, and stamps `x-datadome` on replies
        // it let through. Reading that header before the status would turn a
        // perfectly good `/me` into a blocked one.
        200..=299 => Verdict::Proceed,
        429 => Verdict::RateLimited,
        // Before anything about credentials: the filter announces itself in a
        // header, and re-fetching a key against it is a wasted round trip.
        _ if bot_filtered => Verdict::BotFiltered,
        // The key travels in the URL and it does rotate, so one forced
        // re-extraction is worth a round trip before blaming the token.
        401 | 403 if !fresh_client_id => Verdict::RetryWithFreshKey,
        // Refused again with a key fetched seconds ago. Only 401 means the
        // token: it is the status SoundCloud answers a credential it rejects.
        401 => Verdict::TokenDead,
        403 => Verdict::Forbidden,
        _ => Verdict::Proceed,
    }
}

async fn fetch(token: &str, fresh_client_id: bool) -> Result<Me, ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let client = super::http_client()?;

    let resp = client
        .get(format!("{API_V2}/me"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?;

    let status = resp.status().as_u16();
    let bot_filtered = resp.headers().contains_key("x-datadome");
    match verdict(status, bot_filtered, fresh_client_id) {
        Verdict::Proceed => Ok(resp.error_for_status()?.json::<Me>().await?),
        Verdict::RateLimited => Err(ScApiError::RateLimited),
        Verdict::BotFiltered => Err(ScApiError::BotFiltered),
        Verdict::RetryWithFreshKey => Err(ScApiError::StaleClientId),
        Verdict::TokenDead => Err(ScApiError::SessionExpired),
        // Its own status and body are the only evidence there is.
        Verdict::Forbidden => {
            let body = resp.text().await.unwrap_or_default();
            let body = body.trim();
            Err(ScApiError::Refused {
                status,
                detail: if body.is_empty() {
                    String::new()
                } else {
                    format!(": {}", body.chars().take(220).collect::<String>())
                },
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{verdict, Verdict};

    /// The bug task 23 was: a 403 signed the user out.
    #[test]
    fn a_second_403_does_not_end_the_session() {
        assert_eq!(verdict(403, false, true), Verdict::Forbidden);
        assert_eq!(verdict(403, true, true), Verdict::BotFiltered);
        // ...and neither does a first one; it buys a key refresh.
        assert_eq!(verdict(403, false, false), Verdict::RetryWithFreshKey);
    }

    /// The one outcome allowed to end it, and only on the second try.
    #[test]
    fn only_a_second_401_ends_the_session() {
        assert_eq!(verdict(401, false, false), Verdict::RetryWithFreshKey);
        assert_eq!(verdict(401, false, true), Verdict::TokenDead);
    }

    /// The bot filter is checked first on purpose: it answers 403 too, and it is
    /// not a credentials problem, so it must not spend a retry or a session.
    #[test]
    fn the_bot_filter_outranks_the_key_retry() {
        assert_eq!(verdict(403, true, false), Verdict::BotFiltered);
        assert_eq!(verdict(401, true, false), Verdict::BotFiltered);
    }

    #[test]
    fn a_rate_limit_is_neither() {
        assert_eq!(verdict(429, false, true), Verdict::RateLimited);
    }

    #[test]
    fn anything_else_reads_the_body() {
        assert_eq!(verdict(200, false, false), Verdict::Proceed);
        assert_eq!(verdict(500, false, true), Verdict::Proceed);
    }

    /// The filter stamps its header on replies it allowed through, too. Reading
    /// it without looking at the status would block a working session.
    #[test]
    fn a_success_carrying_the_filter_header_is_still_a_success() {
        assert_eq!(verdict(200, true, false), Verdict::Proceed);
        assert_eq!(verdict(204, true, true), Verdict::Proceed);
    }
}
