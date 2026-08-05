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
    /// Which lookup produced this, and what it matched — for when the words on
    /// screen are not the words being sung.
    pub source: String,
}

#[derive(Debug, Deserialize)]
struct LrcLibTrack {
    #[serde(default)]
    #[serde(rename = "artistName")]
    artist_name: Option<String>,
    #[serde(default)]
    #[serde(rename = "trackName")]
    track_name: Option<String>,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
    #[serde(default)]
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
}

/// SoundCloud titles are noisy — strip the decorations that stop a match.
///
/// `"Artist - Song (Official Video) [Free DL]"` → `"Artist - Song"`.
fn strip_brackets(title: &str) -> String {
    let mut out = title.to_string();
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
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Drop the filename extension a SoundCloud upload kept: `"get happy.mp3"`.
///
/// Applied after the bracket pass rather than before, because
/// `"get happy (lo-fi version).mp3"` leaves the extension dangling with a space
/// in front of it — and `"get happy .mp3"` matches exactly as little as
/// `"get happy.mp3"` does.
fn strip_extension(title: &str) -> String {
    const EXTENSIONS: [&str; 7] = [".mp3", ".wav", ".flac", ".m4a", ".aiff", ".aif", ".ogg"];
    let trimmed = title.trim_end();
    for ext in EXTENSIONS {
        let Some(at) = trimmed.len().checked_sub(ext.len()) else {
            continue;
        };
        // A title ending in a multi-byte character cannot end in an extension,
        // and splitting inside one would panic.
        if !trimmed.is_char_boundary(at) {
            continue;
        }
        let (head, tail) = trimmed.split_at(at);
        if tail.eq_ignore_ascii_case(ext) && !head.trim_end().is_empty() {
            return head.trim_end().to_string();
        }
    }
    trimmed.to_string()
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

/// `"Тимати feat. Света"` → `"Тимати"`, when there is a suffix to drop.
///
/// LRCLIB carries both spellings for a collaboration, and which one it has is
/// not knowable from here, so both get a turn.
fn strip_featuring(artist: &str) -> Option<String> {
    let lower = artist.to_lowercase();
    ["feat.", "feat ", "ft.", "ft ", "featuring", " with "]
        .iter()
        .filter_map(|marker| lower.find(marker))
        .min()
        .map(|at| artist[..at].trim().to_string())
        .filter(|head| !head.is_empty() && head.len() < artist.len())
}

/// One `(artist, title)` reading of a track's metadata, to look up as a pair.
#[derive(Debug, PartialEq, Eq)]
struct Candidate {
    artist: String,
    title: String,
}

/// The dash SoundCloud uploaders separate artist from title with, whichever
/// one they reached for.
const DASHES: [&str; 3] = [" - ", " – ", " — "];

/// Every reading of the metadata worth a request, most likely first.
///
/// The uploader is only sometimes the performer. SoundCloud's "artist" is
/// whoever posted the file, so a repost account puts `006_incognito` where
/// `Баста` belongs, and a lookup built on it cannot match anything — which is
/// what made lyrics look broken for every track that was not self-uploaded. The
/// performer is in the title in that case, in either order: `Artist - Song` and
/// `Song - Artist` are both common on SoundCloud, and nothing in the string says
/// which one this is, so both are tried.
fn candidates(sc_artist: &str, sc_title: &str) -> Vec<Candidate> {
    let uploader = clean_artist(sc_artist);
    let title = strip_extension(&strip_brackets(sc_title));
    let split = DASHES
        .iter()
        .filter_map(|dash| title.find(dash).map(|at| (at, dash.len())))
        .min_by_key(|(at, _)| *at)
        .map(|(at, len)| (title[..at].trim(), title[at + len..].trim()));

    let mut out: Vec<Candidate> = Vec::new();
    let mut push = |artist: &str, title: &str| {
        let candidate = Candidate {
            artist: artist.trim().to_string(),
            title: title.trim().to_string(),
        };
        if candidate.title.is_empty() || out.contains(&candidate) {
            return;
        }
        out.push(candidate);
    };

    match split {
        Some((left, right)) => {
            // The uploader is the performer often enough to ask first, and its
            // half of the title is the better title either way.
            if !uploader.is_empty() {
                push(&uploader, right);
            }
            push(left, right);
            push(right, left);
            if let Some(bare) = strip_featuring(left) {
                push(&bare, right);
            }
            if let Some(bare) = strip_featuring(right) {
                push(&bare, left);
            }
        }
        None => {
            if !uploader.is_empty() {
                push(&uploader, &title);
                if let Some(bare) = strip_featuring(&uploader) {
                    push(&bare, &title);
                }
            }
        }
    }

    out
}

/// Casefolded, punctuation-free form, for comparing two titles that came from
/// different databases.
fn normalise(s: &str) -> String {
    let mut out = String::new();
    let mut pending_space = false;
    for ch in s.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            if pending_space && !out.is_empty() {
                out.push(' ');
            }
            pending_space = false;
            out.push(ch);
        } else {
            pending_space = true;
        }
    }
    out
}

