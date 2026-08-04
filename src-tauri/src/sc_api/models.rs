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
///
/// The fields below `user` are only populated by `GET /tracks/{id}`; list
/// endpoints leave them out. They feed `TrackDetail`, not `Track` — a likes
/// list of 5000 has no use for a description, and paying to carry one across
/// the bridge 5000 times is the kind of thing that makes a list feel slow.
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

    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    /// Space-separated, with multi-word tags in double quotes.
    #[serde(default)]
    pub tag_list: Option<String>,
    /// Points at a JSON document of amplitude samples, not an image.
    #[serde(default)]
    pub waveform_url: Option<String>,
    #[serde(default)]
    pub playback_count: Option<u64>,
    #[serde(default)]
    pub likes_count: Option<u64>,
    #[serde(default)]
    pub reposts_count: Option<u64>,
    #[serde(default)]
    pub comment_count: Option<u64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub purchase_url: Option<String>,
    #[serde(default)]
    pub purchase_title: Option<String>,
    /// The uploader ticked "allow downloads".
    #[serde(default)]
    pub downloadable: Option<bool>,
    #[serde(default)]
    pub has_downloads_left: Option<bool>,
    #[serde(default)]
    pub label_name: Option<String>,
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

/// The full profile behind a user page: everything soundcloud.com shows in
/// its header. Distinct from `User`, which is the list-row projection.
#[derive(Debug, Serialize)]
pub struct Profile {
    pub id: u64,
    pub username: String,
    pub full_name: Option<String>,
    pub description: Option<String>,
    pub city: Option<String>,
    pub country_code: Option<String>,
    pub avatar_url: Option<String>,
    /// Banner image, pulled out of the nested `visuals` block.
    pub banner_url: Option<String>,
    pub permalink_url: Option<String>,
    pub verified: bool,
    pub followers_count: Option<u64>,
    pub followings_count: Option<u64>,
    pub track_count: Option<u64>,
    pub playlist_count: Option<u64>,
    pub likes_count: Option<u64>,
}

