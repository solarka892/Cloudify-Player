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

/// Pull a nested object out of `origin` and read it as a track.
fn nested_track(value: &serde_json::Value, key: &str) -> Option<Track> {
    serde_json::from_value::<RawTrack>(value.get(key)?.clone())
        .ok()
        .map(Track::from)
}

/// Pull a nested object out of `origin` and read it as a playlist.
fn nested_playlist(value: &serde_json::Value, key: &str) -> Option<Playlist> {
    serde_json::from_value::<RawPlaylist>(value.get(key)?.clone())
        .ok()
        .map(Playlist::from)
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
            let track = nested_track(&value, "track");
            let body = value
                .get("body")
                .and_then(|b| b.as_str())
                .map(str::to_string);
            let at = value.get("timestamp").and_then(serde_json::Value::as_u64);
            (track, None, body, at)
        }
        // Everything else — `like`, `favoriting`, `affiliation`, whatever comes
        // next — is asked whether it *wraps* a track or a set rather than being
        // one. A like's origin is not the track: it is a like object with the
        // track inside it, which is why every "X liked" row used to end there,
        // with no title and nothing to click. A follow's origin holds only a
        // user, which the top-level `user` already covers, so it stays empty.
        _ => (
            nested_track(&value, "track"),
            nested_playlist(&value, "playlist"),
            None,
            None,
        ),
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
            // Who did it is usually a sibling of `origin`, but on some types it
            // is only inside it — a row with no name at all is worse than one
            // read out of the nested object.
            let actor = a.user.or_else(|| {
                serde_json::from_value::<RawUser>(a.origin.as_ref()?.get("user")?.clone()).ok()
            });
            let (track, playlist, comment, comment_timestamp) = split_origin(a.origin);
            Activity {
                kind: a.kind,
                created_at: a.created_at,
                user: actor.map(User::from),
                track,
                playlist,
                comment,
                comment_timestamp,
            }
        })
        .collect())
}
