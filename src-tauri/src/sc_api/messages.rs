//! Direct messages.
//!
//! Conversations are addressed by the *pair* of user ids — soundcloud.com's own
//! URL is `/messages/{me}:{other}` — so every route hangs off the signed-in
//! user and takes the other party's id. All of them need OAuth.
//!
//! Route shapes probed unauthenticated on 2026-08-04 (401/403 = the route
//! exists, 404 = it does not; see `docs/sc-api.md` for the method):
//!
//! | Operation | Route | Probe |
//! |---|---|---|
//! | list conversations | `GET /users/{me}/conversations` | 401 ✅ |
//! | unread count | `GET /users/{me}/conversations/unread` | 401 ✅ |
//! | read a thread | `GET /users/{me}/conversations/{other}/messages` | 401 ✅ |
//! | send | `POST /users/{me}/conversations/{other}` | 403 ✅ |
//! | mark read | `PUT /users/{me}/conversations/{other}` | 401 ✅ |
//! | delete thread | `DELETE /users/{me}/conversations/{other}` | 401 ✅ |
//!
//! Note `POST …/{other}/messages` is a **404** — sending posts to the
//! conversation itself, not to its message collection. That is the one shape
//! here it would have been easy to guess wrong.
//!
//! ⚠️ The response *payloads* could not be probed without an account, so the
//! structs below are deliberately forgiving: every field is optional and the
//! plausible spellings are accepted via `alias`. A field that comes back under
//! a name not listed here degrades to `None` instead of failing the whole
//! request.

use serde::Serialize;

use super::{
    client_id, http_client,
    models::{RawTrack, RawUser, Track, User},
    ScApiError, API_V2,
};

/// A thread in the inbox list.
#[derive(Debug, Serialize)]
pub struct Conversation {
    /// The other party. Threads are one-to-one on SoundCloud.
    pub user: User,
    /// Preview line, as the inbox shows it.
    pub last_message: Option<String>,
    pub last_at: Option<String>,
    pub unread: bool,
}

/// One message in a thread.
#[derive(Debug, Serialize)]
pub struct Message {
    pub id: Option<u64>,
    pub content: String,
    pub created_at: Option<String>,
    /// Sent by the signed-in user rather than the other party.
    pub from_me: bool,
    /// Messages can carry a track or playlist; the UI renders it playable.
    pub track: Option<Track>,
}

/// Pull the numeric id out of a `soundcloud:users:1234` URN.
fn urn_id(urn: &str) -> Option<u64> {
    urn.rsplit(':').next()?.parse().ok()
}

/// GET a message route and hand back the rows as raw JSON.
///
/// Everything here is read as `Value` first rather than straight into a struct.
/// The payloads could not be probed without an account, and the first build
/// that guessed at them failed with "error decoding response body" on a
/// response that had arrived perfectly well — one unexpected key or a bare
/// array instead of a `{ collection }` envelope was enough to lose the lot.
/// Reading loosely and picking fields out by hand cannot fail that way.
async fn rows(token: &str, url: String, limit: u32) -> Result<Vec<serde_json::Value>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit = limit.to_string();

    let body: serde_json::Value = client
        .get(url)
        .query(&[
            ("client_id", cid.as_str()),
            ("limit", limit.as_str()),
            ("linked_partitioning", "1"),
        ])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(match body {
        // `{ "collection": [...] }`, the usual envelope.
        serde_json::Value::Object(mut map) => match map.remove("collection") {
            Some(serde_json::Value::Array(items)) => items,
            // Some routes answer with the array under a different key, or with
            // a single object. Neither is worth failing over.
            _ => map
                .into_values()
                .find_map(|v| match v {
                    serde_json::Value::Array(items) => Some(items),
                    _ => None,
                })
                .unwrap_or_default(),
        },
        // A bare array.
        serde_json::Value::Array(items) => items,
        _ => Vec::new(),
    })
}

/// First string present under any of `keys`, ignoring blanks.
fn pick_str(value: &serde_json::Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|k| value.get(*k).and_then(|v| v.as_str()))
        .map(str::to_string)
        .filter(|s| !s.trim().is_empty())
}

/// A user id written either as a number or as a `soundcloud:users:N` URN.
fn pick_user_id(value: &serde_json::Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|k| {
        let field = value.get(*k)?;
        field
            .as_u64()
            .or_else(|| field.as_str().and_then(urn_id))
            .or_else(|| field.get("id").and_then(serde_json::Value::as_u64))
    })
}