/// Whether a search hit is really the track that was asked for.
///
/// LRCLIB's search is fuzzy, and a loose hit means the wrong words on screen —
/// worse than the empty state, because it is not obviously wrong until you read
/// it. Containment rather than equality because the two sides disagree about
/// remix and version suffixes constantly.
fn plausible(hit: &LrcLibTrack, wanted: &Candidate) -> bool {
    let Some(found) = hit.track_name.as_deref().map(normalise) else {
        return false;
    };
    let wanted = normalise(&wanted.title);
    if wanted.is_empty() || found.is_empty() {
        return false;
    }
    found.contains(&wanted) || wanted.contains(&found)
}

/// How many candidates get a fuzzy search after the exact lookups have all
/// missed. Most SoundCloud uploads have no lyrics anywhere, so the miss is the
/// common path and every extra reading of the metadata costs it a request.
const SEARCH_CANDIDATES: usize = 3;

/// Look up lyrics for a track. `duration_ms` picks between hits when present.
///
/// Tries the exact endpoint for each reading of the metadata (see
/// [`candidates`]), then a fuzzy, artist-scoped search for the first few. A
/// search on the title alone is deliberately not attempted: `Босанова` finds
/// Юрий Визбор's unrelated song of that name, and wrong lyrics are worse than
/// none.
pub async fn get(
    artist: &str,
    title: &str,
    duration_ms: Option<u64>,
) -> Result<Option<Lyrics>, LyricsError> {
    let client = reqwest::Client::builder().user_agent(USER_AGENT).build()?;
    let candidates = candidates(artist, title);

    // 1. The exact endpoint, and deliberately without a duration: it matches
    //    within two seconds, and a SoundCloud upload is routinely further off
    //    than that — a tacked-on intro, a "skip to 1:10" edit — so sending one
    //    loses matches that the artist and title alone would have found.
    for candidate in &candidates {
        let resp = client
            .get(format!("{LRCLIB}/get"))
            .query(&[
                ("artist_name", &candidate.artist),
                ("track_name", &candidate.title),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            continue;
        }
        if let Some(lyrics) = to_lyrics(resp.json().await?, "lrclib/get") {
            return Ok(Some(lyrics));
        }
    }

    // 2. Fuzzy, but still scoped to a candidate's artist, and checked against
    //    the title before it is believed.
    for candidate in candidates.iter().take(SEARCH_CANDIDATES) {
        let resp = client
            .get(format!("{LRCLIB}/search"))
            .query(&[
                ("artist_name", &candidate.artist),
                ("track_name", &candidate.title),
            ])
            .send()
            .await?;
        if !resp.status().is_success() {
            continue;
        }
        let hits: Vec<LrcLibTrack> = resp.json().await?;
        if let Some(hit) = best_hit(hits, candidate, duration_ms) {
            if let Some(lyrics) = to_lyrics(hit, "lrclib/search") {
                return Ok(Some(lyrics));
            }
        }
    }

    Ok(None)
}

/// The plausible hit closest to the known duration, or the first if the length
/// is unknown — LRCLIB already ranks by relevance.
fn best_hit(
    hits: Vec<LrcLibTrack>,
    wanted: &Candidate,
    duration_ms: Option<u64>,
) -> Option<LrcLibTrack> {
    let mut plausible_hits = hits
        .into_iter()
        .filter(|hit| plausible(hit, wanted))
        .peekable();
    let Some(seconds) = duration_ms.map(|ms| ms as f64 / 1000.0) else {
        return plausible_hits.next();
    };
    plausible_hits.min_by(|a, b| {
        let distance = |hit: &LrcLibTrack| {
            hit.duration
                .map(|d| (d - seconds).abs())
                // A hit that does not say how long it is sorts last, but still
                // beats no lyrics at all.
                .unwrap_or(f64::MAX)
        };
        distance(a).total_cmp(&distance(b))
    })
}

/// An entry with both fields empty is a miss, not a result.
fn to_lyrics(raw: LrcLibTrack, endpoint: &str) -> Option<Lyrics> {
    let synced = raw.synced_lyrics.filter(|s| !s.trim().is_empty());
    let plain = raw.plain_lyrics.filter(|s| !s.trim().is_empty());
    if synced.is_none() && plain.is_none() {
        return None;
    }
    let matched = format!(
        "{} — {}",
        raw.artist_name.as_deref().unwrap_or("?"),
        raw.track_name.as_deref().unwrap_or("?"),
    );
    Some(Lyrics {
        synced,
        plain,
        source: format!("{endpoint}: {matched}"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_performer_out_of_the_title() {
        // The uploader is a repost account; Тимати is in the title.
        let got = candidates("Husein Hasanov", "Тимати feat. Света - Дорога в аэропорт");
        assert!(got.contains(&Candidate {
            artist: "Тимати feat. Света".into(),
            title: "Дорога в аэропорт".into(),
        }));
        // And without the featured half, which is how LRCLIB may carry it.
        assert!(got.contains(&Candidate {
            artist: "Тимати".into(),
            title: "Дорога в аэропорт".into(),
        }));
    }

    #[test]
    fn tries_both_sides_of_the_dash() {
        // "Song - Artist" is as common on SoundCloud as "Artist - Song", and
        // the string does not say which this is.
        let got = candidates("006_incognito", "Не звони - Тимати (skip to 1:10)");
        assert!(got.contains(&Candidate {
            artist: "Тимати".into(),
            title: "Не звони".into(),
        }));
        assert!(got.contains(&Candidate {
            artist: "Не звони".into(),
            title: "Тимати".into(),
        }));
    }

    #[test]
    fn falls_back_to_the_uploader_without_a_dash() {
        assert_eq!(
            candidates("Krueger | Berlin", "Nachtmusik"),
            vec![Candidate {
                artist: "Krueger".into(),
                title: "Nachtmusik".into(),
            }],
        );
    }

    #[test]
    fn drops_a_kept_filename_extension() {
        // Straight off a phone: the upload is still named like the file.
        assert!(
            candidates("so1arka", "Alex G - get happy (lo-fi version).mp3").contains(&Candidate {
                artist: "Alex G".into(),
                title: "get happy".into(),
            })
        );
        // Not an extension, and not to be cut: the title is the whole of it.
        assert_eq!(strip_extension("Симфония №3"), "Симфония №3");
        assert_eq!(strip_extension(".mp3"), ".mp3");
    }

    #[test]
    fn a_title_that_is_only_decoration_yields_nothing() {
        assert!(candidates("someone", "(Free Download)").is_empty());
    }

    /// The whole point of the candidate list, against the real database.
    ///
    /// `cargo test -- --ignored` — the same command that checks whether
    /// SoundCloud has moved. A repost account's upload has to find its lyrics
    /// anyway, and a song that genuinely has none must not borrow another's.
    #[tokio::test]
    #[ignore = "hits the live LRCLIB API"]
    async fn finds_lyrics_for_a_reposted_upload() {
        let found = get(
            "Husein Hasanov",
            "Тимати feat. Света - Дорога в аэропорт",
            Some(232_000),
        )
        .await
        .expect("request")
        .expect("lyrics for a track LRCLIB carries");
        assert!(found.synced.is_some(), "expected an LRC transcription");

        // Different song, same name: Юрий Визбор's "Босанова" is in LRCLIB and
        // Баста's is not, so the only right answer here is nothing.
        let miss = get("006_incognito", "Баста - Босанова", None)
            .await
            .expect("request");
        assert!(
            miss.is_none(),
            "matched something it should not have: {:?}",
            miss.map(|l| l.source),
        );
    }

    #[test]
    fn plausible_ignores_version_suffixes_but_not_other_songs() {
        let hit = |name: &str| LrcLibTrack {
            artist_name: None,
            track_name: Some(name.into()),
            duration: None,
            synced_lyrics: None,
            plain_lyrics: None,
        };
        let wanted = Candidate {
            artist: "Тимати".into(),
            title: "Не звони".into(),
        };
        assert!(plausible(&hit("Не звони (Remix)"), &wanted));
        assert!(plausible(&hit("не звони!"), &wanted));
        assert!(!plausible(&hit("Баклажан"), &wanted));
    }
}
