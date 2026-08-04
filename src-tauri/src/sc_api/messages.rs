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

use serde::{Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{RawTrack, RawUser, Track, User},
    paging::collect_all,
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

#[derive(Deserialize)]
struct RawConversation {
    #[serde(default)]
    users: Vec<RawUser>,
    /// Some shapes nest the preview, others flatten it.
    #[serde(default)]
    last_message: Option<RawMessage>,
    #[serde(default)]
    read: Option<bool>,
    #[serde(default)]
    unread_count: Option<u64>,
}

#[derive(Deserialize)]
struct RawMessage {
    #[serde(default)]
    id: Option<u64>,
    #[serde(default, alias = "body", alias = "message")]
    content: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default, alias = "sender_urn", alias = "user_urn")]
    sender: Option<String>,
    #[serde(default, alias = "sender_id", alias = "user_id")]
    sender_numeric_id: Option<u64>,
    #[serde(default)]
    track: Option<RawTrack>,
}

impl RawMessage {
    /// Who sent it, whichever way the API chose to say so.
    fn sender_id(&self) -> Option<u64> {
        self.sender_numeric_id
            .or_else(|| self.sender.as_deref().and_then(urn_id))
    }

    fn into_message(self, me: u64) -> Message {
        let from_me = self.sender_id() == Some(me);
        Message {
            id: self.id,
            content: self.content.unwrap_or_default(),
            created_at: self.created_at,
            from_me,
            track: self.track.map(Track::from),
        }
    }
}

/// The inbox: every thread, newest activity first.
pub async fn conversations(
    token: &str,
    me: u64,
    max: u32,
) -> Result<Vec<Conversation>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawConversation> = collect_all(
        &client,
        format!("{API_V2}/users/{me}/conversations"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw
        .into_iter()
        .filter_map(|c| {
            let unread = c.unread_count.is_some_and(|n| n > 0) || c.read == Some(false);
            let (last_message, last_at) = match c.last_message {
                Some(m) => (m.content, m.created_at),
                None => (None, None),
            };
            // A thread whose other party we cannot identify has nothing to
            // open — the routes are keyed on their id.
            let user = c.users.into_iter().find(|u| u.id != me).map(User::from)?;
            Some(Conversation {
                user,
                last_message,
                last_at,
                unread,
            })
        })
        .collect())
}

#[derive(Deserialize)]
struct UnreadResponse {
    #[serde(default, alias = "unread_count", alias = "total")]
    count: u64,
}

/// How many threads have unread messages — the badge on the inbox.
pub async fn unread_count(token: &str, me: u64) -> Result<u64, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let resp: UnreadResponse = client
        .get(format!("{API_V2}/users/{me}/conversations/unread"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(resp.count)
}

/// One thread's messages, oldest first (the order a chat reads in).
pub async fn thread(
    token: &str,
    me: u64,
    other: u64,
    max: u32,
) -> Result<Vec<Message>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawMessage> = collect_all(
        &client,
        format!("{API_V2}/users/{me}/conversations/{other}/messages"),
        Some(token),
        &cid,
        max as usize,
    )
    .await?;

    let mut messages: Vec<Message> = raw.into_iter().map(|m| m.into_message(me)).collect();
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
