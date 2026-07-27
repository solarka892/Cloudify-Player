//! Search across tracks, users and playlists.
//!
//! `GET /search/{kind}?q=…&limit=…&offset=…` — public data, `client_id` is
//! enough, no login required. Verified in recon (`docs/sc-api.md`).
//!
//! Paging is by numeric `offset` (SoundCloud's own `next_href` uses the same),
//! so the frontend pages with a plain number and never handles an API URL.

use serde::{de::DeserializeOwned, Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, RawUser, Track, User},
    ScApiError, API_V2,
};

/// One page of results plus where to continue from.
#[derive(Debug, Serialize)]
pub struct SearchPage<T> {
    pub items: Vec<T>,
    /// Offset to pass for the next page, or `None` at the end of the results.
    pub next_offset: Option<u32>,
    /// SoundCloud's estimate of the total match count.
    pub total: Option<u64>,
}

impl<T> SearchPage<T> {
    fn empty() -> Self {
        SearchPage {
            items: Vec::new(),
            next_offset: None,
            total: None,
        }
    }
}

#[derive(Deserialize)]
struct SearchResponse<T> {
    #[serde(default = "Vec::new")]
    collection: Vec<T>,
    #[serde(default)]
    next_href: Option<String>,
    #[serde(default)]
    total_results: Option<u64>,
}

/// Hard cap on `limit`; api-v2 rejects oversized page sizes.
const MAX_LIMIT: u32 = 200;

/// Shared query for every `/search/{kind}` endpoint.
async fn search<Raw, Out>(
    kind: &str,
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Out>, ScApiError>
where
    Raw: DeserializeOwned,
    Out: From<Raw>,
{
    let query = query.trim();
    if query.is_empty() {
        return Ok(SearchPage::empty());
    }

    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit_s = limit.clamp(1, MAX_LIMIT).to_string();
    let offset_s = offset.to_string();

    let resp: SearchResponse<Raw> = client
        .get(format!("{API_V2}/search/{kind}"))
        .query(&[
            ("q", query),
            ("client_id", cid.as_str()),
            ("limit", limit_s.as_str()),
            ("offset", offset_s.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let items: Vec<Out> = resp.collection.into_iter().map(Out::from).collect();
    let next_offset = resp
        .next_href
        .is_some()
        .then(|| offset + items.len() as u32);

    Ok(SearchPage {
        items,
        next_offset,
        total: resp.total_results,
    })
}

pub async fn search_tracks(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Track>, ScApiError> {
    search::<RawTrack, Track>("tracks", query, limit, offset).await
}

pub async fn search_users(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<User>, ScApiError> {
    search::<RawUser, User>("users", query, limit, offset).await
}

pub async fn search_playlists(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Playlist>, ScApiError> {
    search::<RawPlaylist, Playlist>("playlists", query, limit, offset).await
}
