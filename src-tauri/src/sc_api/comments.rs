//! Track comments — the timed kind SoundCloud is known for.
//!
//! Reading is public: `GET /tracks/{id}/comments` (verified live, 2026-08-04).
//! Writing needs OAuth:
//!   - `POST   /tracks/{id}/comments` → 403 unauthenticated (route exists)
//!   - `DELETE /comments/{id}`        → 401 unauthenticated (route exists)
//!
//! ⚠️ The **body shape** of the POST is unverified — it mirrors the envelope
//! SoundCloud uses elsewhere (`{"playlist": {…}}` in `actions.rs`). If posting
//! a comment ever fails with a 422, this is the first thing to change. See
//! `docs/sc-api.md`.

use serde::Serialize;

use super::{
    client_id, http_client,
    models::{Comment, RawComment},
    paging::collect_all,
    ScApiError, API_V2,
};

/// Fetch a track's comments, newest first.
///
/// `threaded=0` flattens replies into the same list; asking for threads gets a
/// nested shape the UI has no use for.
pub async fn list(
    token: Option<&str>,
    track_id: u64,
    max: u32,
) -> Result<Vec<Comment>, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: Vec<RawComment> = collect_all(
        &client,
        format!("{API_V2}/tracks/{track_id}/comments?threaded=0&filter_replies=0"),
        token,
        &cid,
        max as usize,
    )
    .await?;

    Ok(raw.into_iter().map(Comment::from).collect())
}

#[derive(Serialize)]
struct CommentBody<'a> {
    body: &'a str,
    /// Milliseconds into the track. SoundCloud accepts `null` for an untimed
    /// comment, which is what the website posts from the comment box.
    timestamp: Option<u64>,
}

#[derive(Serialize)]
struct CommentEnvelope<'a> {
    comment: CommentBody<'a>,
}

/// Post a comment, optionally pinned to `timestamp_ms` into the track.
pub async fn post(
    token: &str,
    track_id: u64,
    body: &str,
    timestamp_ms: Option<u64>,
) -> Result<Comment, ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let raw: RawComment = client
        .post(format!("{API_V2}/tracks/{track_id}/comments"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .json(&CommentEnvelope {
            comment: CommentBody {
                body,
                timestamp: timestamp_ms,
            },
        })
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    Ok(Comment::from(raw))
}

/// Delete one of your own comments.
pub async fn delete(token: &str, comment_id: u64) -> Result<(), ScApiError> {
    let cid = client_id::get(false).await?;
    let client = http_client()?;

    client
        .delete(format!("{API_V2}/comments/{comment_id}"))
        .query(&[("client_id", cid.as_str())])
        .header("Authorization", format!("OAuth {token}"))
        .send()
        .await?
        .error_for_status()?;
    Ok(())
}
