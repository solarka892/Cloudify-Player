//! Notifications — likes, comments, follows and reposts on your own things.
//!
//! `GET /activities` (401 unauthenticated, so the route exists; every other
//! spelling probed on 2026-08-04 — `/notifications`, `/me/activities`,
//! `/users/{id}/notifications` — is a 404).
//!
//! Each entry has a `type` (`track-repost`, `comment`, `favoriting`, …), the
//! user who caused it, and an `origin` object whose shape depends on the type.
//! `origin` is read as raw JSON and dispatched on its own `kind` field rather
//! than through an untagged enum: SoundCloud's objects overlap enough that an
//! untagged match happily decodes a track as a comment.

use serde::{Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, RawUser, Track, User},
    paging::collect_all,
    ScApiError, API_V2,
};

/// One line in the notifications list.
#[derive(Debug, Serialize)]
pub struct Activity {
    /// SoundCloud's own type string, passed through so the UI picks the icon
    /// and wording. Known values: `track`, `playlist`, `track-repost`,
    /// `playlist-repost`, `comment`, `favoriting`, `affiliation` (a follow).
    pub kind: String,
    pub created_at: Option<String>,
    /// Who did it.
    pub user: Option<User>,
    /// What it happened to, when that is a track.
    pub track: Option<Track>,
    /// What it happened to, when that is a playlist.
    pub playlist: Option<Playlist>,
    /// The comment text, for `comment` activities.
    pub comment: Option<String>,
    /// Where in the track the comment sits, in milliseconds.
    pub comment_timestamp: Option<u64>,
}

#[derive(Deserialize)]
struct RawActivity {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    user: Option<RawUser>,
    #[serde(default)]
    origin: Option<serde_json::Value>,
}

/// Interpret an `origin` blob according to the `kind` SoundCloud stamps on it.
fn split_origin(
    origin: Option<serde_json::Value>,
) -> (Option<Track>, Option<Playlist>, Option<String>, Option<u64>) {
    let Some(value) = origin else {
        return (None, None, None, None);
    };

    match value.get("kind").and_then(|k| k.as_str()) {
        Some("track") => (
            serde_json::from_value::<RawTrack>(value)
                .ok()
                .map(Track::from),
            None,
            None,
            None,
        ),
        Some("playlist") => (
            None,
            serde_json::from_value::<RawPlaylist>(value)
                .ok()
                .map(Playlist::from),
            None,
            None,
        ),
        Some("comment") => {
            // A comment activity carries the track it was left on inside it,
            // which is the only way the row can link anywhere useful.
            let track = value
                .get("track")
                .cloned()
                .and_then(|t| serde_json::from_value::<RawTrack>(t).ok())
                .map(Track::from);
            let body = value
                .get("body")
                .and_then(|b| b.as_str())
                .map(str::to_string);
            let at = value.get("timestamp").and_then(serde_json::Value::as_u64);
            (track, None, body, at)
        }
        // A follow's origin is the user, which `user` already covers.
        _ => (None, None, None, None),
    }
}

/// The notifications feed, newest first. Requires OAuth.
pub async fn list(token: &str, max: u32) -> Result<Vec<Activity>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawActivity> = collect_all(
        &client,
        format!("{API_V2}/activities"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw
        .into_iter()
        .map(|a| {
            let (track, playlist, comment, comment_timestamp) = split_origin(a.origin);
            Activity {
                kind: a.kind,
                created_at: a.created_at,
                user: a.user.map(User::from),
                track,
                playlist,
                comment,
                comment_timestamp,
            }
        })
        .collect())
}