/// Read one message out of a raw row.
fn read_message(value: &serde_json::Value, me: u64) -> Message {
    let sender = pick_user_id(
        value,
        &["sender_urn", "sender_id", "user_id", "sender", "user"],
    );
    Message {
        id: value.get("id").and_then(serde_json::Value::as_u64),
        content: pick_str(value, &["content", "body", "message", "text"]).unwrap_or_default(),
        created_at: pick_str(value, &["created_at", "sent_at", "timestamp"]),
        // Absent a sender the message reads as theirs: putting someone else's
        // words on the user's side is the worse of the two mistakes.
        from_me: sender == Some(me),
        track: value
            .get("track")
            .cloned()
            .and_then(|t| serde_json::from_value::<RawTrack>(t).ok())
            .map(Track::from),
    }
}

/// The inbox: every thread, newest activity first.
pub async fn conversations(
    token: &str,
    me: u64,
    max: u32,
) -> Result<Vec<Conversation>, ScApiError> {
    let raw = rows(token, format!("{API_V2}/users/{me}/conversations"), max).await?;

    Ok(raw
        .into_iter()
        .filter_map(|row| {
            let unread = row
                .get("unread_count")
                .and_then(serde_json::Value::as_u64)
                .is_some_and(|n| n > 0)
                || row.get("read").and_then(serde_json::Value::as_bool) == Some(false);

            let last = row
                .get("last_message")
                .or_else(|| row.get("latest_message"));
            let last_message = last
                .and_then(|m| pick_str(m, &["content", "body", "message", "text"]))
                .or_else(|| pick_str(&row, &["last_message", "preview"]));
            let last_at = last
                .and_then(|m| pick_str(m, &["created_at", "sent_at"]))
                .or_else(|| pick_str(&row, &["last_message_at", "updated_at", "created_at"]));

            // The other party, however this row chose to name them. A thread we
            // cannot attribute has nothing to open — every route is keyed on
            // their id — so it is dropped rather than shown as a dead row.
            let other = row
                .get("users")
                .and_then(serde_json::Value::as_array)
                .and_then(|users| {
                    users
                        .iter()
                        .find(|u| u.get("id").and_then(serde_json::Value::as_u64) != Some(me))
                        .cloned()
                })
                .or_else(|| row.get("user").cloned())
                .or_else(|| row.get("other_user").cloned())?;

            let user = User::from(serde_json::from_value::<RawUser>(other).ok()?);
            if user.id == me {
                return None;
            }

            Some(Conversation {
                user,
                last_message,
                last_at,
                unread,
            })
        })
        .collect())
}

/// How many threads have unread messages — the badge on the inbox.
pub async fn unread_count(token: &str, me: u64) -> Result<u64, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    // Raw JSON again: this route could as easily answer with a bare number, and
    // a badge is not worth failing over.
    let body: serde_json::Value = client
        .get(format!("{API_V2}/users/{me}/conversations/unread"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(body
        .as_u64()
        .or_else(|| {
            ["count", "unread_count", "total", "total_results"]
                .iter()
                .find_map(|k| body.get(*k).and_then(serde_json::Value::as_u64))
        })
        .or_else(|| {
            body.get("collection")
                .and_then(serde_json::Value::as_array)
                .map(|items| items.len() as u64)
        })
        .unwrap_or(0))
}

/// One thread's messages, oldest first (the order a chat reads in).
pub async fn thread(
    token: &str,
    me: u64,
    other: u64,
    max: u32,
) -> Result<Vec<Message>, ScApiError> {
    let raw = rows(
        token,
        format!("{API_V2}/users/{me}/conversations/{other}/messages"),
        max,
    )
    .await?;

    let mut messages: Vec<Message> = raw.iter().map(|m| read_message(m, me)).collect();
    // SoundCloud pages newest-first; a chat window wants the opposite.
    messages.reverse();
    Ok(messages)
}

#[derive(Serialize)]
struct SendBody<'a> {
    content: &'a str,
}

/// Send a message. Creates the thread if there isn't one yet.
///
/// ⚠️ The request body is the unverified part — `POST` to the conversation is
/// confirmed to be the right route, but whether it wants `{"content": …}` is
/// not. A 422 here means this struct is wrong, nothing else.
pub async fn send(token: &str, me: u64, other: u64, content: &str) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .post(format!("{API_V2}/users/{me}/conversations/{other}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&SendBody { content })
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Mark a thread read (or unread — soundcloud.com offers both).
pub async fn set_read(token: &str, me: u64, other: u64, read: bool) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .put(format!("{API_V2}/users/{me}/conversations/{other}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&serde_json::json!({ "read": read }))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}

/// Delete a whole thread.
pub async fn delete(token: &str, me: u64, other: u64) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .delete(format!("{API_V2}/users/{me}/conversations/{other}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
