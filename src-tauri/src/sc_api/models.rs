//! The projections every SoundCloud endpoint maps into.
//!
//! api-v2 returns the same fat objects (30–50 fields) from a dozen endpoints;
//! the UI needs a handful of them. Keeping all three projections here means a
//! field added for one feature is available everywhere, and the frontend has
//! one shape per kind to type against (mirrored in `src/lib/tauri.ts`).

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------- track ----

/// Minimal track projection for list/grid rendering in the UI.
///
/// `Deserialize` too: the offline library hands a track back to Rust when the
/// user asks to download it, rather than re-fetching metadata the UI has.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: u64,
    pub title: String,
    /// Duration in milliseconds.
    pub duration: u64,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub artist: Option<String>,
}

/// The parts of SoundCloud's track object we deserialise. Everything past
/// `id`/`title` is optional — the API omits fields freely per endpoint.
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
            // Tracks without their own art (common in search) borrow the
            // uploader's avatar rather than rendering an empty tile.
            artwork_url: t.artwork_url.or(avatar),
            permalink_url: t.permalink_url,
            artist,
        }
    }
}

// ----------------------------------------------------------------- user ----

#[derive(Debug, Serialize)]
pub struct User {
    pub id: u64,
    pub username: String,
    pub avatar_url: Option<String>,
    pub permalink_url: Option<String>,
    pub followers_count: Option<u64>,
    pub track_count: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct RawUser {
    pub id: u64,
    pub username: String,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub permalink_url: Option<String>,
    #[serde(default)]
    pub followers_count: Option<u64>,
    #[serde(default)]
    pub track_count: Option<u64>,
}

impl From<RawUser> for User {
    fn from(u: RawUser) -> Self {
        User {
            id: u.id,
            username: u.username,
            avatar_url: u.avatar_url,
            permalink_url: u.permalink_url,
            followers_count: u.followers_count,
            track_count: u.track_count,
        }
    }
}

// ------------------------------------------------------------- playlist ----

#[derive(Debug, Serialize)]
pub struct Playlist {
    pub id: u64,
    pub title: String,
    pub track_count: u64,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub owner: Option<String>,
    /// SoundCloud models albums as playlists with this flag set.
    pub is_album: bool,
}

/// An entry in a playlist's `tracks[]`. SoundCloud hydrates only the first ~5
/// and sends `{ id, kind, policy, monetization_model }` stubs for the rest, so
/// the two cases are matched untagged: a stub fails `RawTrack` (no `title`).
#[derive(Deserialize)]
#[serde(untagged)]
pub(crate) enum PlaylistTrack {
    Full(Box<RawTrack>),
    Stub { id: u64 },
}

impl PlaylistTrack {
    pub fn id(&self) -> u64 {
        match self {
            PlaylistTrack::Full(t) => t.id,
            PlaylistTrack::Stub { id } => *id,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct RawPlaylist {
    pub id: u64,
    pub title: String,
    #[serde(default)]
    pub track_count: u64,
    #[serde(default)]
    pub artwork_url: Option<String>,
    #[serde(default)]
    pub permalink_url: Option<String>,
    #[serde(default)]
    pub is_album: bool,
    #[serde(default)]
    pub user: Option<RawUser>,
    #[serde(default)]
    pub tracks: Vec<PlaylistTrack>,
}

impl From<RawPlaylist> for Playlist {
    fn from(p: RawPlaylist) -> Self {
        // Playlist art is often null; fall back to the first hydrated track's
        // artwork, then to the owner's avatar.
        let first_track_art = p.tracks.iter().find_map(|t| match t {
            PlaylistTrack::Full(t) => t.artwork_url.clone(),
            PlaylistTrack::Stub { .. } => None,
        });
        let (owner, avatar) = match p.user {
            Some(u) => (Some(u.username), u.avatar_url),
            None => (None, None),
        };
        Playlist {
            id: p.id,
            title: p.title,
            track_count: p.track_count,
            artwork_url: p.artwork_url.or(first_track_art).or(avatar),
            permalink_url: p.permalink_url,
            owner,
            is_album: p.is_album,
        }
    }
}
