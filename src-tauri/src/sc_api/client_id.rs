//! `client_id` auto-extraction (MVP #3).
//!
//! SoundCloud has no public API keys; we lift the `client_id` the web app
//! itself uses out of its JS bundles. Approach proven in `recon/sc_recon.py`.
//!
//! Flow (see docs/sc-api.md):
//!   1. GET https://soundcloud.com/ with a browser User-Agent.
//!   2. Extract `<script src="...js">` bundle URLs.
//!   3. Fetch bundles (last-first) and regex the `client_id`.
//!   4. Cache the value in memory; re-extract when older than 24h or forced.
//!
//! The value is secret-ish and rotates: NEVER log it, commit it, or write it to
//! a plain file (CLAUDE.md rules).

use std::sync::Mutex;
use std::time::{Duration, Instant};

use regex::Regex;

use super::{ScApiError, USER_AGENT};

const HOMEPAGE: &str = "https://soundcloud.com/";
const CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

struct Cached {
    value: String,
    fetched_at: Instant,
}

static CACHE: Mutex<Option<Cached>> = Mutex::new(None);

/// Returns a valid `client_id`, using the in-memory cache when it is fresh
/// (< 24h). Pass `force = true` to bypass the cache (e.g. after a 401/403).
pub async fn get(force: bool) -> Result<String, ScApiError> {
    if !force {
        // Scope the guard so it is dropped before the `.await` below.
        let cached = {
            let guard = CACHE.lock().expect("client_id cache poisoned");
            guard
                .as_ref()
                .filter(|c| c.fetched_at.elapsed() < CACHE_TTL)
                .map(|c| c.value.clone())
        };
        if let Some(value) = cached {
            return Ok(value);
        }
    }

    let value = fetch().await?;
    *CACHE.lock().expect("client_id cache poisoned") = Some(Cached {
        value: value.clone(),
        fetched_at: Instant::now(),
    });
    Ok(value)
}

/// Performs the full extraction from scratch (no caching).
pub async fn fetch() -> Result<String, ScApiError> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()?;

    let html = client.get(HOMEPAGE).send().await?.text().await?;
    let bundles = bundle_urls(&html)?;
    if bundles.is_empty() {
        return Err(ScApiError::NoBundles);
    }

    let client_id_re = Regex::new(r#"client_id\s*[:=]\s*"([A-Za-z0-9]{20,})""#)?;

    // The client_id usually lives in the last chunk, so scan last-first.
    for url in bundles.iter().rev() {
        let body = match client.get(url.as_str()).send().await {
            Ok(resp) => resp.text().await.unwrap_or_default(),
            // A single bundle failing to download is not fatal — keep trying.
            Err(_) => continue,
        };
        if let Some(caps) = client_id_re.captures(&body) {
            return Ok(caps[1].to_string());
        }
    }

    Err(ScApiError::ClientIdNotFound)
}

/// Extracts absolute `.js` bundle URLs from homepage HTML, order preserved,
/// deduplicated.
fn bundle_urls(html: &str) -> Result<Vec<String>, ScApiError> {
    let re = Regex::new(r#"<script[^>]+src="([^"]+)""#)?;
    let mut seen = std::collections::HashSet::new();
    let mut urls = Vec::new();
    for caps in re.captures_iter(html) {
        let src = &caps[1];
        if src.starts_with("http") && src.ends_with(".js") && seen.insert(src.to_string()) {
            urls.push(src.to_string());
        }
    }
    Ok(urls)
}
