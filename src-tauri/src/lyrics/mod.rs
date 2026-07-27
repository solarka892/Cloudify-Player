//! Lyrics, from LRCLIB.
//!
//! SoundCloud has no lyrics of any kind, so this is the one place the app
//! talks to a service other than SoundCloud. LRCLIB (<https://lrclib.net>) is
//! free, needs no key, and serves both plain and LRC-synced lyrics.
//!
//! A miss is not an error: most SoundCloud uploads (remixes, DJ sets, edits)
//! simply have no lyrics, so "not found" returns `None` and the UI shows a
//! quiet empty state.

use serde::{Deserialize, Serialize};

use crate::sc_api::USER_AGENT;

const LRCLIB: &str = "https://lrclib.net/api";

#[derive(Debug, thiserror::Error)]
pub enum LyricsError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
}

impl serde::Serialize for LyricsError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Serialize)]
pub struct Lyrics {
    /// Raw LRC (`[mm:ss.xx] line`), when the track has a synced transcription.
    pub synced: Option<String>,
    pub plain: Option<String>,
    /// Which lookup produced this — useful when the match looks wrong.
    pub source: &'static str,
}

#[derive(Deserialize)]
struct LrcLibTrack {
    #[serde(default)]
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(default)]
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

/// SoundCloud titles are noisy — strip the decorations that stop a match.
///
/// `"Artist - Song (Official Video) [Free DL]"` → `"Song"`.
fn clean_title(title: &str) -> String {
    let mut out = title.to_string();
    // Drop bracketed suffixes: (Official Video), [Free Download], {prod. …}
    for (open, close) in [('(', ')'), ('[', ']'), ('{', '}')] {
        while let Some(start) = out.find(open) {
            match out[start..].find(close) {
                Some(offset) => {
                    out.replace_range(start..start + offset + 1, "");
                }
                None => break,
            }
        }
    }
    // "Artist - Title" → "Title" (SC uploaders repeat the artist constantly).
    if let Some((_, rest)) = out.split_once(" - ") {
        if rest.trim().len() > 2 {
            out = rest.to_string();
        }
    }
    out.trim().to_string()
}

/// Artist names on SC carry label suffixes that never match a lyrics database.
fn clean_artist(artist: &str) -> String {
    artist
        .split(&['|', '/'][..])
        .next()
        .unwrap_or(artist)
        .trim()
        .to_string()
}

/// Look up lyrics for a track. `duration_ms` narrows the match when present.
///
/// Tries the exact endpoint first (artist + title + duration), then falls back
/// to a fuzzy search, because SoundCloud metadata rarely matches a release
/// database exactly.
pub async fn get(
    artist: &str,
    title: &str,
    duration_ms: Option<u64>,
) -> Result<Option<Lyrics>, LyricsError> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;
    let artist = clean_artist(artist);
    let title = clean_title(title);
    if title.is_empty() {
        return Ok(None);
    }

    // 1. Exact match, including duration when we have it.
    let mut query: Vec<(&str, String)> = vec![
        ("artist_name", artist.clone()),
        ("track_name", title.clone()),
    ];
    if let Some(ms) = duration_ms {
        query.push(("duration", (ms / 1000).to_string()));
    }

    let resp = client
        .get(format!("{LRCLIB}/get"))
        .query(&query)
        .send()
        .await?;
    if resp.status().is_success() {
        let found: LrcLibTrack = resp.json().await?;
        if let Some(lyrics) = to_lyrics(found, "lrclib/get") {
            return Ok(Some(lyrics));
        }
    }

    // 2. Fuzzy search — takes the first hit, which LRCLIB ranks by relevance.
    let resp = client
        .get(format!("{LRCLIB}/search"))
        .query(&[("q", format!("{artist} {title}").trim())])
        .send()
        .await?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    let hits: Vec<LrcLibTrack> = resp.json().await?;
    Ok(hits
        .into_iter()
        .find_map(|hit| to_lyrics(hit, "lrclib/search")))
}

/// An entry with both fields empty is a miss, not a result.
fn to_lyrics(raw: LrcLibTrack, source: &'static str) -> Option<Lyrics> {
    let synced = raw.synced_lyrics.filter(|s| !s.trim().is_empty());
    let plain = raw.plain_lyrics.filter(|s| !s.trim().is_empty());
    if synced.is_none() && plain.is_none() {
        return None;
    }
    Some(Lyrics {
        synced,
        plain,
        source,
    })
}
