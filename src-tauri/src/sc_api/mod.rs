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

/// Writes go out through a browser window; see the module for why. Desktop
/// only — Android's WebView is not ours to drive this way, and its writes stay
/// on the direct path until someone can test the alternative on a phone.
#[cfg(desktop)]
pub mod writer;

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

        /// The HTTP client itself could not be built — no usable TLS backend.
        /// Kept as a string because the client is built once and the error is
        /// then handed out repeatedly, which `reqwest::Error` cannot be.
        #[error("http client unavailable: {0}")]
        Client(String),

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

        /// The OAuth token is no longer good. Only ever raised by the write
        /// routes: a read carries no token, so a 401 there means the key.
        ///
        /// Nothing the app can do about it by itself — the token comes out of a
        /// browser session, and if that session has been signed out or the
        /// token revoked, the only fix is to fetch a new one. So the message is
        /// an instruction rather than a diagnosis.
        #[error("your SoundCloud session is no longer valid — sign in again")]
        SessionExpired,

        /// A write stopped by SoundCloud's bot filter rather than by
        /// SoundCloud.
        ///
        /// DataDome sits in front of the write routes and not the read ones,
        /// which is why a session that browses perfectly cannot like a track.
        /// It answers a request it does not recognise with a `403` and an
        /// `x-datadome: protected` header, and no amount of re-fetching the
        /// `client_id` or the token will change its mind — what it wants is the
        /// `datadome` cookie a real browser carries. Worth its own variant
        /// precisely because it is the one failure here that is not about
        /// credentials at all.
        /// The message is an instruction because there is one, and it is the
        /// only one: loading soundcloud.com in the browser is what earns a fresh
        /// `datadome` cookie, and the next write borrows whatever is there.
        #[error("SoundCloud's bot filter blocked this — open soundcloud.com in your browser, then try again")]
        BotFiltered,

        /// A write SoundCloud refused for a reason that is not one of the
        /// above, carrying what it actually said.
        ///
        /// The write routes are the unverified half of this module (see the
        /// file header in `actions.rs`), so when one of them is refused the
        /// status and the body are the only evidence there is. Both are put in
        /// front of the user rather than swallowed: an ugly message that names
        /// the fault beats a tidy one that guesses at it, and this is how the
        /// next report arrives with something in it.
        #[error("soundcloud refused the write ({status}){detail}")]
        Refused { status: u16, detail: String },

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
///
/// **One client for the process**, cloned on every call — `reqwest::Client` is
/// an `Arc` internally, so a clone is a pointer copy and shares the connection
/// pool. Building a fresh one per request, which is what this used to do
/// everywhere, threw that pool away each time: playing a track is two sequential
/// requests to `api-v2` and both paid for their own TCP connect and TLS
/// handshake, as did the segment fetches behind a download. On a desktop that is
/// a shrug; on a phone on mobile data it is most of the delay before a track
/// starts.
///
/// The builder can fail (no TLS backend), and that is not something to hide
/// behind a panic at startup, so the result is kept and re-returned.
pub(crate) fn http_client() -> Result<reqwest::Client, ScApiError> {
    static CLIENT: std::sync::OnceLock<Result<reqwest::Client, String>> =
        std::sync::OnceLock::new();

    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .user_agent(USER_AGENT)
                // A pool that is emptied between tracks is not a pool. Ninety
                // seconds comfortably spans a track change.
                .pool_idle_timeout(std::time::Duration::from_secs(90))
                .build()
                .map_err(|e| e.to_string())
        })
        .clone()
        .map_err(ScApiError::Client)
}
