//! `linked_partitioning` paging, shared by every collection endpoint.
//!
//! SoundCloud returns `{ collection: [...], next_href }`; `next_href` is a full
//! URL carrying the cursor. Likes, playlists and followings all walk it the
//! same way, so the loop lives here once.

use serde::{de::DeserializeOwned, Deserialize};

use super::ScApiError;

/// Per-request page size (api-v2 caps this around 200).
const PAGE_SIZE: &str = "200";

#[derive(Deserialize)]
struct Page<T> {
    #[serde(default = "Vec::new")]
    collection: Vec<T>,
    /// Full URL of the next page (with cursor), or absent on the last page.
    #[serde(default)]
    next_href: Option<String>,
}

/// Fetch `first_url` and follow `next_href` until the collection is exhausted
/// or `max` items have been collected (a safety bound on huge accounts).
///
/// `token` is sent as `Authorization: OAuth …` when present, so private items
/// show up for the logged-in user; public data works without it.
pub(crate) async fn collect_all<T: DeserializeOwned>(
    client: &reqwest::Client,
    first_url: String,
    token: Option<&str>,
    client_id: &str,
    max: usize,
) -> Result<Vec<T>, ScApiError> {
    let mut items: Vec<T> = Vec::new();
    let mut next: Option<String> = None;

    loop {
        let mut req = client.get(next.clone().unwrap_or_else(|| first_url.clone()));
        if let Some(token) = token {
            req = req.header("Authorization", format!("OAuth {token}"));
        }
        match &next {
            // The first request needs the query params; `next_href` already
            // carries them, bar the occasional missing client_id.
            None => {
                req = req.query(&[
                    ("client_id", client_id),
                    ("limit", PAGE_SIZE),
                    ("linked_partitioning", "1"),
                ]);
            }
            Some(url) if !url.contains("client_id=") => {
                req = req.query(&[("client_id", client_id)]);
            }
            Some(_) => {}
        }

        let page: Page<T> = req.send().await?.error_for_status()?.json().await?;
        items.extend(page.collection);

        match page.next_href {
            Some(url) if items.len() < max => next = Some(url),
            _ => break,
        }
    }

    items.truncate(max);
    Ok(items)
}
