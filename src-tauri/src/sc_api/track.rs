//! The shared track projection every SoundCloud endpoint maps into.
//!
//! `/users/{id}/likes`, `/search/tracks`, … all return the same fat track
//! object; the UI only ever needs this subset. Keeping one `Track` here means a
//! field added for one feature is available to all of them, and the frontend
//! has a single shape to type against.

use serde::{Deserialize, Serialize};

/// Minimal track projection for list/grid rendering in the UI.
#[derive(Debug, Serialize)]
pub struct Track {
    pub id: u64,
    pub title: String,
    /// Duration in milliseconds.
    pub duration: u64,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub artist: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct RawUser {
    pub username: String,
    /// Artwork fallback for tracks that have none of their own.
    #[serde(default)]
    pub avatar_url: Option<String>,
}

/// The parts of SoundCloud's track object we deserialise. Everything optional
/// beyond `id`/`title` — the API omits fields freely depending on the endpoint.
#[derive(Deserialize)]
pub(crate) struct RawTrack {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub duration: u64,
    #[serde(default)]
    pub artwork_url: Option<String>,
    #[serde(default)]
    pub permalink_url: Option<String>,
    #[serde(default)]
    pub user: Option<RawUser>,
}

impl From<RawTrack> for Track {
    fn from(t: RawTrack) -> Self {
        let (artist, avatar) = match t.user {
            Some(u) => (Some(u.username), u.avatar_url),
            None => (None, None),
        };
        Track {
            id: t.id,
            title: t.title,
            duration: t.duration,
            artwork_url: t.artwork_url.or(avatar),
            permalink_url: t.permalink_url,
            artist,
        }
    }
}
