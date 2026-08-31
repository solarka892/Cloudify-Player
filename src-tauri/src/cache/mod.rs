//! Everything the app knows without SoundCloud.
//!
//! One SQLite file, `{app_data}/library.db` — the same one the offline
//! downloads live in, because there is no reason for a second — holding a mirror
//! of the library plus the things the app learns on its own: marks, listening
//! history, what is saved for later, what was measured, what disappeared.
//!
//! ## Why a mirror exists at all
//!
//! Four features are impossible without one. Offline search cannot search a list
//! that only exists in a store that is thrown away when the window closes;
//! duplicate detection needs to compare every track with every other one;
//! tombstones are *by definition* about tracks the API has stopped returning;
//! and the diary has to be able to name a track it can no longer fetch. So the
//! library is written down as it is fetched, and everything here reads from that
//! rather than from the network.
//!
//! ## Rules
//!
//! - Nothing in this module ever talks to SoundCloud. It is handed rows by
//!   `commands.rs` and hands rows back. The one thing it stores that came from
//!   the API is metadata the user already has on screen.
//! - Nothing here leaves the machine, ever. There is no sync, no telemetry and
//!   no export except the one the user asks for by name.
//! - Signed CDN stream URLs are short-lived and are **not** cached (see
//!   docs/sc-api.md). Waveforms are: they are static, and they are what the
//!   thread is drawn from.
//!
//! ## Identity
//!
//! Rows are keyed by URN — `soundcloud:tracks:123` — rather than by the bare
//! numeric id the rest of the app passes around. It costs one `format!` at the
//! boundary and buys the ability to mark a playlist or a comment later without a
//! migration, which is the same reason SoundCloud's own API moved to them.

pub mod fold;

use std::path::PathBuf;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::sc_api::models::Track;

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("local store error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("could not resolve the app data directory")]
    NoAppDir,
}

impl Serialize for CacheError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// Shadows `std::result::Result` for the rest of the module: every function
/// here fails the same way, and saying so once is cheaper than saying it fifty
/// times.
type Result<T> = std::result::Result<T, CacheError>;

/// The canonical id of a track in this store.
pub fn urn(track_id: u64) -> String {
    format!("soundcloud:tracks:{track_id}")
}

/// The numeric id back out of a URN, for handing to the API layer.
fn urn_id(urn: &str) -> Option<u64> {
    urn.rsplit(':').next()?.parse().ok()
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

fn db_path(app: &AppHandle) -> Result<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| CacheError::NoAppDir)?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("library.db"))
}

