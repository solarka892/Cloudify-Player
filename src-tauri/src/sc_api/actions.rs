//! Write operations: likes, follows and playlist editing.
//!
//! ⚠️ **Unverified.** Every endpoint here mutates the signed-in account, so
//! none of them can be exercised by the live test suite (which is read-only
//! and unauthenticated). The shapes follow what soundcloud.com's own web app
//! sends; if one of them turns out to be wrong, this is the first file to
//! look at.
//!
//! All of these require `Authorization: OAuth <token>`. A `401` means the
//! stored token went stale — the UI should prompt for a fresh login rather
//! than retrying.

use std::sync::Mutex;

use serde::Serialize;

use super::{client_id, http_client, me, ScApiError, API_V2};

/// The HTTP verb that turns a collection membership on.
///
/// Likes and follows disagree, which is not something to guess at: the wrong
/// one is a 404 on a route that exists, and the like silently never happened.
#[derive(Clone, Copy)]
enum On {
    Put,
    Post,
}

/// Add to or remove from a collection endpoint. See docs/sc-api.md.
///
/// One forced retry with a freshly extracted `client_id`, like every read route
/// already does. It was missing here, and the asymmetry was visible: SoundCloud
/// rotates the key without warning, and until now that made *adding* a like fail
/// for the rest of the session while removing one — which the browser had
/// already warmed — kept working. That is exactly the shape of "likes go away
/// fine but will not go on".
async fn toggle(token: &str, path: String, on: bool, verb: On) -> Result<(), ScApiError> {
    match send(token, &path, on, verb, false).await {
        Err(ScApiError::StaleClientId) => send(token, &path, on, verb, true).await,
        other => other,
    }
}

/// The verb, as the wire spells it.
fn method(on: bool, verb: On) -> &'static str {
    match (on, verb) {
        (true, On::Put) => "PUT",
        (true, On::Post) => "POST",
        (false, _) => "DELETE",
    }
}

/// A write, from a window that is on soundcloud.com.
///
/// Not from here. DataDome fingerprints the TLS handshake and ours is not a
/// browser's, so a request built in this process is refused before SoundCloud
/// ever sees it — measured, and written up in `docs/sc-api.md`. The one browser
/// we are sure of is the one drawing this app, so the request goes out from a
/// window of it. See `sc_api::writer`.
///
/// Reads stay on the direct path. They are not behind the filter, they are the
/// overwhelming majority of what the app does, and routing a list of tracks
/// through a page would be slower and more fragile for no gain at all.
#[cfg(desktop)]
async fn send(
    token: &str,
    path: &str,
    on: bool,
    verb: On,
    fresh_client_id: bool,
) -> Result<(), ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let url = format!("{API_V2}{path}?client_id={cid}");
    // A bodyless PUT on these routes comes back `415`.
    let answer = super::writer::send(token, method(on, verb), &url, "{}").await?;
    verdict(answer, fresh_client_id)
}

/// The same write on a platform with no window to send it from.
///
/// Android keeps the direct path. It is very probably refused there too, but
/// nobody has been able to run the app on a phone yet (see `docs/android.md`),
/// and swapping a known-shape request for an untested one on a target that
/// cannot be tested is how a second bug gets buried under the first.
#[cfg(not(desktop))]
async fn send(
    token: &str,
    path: &str,
    on: bool,
    verb: On,
    fresh_client_id: bool,
) -> Result<(), ScApiError> {
    let cid = client_id::get(fresh_client_id).await?;
    let client = http_client()?;
    let url = format!("{API_V2}{path}");

    let request = match (on, verb) {
        (true, On::Put) => client.put(&url),
        (true, On::Post) => client.post(&url),
        (false, _) => client.delete(&url),
    };

    let resp = request
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .header("Origin", "https://soundcloud.com")
        .header("Referer", "https://soundcloud.com/")
        // SoundCloud rejects a bodyless PUT on these routes with a 415.
        .json(&serde_json::json!({}))
        .send()
        .await?;

    refusal(resp, fresh_client_id).await
}