#[derive(Deserialize)]
pub(crate) struct RawVisual {
    #[serde(default)]
    pub visual_url: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct RawVisuals {
    #[serde(default)]
    pub visuals: Vec<RawVisual>,
}

#[derive(Deserialize)]
pub(crate) struct RawBadges {
    #[serde(default)]
    pub verified: bool,
}

#[derive(Deserialize)]
pub(crate) struct RawProfile {
    pub id: u64,
    pub username: String,
    #[serde(default)]
    pub full_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub country_code: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub visuals: Option<RawVisuals>,
    #[serde(default)]
    pub permalink_url: Option<String>,
    #[serde(default)]
    pub verified: Option<bool>,
    #[serde(default)]
    pub badges: Option<RawBadges>,
    #[serde(default)]
    pub followers_count: Option<u64>,
    #[serde(default)]
    pub followings_count: Option<u64>,
    #[serde(default)]
    pub track_count: Option<u64>,
    #[serde(default)]
    pub playlist_count: Option<u64>,
    #[serde(default)]
    pub likes_count: Option<u64>,
}

impl From<RawProfile> for Profile {
    fn from(p: RawProfile) -> Self {
        Profile {
            id: p.id,
            username: p.username,
            // Empty strings are as good as absent for every field below.
            full_name: p.full_name.filter(|v| !v.trim().is_empty()),
            description: p.description.filter(|v| !v.trim().is_empty()),
            city: p.city.filter(|v| !v.trim().is_empty()),
            country_code: p.country_code.filter(|v| !v.trim().is_empty()),
            avatar_url: p.avatar_url,
            banner_url: p
                .visuals
                .and_then(|v| v.visuals.into_iter().find_map(|x| x.visual_url)),
            permalink_url: p.permalink_url,
            verified: p.verified.unwrap_or(false) || p.badges.is_some_and(|b| b.verified),
            followers_count: p.followers_count,
            followings_count: p.followings_count,
            track_count: p.track_count,
            playlist_count: p.playlist_count,
            likes_count: p.likes_count,
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

// --------------------------------------------------------- track detail ----

/// Everything a track page shows, on top of what a list row needs.
///
/// Separate from `Track` on purpose: this is fetched one at a time for the
/// track currently being looked at, whereas `Track` is what crosses the bridge
/// in the thousands.
#[derive(Debug, Serialize)]
pub struct TrackDetail {
    pub id: u64,
    pub title: String,
    pub duration: u64,
    pub artwork_url: Option<String>,
    pub permalink_url: Option<String>,
    pub artist: Option<String>,
    /// The uploader, so the page can link through to their profile.
    pub user: Option<User>,
    pub description: Option<String>,
    pub genre: Option<String>,
    pub tags: Vec<String>,
    pub waveform_url: Option<String>,
    pub playback_count: Option<u64>,
    pub likes_count: Option<u64>,
    pub reposts_count: Option<u64>,
    pub comment_count: Option<u64>,
    /// ISO-8601, as SoundCloud sends it.
    pub created_at: Option<String>,
    pub license: Option<String>,
    /// "Buy" / "Free download" link the uploader attached.
    pub purchase_url: Option<String>,
    pub purchase_title: Option<String>,
    /// An artist-provided original file can be pulled via `tracks::download_url`.
    pub downloadable: bool,
    pub label_name: Option<String>,
}

/// Split SoundCloud's `tag_list` into tags.
///
/// The format is space-separated with multi-word tags wrapped in double quotes
/// (`house "deep house" techno`), so a plain `split_whitespace` would shred
/// every two-word tag into nonsense.
fn parse_tags(list: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut current = String::new();
    let mut quoted = false;

    for ch in list.chars() {
        match ch {
            '"' => {
                quoted = !quoted;
                // A closing quote ends the tag even without a trailing space.
                if !quoted && !current.trim().is_empty() {
                    tags.push(current.trim().to_string());
                    current.clear();
                }
            }
            c if c.is_whitespace() && !quoted => {
                if !current.trim().is_empty() {
                    tags.push(current.trim().to_string());
                }
                current.clear();
            }
            c => current.push(c),
        }
    }
    if !current.trim().is_empty() {
        tags.push(current.trim().to_string());
    }
    tags
}

impl From<RawTrack> for TrackDetail {
    fn from(t: RawTrack) -> Self {
        let user = t.user.map(User::from);
        TrackDetail {
            id: t.id,
            title: t.title,
            duration: t.duration,
            artwork_url: t
                .artwork_url
                .or_else(|| user.as_ref().and_then(|u| u.avatar_url.clone())),
            permalink_url: t.permalink_url,
            artist: user.as_ref().map(|u| u.username.clone()),
            description: t.description.filter(|v| !v.trim().is_empty()),
            genre: t.genre.filter(|v| !v.trim().is_empty()),
            tags: t.tag_list.as_deref().map(parse_tags).unwrap_or_default(),
            waveform_url: t.waveform_url,
            playback_count: t.playback_count,
            likes_count: t.likes_count,
            reposts_count: t.reposts_count,
            comment_count: t.comment_count,
            created_at: t.created_at,
            license: t.license.filter(|v| !v.trim().is_empty()),
            purchase_url: t.purchase_url.filter(|v| !v.trim().is_empty()),
            purchase_title: t.purchase_title.filter(|v| !v.trim().is_empty()),
            // `has_downloads_left` is false once a capped free download runs
            // out, at which point offering the button is a lie.
            downloadable: t.downloadable.unwrap_or(false) && t.has_downloads_left.unwrap_or(true),
            label_name: t.label_name.filter(|v| !v.trim().is_empty()),
            user,
        }
    }
}

/// A track's rendered waveform: `samples` are heights in `0..=height`.
#[derive(Debug, Serialize, Deserialize)]
pub struct Waveform {
    pub width: u32,
    pub height: u32,
    pub samples: Vec<u32>,
}

// -------------------------------------------------------------- comment ----

/// A comment on a track. `timestamp` is the point in the track it is pinned
/// to — that is what makes SoundCloud comments SoundCloud comments.
#[derive(Debug, Serialize)]
pub struct Comment {
    pub id: u64,
    pub body: String,
    /// Milliseconds into the track, or `None` for an untimed comment.
    pub timestamp: Option<u64>,
    pub created_at: Option<String>,
    pub user: Option<User>,
}

#[derive(Deserialize)]
pub(crate) struct RawComment {
    pub id: u64,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub timestamp: Option<u64>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub user: Option<RawUser>,
}

impl From<RawComment> for Comment {
    fn from(c: RawComment) -> Self {
        Comment {
            id: c.id,
            body: c.body,
            timestamp: c.timestamp,
            created_at: c.created_at,
            user: c.user.map(User::from),
        }
    }
}