/// Open the store, creating anything missing.
///
/// Opened per call rather than held in app state: SQLite opens a file in
/// microseconds, every one of these calls arrives from the UI thread of a
/// different window, and a shared `Connection` behind a mutex is a lock the
/// whole interface can queue behind. The schema statements are all
/// `IF NOT EXISTS`, so this is also the migration.
pub fn open(app: &AppHandle) -> Result<Connection> {
    let conn = Connection::open(db_path(app)?)?;
    // Survives a hard kill without a torn database, and lets a read run while a
    // write is in flight — which is the actual access pattern here: the library
    // is written in one batch while the user is typing in the search box.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}

/// The whole schema, idempotent.
///
/// `tracks_fts` is an ordinary (not external-content) FTS5 table: the rows are
/// small, there are thousands of them rather than millions, and keeping the
/// searchable copy independent means a title that is later tombstoned is still
/// findable — which is the point of tombstones.
const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS tracks (
    urn           TEXT PRIMARY KEY,
    track_id      INTEGER NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    artwork_url   TEXT,
    permalink_url TEXT,
    -- When this track entered *our* library, which is not when it was uploaded.
    added_at      INTEGER NOT NULL,
    -- The last time the API returned it.
    seen_at       INTEGER NOT NULL,
    -- Consecutive failed sightings, and when the last one was counted.
    misses        INTEGER NOT NULL DEFAULT 0,
    missed_at     INTEGER,
    -- Set once it has been missing often enough to believe. Never deletes a row.
    gone_at       INTEGER,
    -- Hidden by the duplicate finder. Reversible, and local: nothing on
    -- SoundCloud is ever touched.
    hidden_at     INTEGER
);
CREATE INDEX IF NOT EXISTS tracks_added ON tracks(added_at);

CREATE VIRTUAL TABLE IF NOT EXISTS tracks_fts USING fts5(
    urn UNINDEXED,
    title,
    artist,
    -- Both of the above, folded — see `cache::fold`. This is the column that
    -- makes `vyazki` find «Вязки».
    folded,
    tokenize = "unicode61 remove_diacritics 2"
);

CREATE TABLE IF NOT EXISTS history (
    id          INTEGER PRIMARY KEY,
    track_urn   TEXT NOT NULL,
    title       TEXT NOT NULL,
    artist      TEXT,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    -- Where it stopped, which is the difference between "skipped" and "played".
    position_ms INTEGER NOT NULL DEFAULT 0,
    -- 'playing' | 'played' | 'skipped' | 'liked' | 'marked'.
    --
    -- Recorded rather than inferred because a later feature needs it: a personal
    -- stream has to be trained on what *happened*, and "played at 03:00" without
    -- "skipped after nine seconds" is not a signal, it is a log.
    outcome     TEXT NOT NULL DEFAULT 'playing'
);
CREATE INDEX IF NOT EXISTS history_started ON history(started_at);

CREATE TABLE IF NOT EXISTS loudness (
    track_urn   TEXT PRIMARY KEY,
    -- Mean level of what was actually played, in dBFS. Not true LUFS: see
    -- `audio/loudness.ts` for what is measured and why that is honest.
    level_db    REAL NOT NULL,
    measured_at INTEGER NOT NULL
);

-- Links the user said no to. Only a hash is kept: the point of the trap is that
-- clipboard contents are not written down, and "do not ask me about this one
-- again" does not need the link itself to work.
CREATE TABLE IF NOT EXISTS declined_links (
    hash       INTEGER PRIMARY KEY,
    declined_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings_kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

// ------------------------------------------------------------------ library --

/// A track as this store keeps it: the projection the UI knows, plus what
/// happened to it locally.
#[derive(Debug, Serialize, Deserialize)]
pub struct StoredTrack {
    #[serde(flatten)]
    pub track: Track,
    pub urn: String,
    pub added_at: i64,
    /// Unix seconds since which the upload has been missing, if it has.
    pub gone_at: Option<i64>,
    pub hidden_at: Option<i64>,
}

fn row_to_stored(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredTrack> {
    Ok(StoredTrack {
        track: Track {
            id: row.get::<_, i64>("track_id")? as u64,
            title: row.get("title")?,
            duration: row.get::<_, i64>("duration_ms")? as u64,
            artwork_url: row.get("artwork_url")?,
            permalink_url: row.get("permalink_url")?,
            artist: row.get("artist")?,
        },
        urn: row.get("urn")?,
        added_at: row.get("added_at")?,
        gone_at: row.get("gone_at")?,
        hidden_at: row.get("hidden_at")?,
    })
}

/// Write what the API just returned into the mirror.
///
/// Called after any list of the user's own tracks is fetched. Returns how many
/// rows were new, which is only used to say something honest in the interface.
pub fn sync_tracks(app: &AppHandle, tracks: &[Track]) -> Result<usize> {
    let mut conn = open(app)?;
    let tx = conn.transaction()?;
    let at = now();
    let mut added = 0usize;

    for track in tracks {
        let urn = urn(track.id);
        let folded = fold::fold(&format!(
            "{} {}",
            track.title,
            track.artist.as_deref().unwrap_or_default()
        ));

        let existed: bool = tx
            .query_row("SELECT 1 FROM tracks WHERE urn = ?1", [&urn], |_| Ok(true))
            .optional()?
            .unwrap_or(false);
        if !existed {
            added += 1;
        }

        tx.execute(
            "INSERT INTO tracks
                 (urn, track_id, title, artist, duration_ms, artwork_url,
                  permalink_url, added_at, seen_at, misses, missed_at, gone_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 0, NULL, NULL)
             ON CONFLICT(urn) DO UPDATE SET
                 title         = excluded.title,
                 artist        = excluded.artist,
                 duration_ms   = excluded.duration_ms,
                 artwork_url   = excluded.artwork_url,
                 permalink_url = excluded.permalink_url,
                 seen_at       = excluded.seen_at,
                 misses        = 0,
                 missed_at     = NULL,
                 -- Answering for itself is what un-tombstones a track: the row
                 -- was never deleted, so a re-upload under the same id simply
                 -- stops being gone. Absence cannot do this — a sync only ever
                 -- carries what the API *did* return.
                 gone_at       = NULL",
            params![
                &urn,
                track.id as i64,
                &track.title,
                &track.artist,
                track.duration as i64,
                &track.artwork_url,
                &track.permalink_url,
                at,
            ],
        )?;

        tx.execute("DELETE FROM tracks_fts WHERE urn = ?1", [&urn])?;
        tx.execute(
            "INSERT INTO tracks_fts (urn, title, artist, folded)
             VALUES (?1, ?2, ?3, ?4)",
            params![&urn, &track.title, &track.artist, &folded],
        )?;
    }

    tx.commit()?;
    Ok(added)
}

/// One track out of the mirror, by id. The snapshot a tombstone is made of.
pub fn stored_track(app: &AppHandle, track_id: u64) -> Result<Option<StoredTrack>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT * FROM tracks WHERE urn = ?1")?;
    Ok(stmt.query_row([urn(track_id)], row_to_stored).optional()?)
}

// ------------------------------------------------------------------- search --

#[derive(Debug, Serialize)]
pub struct SearchHit {
    #[serde(flatten)]
    pub track: StoredTrack,
    /// Which mark matched, when the hit came from a mark's note rather than a
    /// title. The interface says so rather than showing an unexplained result.
    pub note: Option<String>,
    pub note_position_ms: Option<i64>,
}

/// Turn a typed query into an FTS5 MATCH expression.
///
/// Every token becomes a prefix term, so results narrow while typing rather than
/// appearing only on the last keystroke. Tokens are folded first, which is what
/// makes the script the query was typed in irrelevant, and quoted, which is what
/// keeps FTS5's own operators (`OR`, `NEAR`, `-`, `*`) from being read out of
/// somebody's track title.
fn match_expr(query: &str) -> Option<String> {
    let folded = fold::fold(query);
    let terms: Vec<String> = folded
        .split_whitespace()
        .map(|term| format!("\"{term}\"*"))
        .collect();
    if terms.is_empty() {
        return None;
    }
    Some(terms.join(" "))
}

/// Search the mirror. No network, no waiting.
pub fn search(app: &AppHandle, query: &str, limit: u32) -> Result<Vec<SearchHit>> {
    let Some(expr) = match_expr(query) else {
        return Ok(Vec::new());
    };
    let conn = open(app)?;

    let mut hits = Vec::new();
    let mut seen: Vec<String> = Vec::new();

    {
        let mut stmt = conn.prepare(
            "SELECT t.* FROM tracks_fts f
               JOIN tracks t ON t.urn = f.urn
              WHERE tracks_fts MATCH ?1 AND t.hidden_at IS NULL
              ORDER BY rank
              LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![&expr, limit], row_to_stored)?;
        for track in rows {
            let track = track?;
            seen.push(track.urn.clone());
            hits.push(SearchHit {
                track,
                note: None,
                note_position_ms: None,
            });
        }
    }

    // Marks are searched too, and by the same query: a note is often the only
    // place a word like "that sample" exists. Notes are short and there are few
    // of them, so this is a LIKE over the folded note rather than a second FTS
    // table to keep in step.
    {
        let needle = fold::fold(query);
        let mut stmt = conn.prepare(
            "SELECT t.*, m.note AS mark_note, m.position_ms AS mark_pos
               FROM marks m JOIN tracks t ON t.urn = m.track_urn
              WHERE m.note IS NOT NULL AND m.note != ''
              ORDER BY m.created_at DESC
              LIMIT 400",
        )?;
        let rows = stmt.query_map([], |row| {
            let note: Option<String> = row.get("mark_note")?;
            let pos: i64 = row.get("mark_pos")?;
            Ok((row_to_stored(row)?, note, pos))
        })?;
        for row in rows {
            let (track, note, pos) = row?;
            let matches = note
                .as_deref()
                .is_some_and(|n| fold::fold(n).contains(&needle));
            if !matches || seen.contains(&track.urn) {
                continue;
            }
            seen.push(track.urn.clone());
            hits.push(SearchHit {
                track,
                note,
                note_position_ms: Some(pos),
            });
            if hits.len() as u32 >= limit {
                break;
            }
        }
    }

    Ok(hits)
}

// -------------------------------------------------------------------- marks --

// -------------------------------------------------------------------- later --

// -------------------------------------------------------------------- diary --

#[derive(Debug, Serialize)]
pub struct DiaryEntry {
    pub id: i64,
    pub track_urn: String,
    pub track_id: u64,
    pub title: String,
    pub artist: Option<String>,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub position_ms: i64,
    pub outcome: String,
}

/// Open an entry when a track starts. Returns its id, which the player keeps
/// until it can say how the listen ended.
pub fn diary_start(app: &AppHandle, track: &Track) -> Result<i64> {
    let conn = open(app)?;
    conn.execute(
        "INSERT INTO history (track_urn, title, artist, started_at, outcome)
         VALUES (?1, ?2, ?3, ?4, 'playing')",
        params![urn(track.id), &track.title, &track.artist, now()],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Close an entry with what actually happened.
pub fn diary_finish(app: &AppHandle, id: i64, outcome: &str, position_ms: i64) -> Result<()> {
    open(app)?.execute(
        "UPDATE history SET ended_at = ?2, outcome = ?3, position_ms = ?4 WHERE id = ?1",
        params![id, now(), outcome, position_ms],
    )?;
    Ok(())
}

pub fn diary_list(app: &AppHandle, limit: u32) -> Result<Vec<DiaryEntry>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT * FROM history ORDER BY started_at DESC LIMIT ?1")?;
    let rows = stmt.query_map([limit], |row| {
        let track_urn: String = row.get("track_urn")?;
        Ok(DiaryEntry {
            id: row.get("id")?,
            track_id: urn_id(&track_urn).unwrap_or_default(),
            track_urn,
            title: row.get("title")?,
            artist: row.get("artist")?,
            started_at: row.get("started_at")?,
            ended_at: row.get("ended_at")?,
            position_ms: row.get("position_ms")?,
            outcome: row.get("outcome")?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Drop everything older than the retention the user chose. `0` keeps forever.
pub fn diary_prune(app: &AppHandle, keep_days: i64) -> Result<usize> {
    if keep_days <= 0 {
        return Ok(0);
    }
    let cutoff = now() - keep_days * 86_400;
    Ok(open(app)?.execute("DELETE FROM history WHERE started_at < ?1", [cutoff])?)
}

pub fn diary_clear(app: &AppHandle) -> Result<()> {
    open(app)?.execute("DELETE FROM history", [])?;
    Ok(())
}

// ----------------------------------------------------------------- loudness --

pub fn loudness_get(app: &AppHandle, track_id: u64) -> Result<Option<f64>> {
    let conn = open(app)?;
    Ok(conn
        .query_row(
            "SELECT level_db FROM loudness WHERE track_urn = ?1",
            [urn(track_id)],
            |row| row.get(0),
        )
        .optional()?)
}

pub fn loudness_set(app: &AppHandle, track_id: u64, level_db: f64) -> Result<()> {
    open(app)?.execute(
        "INSERT INTO loudness (track_urn, level_db, measured_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(track_urn) DO UPDATE SET
             level_db = excluded.level_db, measured_at = excluded.measured_at",
        params![urn(track_id), level_db, now()],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- waveforms --

// ----------------------------------------------------------- declined links --

/// A stable hash of a URL. FNV-1a: tiny, and this is not a security boundary —
/// it exists so the trap can remember "no" without remembering the link.
fn hash_url(url: &str) -> i64 {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in url.trim().to_lowercase().bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash as i64
}

pub fn link_declined(app: &AppHandle, url: &str) -> Result<bool> {
    let conn = open(app)?;
    Ok(conn
        .query_row(
            "SELECT 1 FROM declined_links WHERE hash = ?1",
            [hash_url(url)],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false))
}

pub fn decline_link(app: &AppHandle, url: &str) -> Result<()> {
    open(app)?.execute(
        "INSERT OR REPLACE INTO declined_links (hash, declined_at) VALUES (?1, ?2)",
        params![hash_url(url), now()],
    )?;
    Ok(())
}

// ------------------------------------------------------------------- kv ------

/// The one place a scrap of state that is neither a setting nor a row belongs:
/// the resume point, and nothing else so far.
pub fn kv_get(app: &AppHandle, key: &str) -> Result<Option<String>> {
    let conn = open(app)?;
    Ok(conn
        .query_row("SELECT value FROM settings_kv WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

pub fn kv_set(app: &AppHandle, key: &str, value: &str) -> Result<()> {
    open(app)?.execute(
        "INSERT OR REPLACE INTO settings_kv (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

// --------------------------------------------------------------- duplicates --

// ------------------------------------------------------------------ storage --

/// One line of the "what is kept locally" screen.
#[derive(Debug, Serialize)]
pub struct StorageLine {
    /// Matches a key in the `storage` dictionary; the interface does the words.
    pub id: String,
    pub rows: i64,
}

#[derive(Debug, Serialize)]
pub struct StorageReport {
    pub lines: Vec<StorageLine>,
    /// The database file on disk, in bytes. Reported whole rather than
    /// apportioned per table: SQLite does not give a per-table figure without a
    /// compile-time option we do not build with, and inventing one would be
    /// worse than saying nothing.
    pub bytes: u64,
    pub path: String,
}

pub fn storage_report(app: &AppHandle) -> Result<StorageReport> {
    let conn = open(app)?;
    let mut lines = Vec::new();
    for (id, table) in [
        ("marks", "marks"),
        ("history", "history"),
        ("later", "later"),
        ("tombstones", "tracks WHERE gone_at IS NOT NULL"),
        ("loudness", "loudness"),
        ("waveforms", "waveforms"),
        ("tracks", "tracks"),
    ] {
        let rows: i64 =
            conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))?;
        lines.push(StorageLine {
            id: id.to_string(),
            rows,
        });
    }

    let path = db_path(app)?;
    let bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
    Ok(StorageReport {
        lines,
        bytes,
        path: path.to_string_lossy().into_owned(),
    })
}

/// Erase one of the lines above, or everything.
///
/// Takes the same ids the report hands out, so the button and the row it sits on
/// cannot drift apart.
pub fn storage_erase(app: &AppHandle, id: &str) -> Result<()> {
    let conn = open(app)?;
    match id {
        "marks" => {
            conn.execute("DELETE FROM marks", [])?;
        }
        "history" => {
            conn.execute("DELETE FROM history", [])?;
        }
        "later" => {
            conn.execute("DELETE FROM later", [])?;
        }
        "tombstones" => {
            // The rows stay; what goes is the claim that they are gone. Deleting
            // them would silently re-add every dead track to the library on the
            // next sync, which is not what "erase the tombstones" means.
            conn.execute(
                "UPDATE tracks SET gone_at = NULL, misses = 0, missed_at = NULL",
                [],
            )?;
        }
        "loudness" => {
            conn.execute("DELETE FROM loudness", [])?;
        }
        "waveforms" => {
            conn.execute("DELETE FROM waveforms", [])?;
        }
        "tracks" => {
            conn.execute("DELETE FROM tracks", [])?;
            conn.execute("DELETE FROM tracks_fts", [])?;
        }
        "all" => {
            conn.execute_batch(
                "DELETE FROM marks;
                 DELETE FROM history;
                 DELETE FROM later;
                 DELETE FROM loudness;
                 DELETE FROM waveforms;
                 DELETE FROM declined_links;
                 DELETE FROM tracks;
                 DELETE FROM tracks_fts;",
            )?;
        }
        _ => return Ok(()),
    }
    // Give the space back rather than leaving a file that only ever grows; the
    // screen this is reached from reports that number.
    conn.execute_batch("VACUUM")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{hash_url, urn, urn_id};

    #[test]
    fn urns_round_trip() {
        assert_eq!(urn_id(&urn(12345)), Some(12345));
        assert_eq!(urn_id("nonsense"), None);
    }

    #[test]
    fn declined_links_hash_stably_and_case_insensitively() {
        assert_eq!(
            hash_url("https://soundcloud.com/a/b"),
            hash_url("  HTTPS://SoundCloud.com/a/b "),
        );
        assert_ne!(
            hash_url("https://soundcloud.com/a/b"),
            hash_url("https://soundcloud.com/a/c"),
        );
    }
}