/// What the window's answer means.
///
/// A `fetch` cannot read response headers it was not given permission to, so the
/// `x-datadome` tell the direct path keys on is not available here. It does not
/// need to be: these routes answer `403` for one reason, and the window is the
/// thing that can do something about it — it has already shown the challenge and
/// waited by the time this sees a `403`, so reaching here means nobody answered.
///
/// A redirect is a failure however sunny the status looks. `fetch` follows them,
/// so a write bounced somewhere else comes back `200` from a page that did
/// nothing, and the heart in the UI — which flipped optimistically and only
/// rolls back on a reported failure — would be left telling a lie. That is
/// exactly what "the likes seem to be visual only" would look like from the
/// outside, and it is worth refusing on principle rather than waiting to find
/// out whether SoundCloud ever does it.
#[cfg(desktop)]
fn verdict(answer: super::writer::Outcome, retried: bool) -> Result<(), ScApiError> {
    if answer.redirected {
        return Err(ScApiError::Refused {
            status: answer.status,
            detail: ": the write was redirected and did not land".into(),
        });
    }
    match answer.status {
        200..=299 => Ok(()),
        429 => Err(ScApiError::RateLimited),
        // One retry with a freshly extracted key first: it is in the URL, and it
        // does rotate.
        401 | 403 if !retried => Err(ScApiError::StaleClientId),
        401 => Err(ScApiError::SessionExpired),
        403 => Err(ScApiError::BotFiltered),
        other => Err(ScApiError::Refused {
            status: other,
            detail: if answer.body.is_empty() {
                String::new()
            } else {
                format!(": {}", answer.body)
            },
        }),
    }
}

/// How many characters of SoundCloud's own reply are worth carrying.
///
/// Enough for `{"error":"..."}` and a little more. These bodies are occasionally
/// a whole HTML error page, and a toast is not the place for one.
#[cfg(not(desktop))]
const DETAIL_LIMIT: usize = 220;

/// What a refused *write* means — which is not what a refused read means.
///
/// `super::classify` reads every 401 and 403 as a rotated `client_id`, and for
/// the read routes that is right: they authenticate with the key and nothing
/// else, so it is the only thing that can have gone stale. A write also carries
/// an OAuth token, and once the key has been re-fetched and refused a second
/// time, the token is the remaining suspect. Saying "client_id likely stale" at
/// that point sends the user to fix something that is not broken.
///
/// Anything else is reported **with SoundCloud's own status and body**. Every
/// route in this file is marked unverified at the top of it, and when one of
/// them is refused that reply is the only evidence there is; swallowing it in
/// favour of a tidy sentence is how a bug report arrives with nothing in it.
/// Nothing here can leak the token — it goes out in a header and never comes
/// back in a body.
#[cfg(not(desktop))]
async fn refusal(resp: reqwest::Response, retried: bool) -> Result<(), ScApiError> {
    let status = resp.status();
    if status.is_success() {
        return Ok(());
    }
    if status.as_u16() == 429 {
        return Err(ScApiError::RateLimited);
    }
    // Before anything about credentials: the bot filter says so in a header, and
    // it is not a credentials problem. Retrying the key against it is a wasted
    // round trip and telling the user their session expired sends them to sign
    // in again for nothing.
    if resp.headers().contains_key("x-datadome") {
        return Err(ScApiError::BotFiltered);
    }
    // First 401/403: worth one retry with a freshly extracted key, which is
    // what `toggle` does when it sees this.
    if matches!(status.as_u16(), 401 | 403) && !retried {
        return Err(ScApiError::StaleClientId);
    }
    if status.as_u16() == 401 {
        return Err(ScApiError::SessionExpired);
    }

    let body = resp.text().await.unwrap_or_default();
    let body = body.trim();
    let detail = if body.is_empty() {
        String::new()
    } else {
        let mut cut = body.chars().take(DETAIL_LIMIT).collect::<String>();
        if body.chars().count() > DETAIL_LIMIT {
            cut.push('…');
        }
        format!(": {cut}")
    };
    Err(ScApiError::Refused {
        status: status.as_u16(),
        detail,
    })
}

/// The signed-in user's id, remembered after the first lookup.
///
/// The like routes are nested under the user rather than under `/me`, so they
/// need it; asking `/me` on every heart-click would be a round trip for an id
/// that cannot change while a token is valid.
static SELF_ID: Mutex<Option<u64>> = Mutex::new(None);

/// The signed-in user's id, from cache when it is warm.
///
/// Public because the message routes need it too: conversations are addressed
/// as `/users/{me}/conversations/{other}`, so every one of them starts here.
pub async fn self_id(token: &str) -> Result<u64, ScApiError> {
    if let Some(id) = *SELF_ID.lock().expect("SELF_ID poisoned") {
        return Ok(id);
    }
    let id = me::get(token).await?.id;
    *SELF_ID.lock().expect("SELF_ID poisoned") = Some(id);
    Ok(id)
}

