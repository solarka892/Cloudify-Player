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

/// The narrowing controls soundcloud.com puts beside its results.
///
/// All are optional and passed straight through as `filter.*` query params.
/// Unknown values are rejected here rather than sent: SoundCloud answers a bad
/// filter with an empty result set, which looks exactly like "no matches" and
/// would send someone hunting for a search bug that isn't one.
#[derive(Debug, Default, Clone)]
pub struct Filters<'a> {
    /// A genre name as SoundCloud spells it, e.g. `House`.
    pub genre: Option<&'a str>,
    /// `short` (<2m), `medium` (2–10m), `long` (10–30m), `epic` (>30m).
    pub duration: Option<&'a str>,
    /// `last_hour`, `last_day`, `last_week`, `last_month`, `last_year`.
    pub created_at: Option<&'a str>,
    /// `to_share`, `to_modify_commercially`, `to_use_commercially`.
    pub license: Option<&'a str>,
}

const DURATIONS: [&str; 4] = ["short", "medium", "long", "epic"];
const CREATED_AT: [&str; 5] = [
    "last_hour",
    "last_day",
    "last_week",
    "last_month",
    "last_year",
];
const LICENSES: [&str; 3] = ["to_share", "to_modify_commercially", "to_use_commercially"];

impl<'a> Filters<'a> {
    /// `filter.*` pairs for the query string, dropping anything unrecognised.
    fn params(&self) -> Vec<(&'static str, &'a str)> {
        let mut out = Vec::new();
        if let Some(genre) = self.genre.filter(|g| !g.trim().is_empty()) {
            out.push(("filter.genre", genre));
        }
        if let Some(v) = self.duration.filter(|v| DURATIONS.contains(v)) {
            out.push(("filter.duration", v));
        }
        if let Some(v) = self.created_at.filter(|v| CREATED_AT.contains(v)) {
            out.push(("filter.created_at", v));
        }
        if let Some(v) = self.license.filter(|v| LICENSES.contains(v)) {
            out.push(("filter.license", v));
        }
        out
    }
}

/// Shared query for every `/search/{kind}` endpoint.
///
/// `kind` may be empty, which hits `/search` itself — SoundCloud's "Everything"
/// tab, returning tracks, users and playlists in one collection.
async fn search<Raw, Out>(
    kind: &str,
    query: &str,
    limit: u32,
    offset: u32,
    filters: &Filters<'_>,
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
    let path = if kind.is_empty() {
        format!("{API_V2}/search")
    } else {
        format!("{API_V2}/search/{kind}")
    };

    let resp: SearchResponse<Raw> = client
        .get(path)
        .query(&[
            ("q", query),
            ("client_id", cid.as_str()),
            ("limit", limit_s.as_str()),
            ("offset", offset_s.as_str()),
        ])
        .query(&filters.params())
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
    filters: &Filters<'_>,
) -> Result<SearchPage<Track>, ScApiError> {
    search::<RawTrack, Track>("tracks", query, limit, offset, filters).await
}

pub async fn search_users(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<User>, ScApiError> {
    search::<RawUser, User>("users", query, limit, offset, &Filters::default()).await
}

pub async fn search_playlists(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Playlist>, ScApiError> {
    search::<RawPlaylist, Playlist>("playlists", query, limit, offset, &Filters::default()).await
}

/// Albums only. A distinct endpoint from `/search/playlists`, which returns
/// user-made sets.
pub async fn search_albums(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Playlist>, ScApiError> {
    search::<RawPlaylist, Playlist>("albums", query, limit, offset, &Filters::default()).await
}

/// "Everything": tracks, users and playlists interleaved as SoundCloud ranks
/// them, which is what its own default tab shows.
pub async fn search_all(
    query: &str,
    limit: u32,
    offset: u32,
) -> Result<SearchPage<Mixed>, ScApiError> {
    search::<serde_json::Value, Mixed>("", query, limit, offset, &Filters::default()).await
}

/// One entry in an "Everything" result set.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Mixed {
    Track(Track),
    User(User),
    Playlist(Playlist),
    /// Something SoundCloud returned that this app has no view for.
    Unknown {},
}

impl From<serde_json::Value> for Mixed {
    fn from(value: serde_json::Value) -> Self {
        match value.get("kind").and_then(|k| k.as_str()) {
            Some("track") => serde_json::from_value::<RawTrack>(value)
                .map(|t| Mixed::Track(Track::from(t)))
                .unwrap_or(Mixed::Unknown {}),
            Some("user") => serde_json::from_value::<RawUser>(value)
                .map(|u| Mixed::User(User::from(u)))
                .unwrap_or(Mixed::Unknown {}),
            Some("playlist") => serde_json::from_value::<RawPlaylist>(value)
                .map(|p| Mixed::Playlist(Playlist::from(p)))
                .unwrap_or(Mixed::Unknown {}),
            _ => Mixed::Unknown {},
        }
    }
}

#[derive(Deserialize)]
struct RawSuggestion {
    #[serde(default)]
    output: String,
    #[serde(default)]
    query: String,
}

/// Autocomplete for the search box: `GET /search/queries` (verified live).
///
/// Returns the query strings SoundCloud would suggest, deduplicated and with
/// the blanks dropped.
pub async fn suggest(query: &str, limit: u32) -> Result<Vec<String>, ScApiError> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let cid = client_id::get(false).await?;
    let client = http_client()?;
    let limit_s = limit.clamp(1, 20).to_string();

    let resp: SearchResponse<RawSuggestion> = client
        .get(format!("{API_V2}/search/queries"))
        .query(&[
            ("q", query),
            ("client_id", cid.as_str()),
            ("limit", limit_s.as_str()),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let mut seen = std::collections::HashSet::new();
    Ok(resp
        .collection
        .into_iter()
        .map(|s| {
            if s.output.is_empty() {
                s.query
            } else {
                s.output
            }
        })
        .filter(|s| !s.trim().is_empty())
        .filter(|s| seen.insert(s.clone()))
        .collect())
}
