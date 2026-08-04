//! SoundCloud internal `api-v2` client.
//!
//! ⚠️ ALL code that talks to SoundCloud lives under this module — nothing
//! elsewhere may construct SoundCloud URLs or hit the network for SC data
//! (CLAUDE.md hard rule). The rest of the app depends only on the domain
//! methods this module exposes (e.g. future `get_user_likes`), never on URLs.
//!
//! Design notes for resilience (SC can break us anytime — see CLAUDE.md):
//!   - Endpoint isolation: keep every path in one place.
//!   - Version each method so a fallback can be slotted in.
//!   - Log request/response on error WITHOUT secrets.
//!
//! Reverse-engineering notes & verified endpoints: `docs/sc-api.md`.

pub mod actions;
pub mod activities;
pub mod client_id;
pub mod comments;
pub mod discover;
pub mod likes;
pub mod me;
pub mod messages;
pub mod models;
pub mod playlists;
pub mod resolve;
pub mod search;
pub mod stream;
pub mod tracks;
pub mod users;

mod paging;

#[cfg(test)]
mod tests;

pub use error::ScApiError;
pub use models::{Comment, Playlist, Profile, Track, TrackDetail, User, Waveform};

/// Base URL of SoundCloud's internal API.
pub(crate) const API_V2: &str = "https://api-v2.soundcloud.com";

mod error {
    use serde::{Serialize, Serializer};

    /// Errors surfaced by the SoundCloud API layer. Serialises to its display
    /// string so it can cross the Tauri bridge to the frontend.
    #[derive(Debug, thiserror::Error)]
    pub enum ScApiError {
        #[error("network error: {0}")]
        Http(#[from] reqwest::Error),

        #[error("regex error: {0}")]
        Regex(#[from] regex::Error),

        #[error("no JS bundles found on the SoundCloud homepage")]
        NoBundles,

        #[error("client_id not found in any JS bundle")]
        ClientIdNotFound,

        #[error("no playable stream for this track")]
        NoStream,

        /// SoundCloud rejected the request outright. Almost always a rotated
        /// `client_id`; callers retry once with a freshly extracted one.
        #[error("soundcloud rejected the request (client_id likely stale)")]
        StaleClientId,

        /// Too many requests. Distinct from a stale key because retrying
        /// immediately makes it worse — the caller has to back off.
        #[error("soundcloud is rate-limiting us — wait a minute and retry")]
        RateLimited,

        /// A pasted link that does not point at SoundCloud. Refused before the
        /// request rather than after: the URL comes from the clipboard.
        #[error("that link is not a soundcloud.com URL")]
        NotSoundCloudUrl,

        /// A URL from an API payload pointed somewhere we do not fetch from.
        #[error("unexpected host in a soundcloud payload")]
        UnexpectedHost,
    }

    impl Serialize for ScApiError {
        fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
        where
            S: Serializer,
        {
            serializer.serialize_str(&self.to_string())
        }
    }
}

/// Browser-like User-Agent. SoundCloud serves different markup to obvious bots,
/// so every request from this module carries it.
pub(crate) const USER_AGENT: &str =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) \
     Chrome/126.0.0.0 Safari/537.36";

/// Classify a failed response so callers know whether a retry can help.
///
/// A rotated `client_id` and a rate limit look similar from the outside but
/// need opposite responses: re-extract immediately versus stop hammering.
pub(crate) fn classify(status: reqwest::StatusCode) -> Option<ScApiError> {
    match status.as_u16() {
        401 | 403 => Some(ScApiError::StaleClientId),
        429 => Some(ScApiError::RateLimited),
        _ => None,
    }
}

/// A reqwest client carrying the browser User-Agent every SC request needs.
pub(crate) fn http_client() -> Result<reqwest::Client, ScApiError> {
    Ok(reqwest::Client::builder().user_agent(USER_AGENT).build()?)
}