/// Forget the cached id — call when the stored token changes.
pub fn forget_self_id() {
    *SELF_ID.lock().expect("SELF_ID poisoned") = None;
}

/// Like or unlike a track.
pub async fn like_track(token: &str, track_id: u64, on: bool) -> Result<(), ScApiError> {
    let me = self_id(token).await?;
    toggle(
        token,
        format!("/users/{me}/track_likes/{track_id}"),
        on,
        On::Put,
    )
    .await
}

/// Like or unlike a playlist or album.
pub async fn like_playlist(token: &str, playlist_id: u64, on: bool) -> Result<(), ScApiError> {
    let me = self_id(token).await?;
    toggle(
        token,
        format!("/users/{me}/playlist_likes/{playlist_id}"),
        on,
        On::Put,
    )
    .await
}

/// Follow or unfollow a user. `POST` to follow — a `PUT` here is a 404.
pub async fn follow_user(token: &str, user_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/me/followings/{user_id}"), on, On::Post).await
}

/// Repost or un-repost a track.
///
/// Route shape probed 2026-08-04: `PUT /me/track_reposts/{id}` answers `403`
/// unauthenticated — the same response our working like route gives, whereas a
/// route that does not exist answers `404`.
pub async fn repost_track(token: &str, track_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(token, format!("/me/track_reposts/{track_id}"), on, On::Put).await
}

/// Repost or un-repost a playlist or album.
pub async fn repost_playlist(token: &str, playlist_id: u64, on: bool) -> Result<(), ScApiError> {
    toggle(
        token,
        format!("/me/playlist_reposts/{playlist_id}"),
        on,
        On::Put,
    )
    .await
}

#[derive(Serialize)]
struct TrackRef {
    id: u64,
}

/// The `playlist` half of the envelope SoundCloud's playlist routes expect.
///
/// Every field is skipped when absent, `tracks` included — and that one
/// matters: this is a PUT, so a serialised `"tracks": []` is not "leave the
/// tracks alone", it is "empty the playlist". Renaming a set must not be able
/// to delete it.
#[derive(Serialize)]
struct PlaylistBody<'a> {
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    sharing: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tracks: Option<Vec<TrackRef>>,
}

#[derive(Serialize)]
struct PlaylistEnvelope<'a> {
    playlist: PlaylistBody<'a>,
}

/// Create a playlist, optionally seeded with tracks. Returns its id.
pub async fn create_playlist(
    token: &str,
    title: &str,
    track_ids: &[u64],
    public: bool,
) -> Result<u64, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    #[derive(serde::Deserialize)]
    struct Created {
        id: u64,
    }

    let created: Created = client
        .post(format!("{API_V2}/playlists"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title: Some(title),
                description: None,
                sharing: Some(if public { "public" } else { "private" }),
                tracks: Some(track_ids.iter().map(|&id| TrackRef { id }).collect()),
            },
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(created.id)
}

/// Edit a playlist's metadata, leaving its tracks untouched.
///
/// `None` means "don't change this field" — `tracks` is never sent from here,
/// so a rename cannot empty the set.
pub async fn edit_playlist(
    token: &str,
    playlist_id: u64,
    title: Option<&str>,
    description: Option<&str>,
    public: Option<bool>,
) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .put(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title,
                description,
                sharing: public.map(|p| if p { "public" } else { "private" }),
                tracks: None,
            },
        })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Delete a playlist for good. `DELETE /playlists/{id}` answers `401`
/// unauthenticated, so the route is real (probed 2026-08-04).
pub async fn delete_playlist(token: &str, playlist_id: u64) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .delete(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Replace a playlist's track list.
///
/// SoundCloud has no "append one track" route — the whole list is sent every
/// time, so callers must read the current tracks first and post the union.
/// `playlists::get_playlist_tracks` is the read side of that pair.
pub async fn set_playlist_tracks(
    token: &str,
    playlist_id: u64,
    track_ids: &[u64],
) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .put(format!("{API_V2}/playlists/{playlist_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&PlaylistEnvelope {
            playlist: PlaylistBody {
                title: None,
                description: None,
                sharing: None,
                tracks: Some(track_ids.iter().map(|&id| TrackRef { id }).collect()),
            },
        })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
