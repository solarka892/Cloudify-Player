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

pub mod client_id;
pub mod discover;
pub mod likes;
pub mod me;
pub mod models;
pub mod playlists;
pub mod search;
pub mod stream;
pub mod users;

mod paging;

#[cfg(test)]
mod tests;

pub use error::ScApiError;
pub use models::{Playlist, Track, User};

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

/// A reqwest client carrying the browser User-Agent every SC request needs.
pub(crate) fn http_client() -> Result<reqwest::Client, ScApiError> {
    Ok(reqwest::Client::builder().user_agent(USER_AGENT).build()?)
}
