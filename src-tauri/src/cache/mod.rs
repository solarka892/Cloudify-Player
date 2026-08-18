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

use std::collections::HashMap;
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

CREATE TABLE IF NOT EXISTS marks (
    id          INTEGER PRIMARY KEY,
    track_urn   TEXT NOT NULL,
    position_ms INTEGER NOT NULL,
    note        TEXT,
    created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS marks_track ON marks(track_urn);

CREATE TABLE IF NOT EXISTS later (
    track_urn  TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    artist     TEXT,
    added_at   INTEGER NOT NULL,
    -- 'manual' | 'trap' | 'search'. Where it came from is half of why it is here.
    source     TEXT NOT NULL,
    -- A soft date: the app asks, it does not delete.
    expires_at INTEGER
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

CREATE TABLE IF NOT EXISTS waveforms (
    track_urn TEXT PRIMARY KEY,
    -- The sample array as JSON, exactly as SoundCloud's CDN sent it.
    samples   TEXT NOT NULL,
    height    INTEGER NOT NULL,
    fetched_at INTEGER NOT NULL
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

/// How many consecutive misses it takes before a track is called gone.
const MISSES_BEFORE_GONE: i64 = 3;

/// How far apart two misses must be to count as two.
///
/// Without this, one refresh that fails three requests in a row would bury three
/// tracks. A tombstone is a claim about the world rather than about the network,
/// so it takes three separate occasions — five minutes apart is enough to mean
/// "a different attempt" and short enough that a genuinely deleted track is
/// marked within one session of noticing.
const MISS_COOLDOWN: i64 = 300;

/// Record that these tracks were asked for and not returned.
///
/// Returns the URNs that crossed into being tombstoned on this call.
pub fn mark_missing(app: &AppHandle, ids: &[u64]) -> Result<Vec<String>> {
    let mut conn = open(app)?;
    let tx = conn.transaction()?;
    let at = now();
    let mut newly_gone = Vec::new();

    for id in ids {
        let urn = urn(*id);
        let row: Option<(i64, Option<i64>, Option<i64>)> = tx
            .query_row(
                "SELECT misses, missed_at, gone_at FROM tracks WHERE urn = ?1",
                [&urn],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;
        let Some((misses, missed_at, gone_at)) = row else {
            // Never seen it succeed, so there is nothing to have lost.
            continue;
        };
        if gone_at.is_some() {
            continue;
        }
        if missed_at.is_some_and(|last| at - last < MISS_COOLDOWN) {
            continue; // same occasion
        }

        let misses = misses + 1;
        if misses >= MISSES_BEFORE_GONE {
            tx.execute(
                "UPDATE tracks SET misses = ?2, missed_at = ?3, gone_at = ?3 WHERE urn = ?1",
                params![&urn, misses, at],
            )?;
            newly_gone.push(urn);
        } else {
            tx.execute(
                "UPDATE tracks SET misses = ?2, missed_at = ?3 WHERE urn = ?1",
                params![&urn, misses, at],
            )?;
        }
    }

    tx.commit()?;
    Ok(newly_gone)
}

/// Every track this store knows is gone, newest loss first.
pub fn gone_tracks(app: &AppHandle) -> Result<Vec<StoredTrack>> {
    let conn = open(app)?;
    let mut stmt =
        conn.prepare("SELECT * FROM tracks WHERE gone_at IS NOT NULL ORDER BY gone_at DESC")?;
    let rows = stmt.query_map([], row_to_stored)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// One track out of the mirror, by id. The snapshot a tombstone is made of.
pub fn stored_track(app: &AppHandle, track_id: u64) -> Result<Option<StoredTrack>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT * FROM tracks WHERE urn = ?1")?;
    Ok(stmt.query_row([urn(track_id)], row_to_stored).optional()?)
}

/// What every row in a list needs to know about itself, in one query.
///
/// A list of three thousand tracks cannot ask three thousand questions, and the
/// two facts a row wants — how many marks are on it, and whether the upload is
/// gone — are both one `GROUP BY` away. Keyed by track id as a string, because
/// that is what a JavaScript object's keys are anyway.
#[derive(Debug, Serialize, Default)]
pub struct RowFacts {
    pub marks: HashMap<String, i64>,
    pub gone: HashMap<String, i64>,
}

pub fn row_facts(app: &AppHandle) -> Result<RowFacts> {
    let conn = open(app)?;
    let mut facts = RowFacts::default();

    let mut stmt = conn.prepare("SELECT track_urn, COUNT(*) FROM marks GROUP BY track_urn")?;
    for row in stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
    })? {
        let (urn, count) = row?;
        if let Some(id) = urn_id(&urn) {
            facts.marks.insert(id.to_string(), count);
        }
    }

    let mut stmt =
        conn.prepare("SELECT track_id, gone_at FROM tracks WHERE gone_at IS NOT NULL")?;
    for row in stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))? {
        let (id, at) = row?;
        facts.gone.insert(id.to_string(), at);
    }

    Ok(facts)
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

#[derive(Debug, Serialize, Deserialize)]
pub struct Mark {
    pub id: i64,
    pub track_urn: String,
    pub position_ms: i64,
    pub note: Option<String>,
    pub created_at: i64,
}

fn row_to_mark(row: &rusqlite::Row<'_>) -> rusqlite::Result<Mark> {
    Ok(Mark {
        id: row.get("id")?,
        track_urn: row.get("track_urn")?,
        position_ms: row.get("position_ms")?,
        note: row.get("note")?,
        created_at: row.get("created_at")?,
    })
}

/// Every mark on one track, in playing order — which is what the thread needs
/// and what the number keys step through.
pub fn marks_list(app: &AppHandle, track_id: u64) -> Result<Vec<Mark>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT * FROM marks WHERE track_urn = ?1 ORDER BY position_ms")?;
    let rows = stmt.query_map([urn(track_id)], row_to_mark)?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Every mark there is, newest first. The marks screen.
pub fn marks_all(app: &AppHandle, limit: u32) -> Result<Vec<(Mark, Option<StoredTrack>)>> {
    let conn = open(app)?;
    // `t.urn`, not `t.urn AS t_urn`, and the alias is what this whole function
    // was broken by: `row_to_stored` reads a column called `urn`, so under the
    // alias every row whose track *was* mirrored failed to map, the failure
    // took the entire query with it, and the store's `.catch(() => [])` turned
    // that into an empty list. Marks were being saved perfectly and the tab
    // said "nothing yet" — a mark only ever showed up for a track the mirror
    // had never seen, which is nearly none of them.
    //
    // No alias is needed: `marks` calls its own column `track_urn`, so the two
    // names do not collide.
    let mut stmt = conn.prepare(
        "SELECT m.*, t.urn, t.track_id, t.title, t.artist, t.duration_ms,
                t.artwork_url, t.permalink_url, t.added_at, t.gone_at, t.hidden_at
           FROM marks m LEFT JOIN tracks t ON t.urn = m.track_urn
          ORDER BY m.created_at DESC
          LIMIT ?1",
    )?;
    let rows = stmt.query_map([limit], |row| {
        let mark = row_to_mark(row)?;
        // A mark on a track that was never mirrored still has to appear: the
        // mark is the user's, the metadata is SoundCloud's.
        let track = match row.get::<_, Option<String>>("urn")? {
            Some(_) => Some(row_to_stored(row)?),
            None => None,
        };
        Ok((mark, track))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

pub fn marks_add(
    app: &AppHandle,
    track_id: u64,
    position_ms: i64,
    note: Option<String>,
) -> Result<Mark> {
    let conn = open(app)?;
    let urn = urn(track_id);
    let at = now();
    conn.execute(
        "INSERT INTO marks (track_urn, position_ms, note, created_at)
         VALUES (?1, ?2, ?3, ?4)",
        params![&urn, position_ms, &note, at],
    )?;
    Ok(Mark {
        id: conn.last_insert_rowid(),
        track_urn: urn,
        position_ms,
        note,
        created_at: at,
    })
}

pub fn marks_update(
    app: &AppHandle,
    id: i64,
    note: Option<String>,
    position_ms: Option<i64>,
) -> Result<()> {
    let conn = open(app)?;
    if let Some(position_ms) = position_ms {
        conn.execute(
            "UPDATE marks SET position_ms = ?2 WHERE id = ?1",
            params![id, position_ms],
        )?;
    }
    conn.execute(
        "UPDATE marks SET note = ?2 WHERE id = ?1",
        params![id, note],
    )?;
    Ok(())
}

pub fn marks_delete(app: &AppHandle, id: i64) -> Result<()> {
    open(app)?.execute("DELETE FROM marks WHERE id = ?1", [id])?;
    Ok(())
}

/// Every mark, as text, for a file the user asked for.
///
/// Plain text rather than JSON on purpose: this is the one thing here that
/// leaves the app, and it leaves as something a person can read.
pub fn marks_export(app: &AppHandle) -> Result<String> {
    let marks = marks_all(app, 100_000)?;
    let mut out = String::from("# Cloudify marks\n");
    let mut current = String::new();
    for (mark, track) in marks {
        let heading = match &track {
            Some(t) => format!(
                "\n## {} — {}\n",
                t.track.artist.as_deref().unwrap_or("unknown"),
                t.track.title
            ),
            None => format!("\n## {}\n", mark.track_urn),
        };
        if heading != current {
            out.push_str(&heading);
            current = heading;
        }
        let seconds = mark.position_ms / 1000;
        out.push_str(&format!(
            "- {:02}:{:02}{}\n",
            seconds / 60,
            seconds % 60,
            mark.note
                .as_deref()
                .filter(|n| !n.is_empty())
                .map(|n| format!(" — {n}"))
                .unwrap_or_default(),
        ));
    }
    Ok(out)
}

// -------------------------------------------------------------------- later --

#[derive(Debug, Serialize, Deserialize)]
pub struct LaterItem {
    pub track_urn: String,
    pub track_id: u64,
    pub title: String,
    pub artist: Option<String>,
    pub added_at: i64,
    pub source: String,
    pub expires_at: Option<i64>,
}

pub fn later_list(app: &AppHandle) -> Result<Vec<LaterItem>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT * FROM later ORDER BY added_at DESC")?;
    let rows = stmt.query_map([], |row| {
        let track_urn: String = row.get("track_urn")?;
        Ok(LaterItem {
            track_id: urn_id(&track_urn).unwrap_or_default(),
            track_urn,
            title: row.get("title")?,
            artist: row.get("artist")?,
            added_at: row.get("added_at")?,
            source: row.get("source")?,
            expires_at: row.get("expires_at")?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Days after which the app asks about something saved for later.
///
/// A soft date, and the only kind that is honest: the app has no business
/// deleting something you meant to hear because a timer went off.
const LATER_DAYS: i64 = 30;

pub fn later_add(app: &AppHandle, track: &Track, source: &str) -> Result<()> {
    let at = now();
    open(app)?.execute(
        "INSERT INTO later (track_urn, title, artist, added_at, source, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(track_urn) DO UPDATE SET
             added_at = excluded.added_at,
             source   = excluded.source,
             expires_at = excluded.expires_at",
        params![
            urn(track.id),
            &track.title,
            &track.artist,
            at,
            source,
            at + LATER_DAYS * 86_400,
        ],
    )?;
    Ok(())
}

pub fn later_remove(app: &AppHandle, track_id: u64) -> Result<()> {
    open(app)?.execute("DELETE FROM later WHERE track_urn = ?1", [urn(track_id)])?;
    Ok(())
}

/// Push an item's question further out — "yes, still want this".
pub fn later_keep(app: &AppHandle, track_id: u64) -> Result<()> {
    open(app)?.execute(
        "UPDATE later SET expires_at = ?2 WHERE track_urn = ?1",
        params![urn(track_id), now() + LATER_DAYS * 86_400],
    )?;
    Ok(())
}

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

#[derive(Debug, Serialize)]
pub struct CachedWaveform {
    pub samples: Vec<u32>,
    pub height: u32,
}

pub fn waveform_get(app: &AppHandle, track_id: u64) -> Result<Option<CachedWaveform>> {
    let conn = open(app)?;
    let row: Option<(String, i64)> = conn
        .query_row(
            "SELECT samples, height FROM waveforms WHERE track_urn = ?1",
            [urn(track_id)],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(row.and_then(|(json, height)| {
        serde_json::from_str::<Vec<u32>>(&json)
            .ok()
            .map(|samples| CachedWaveform {
                samples,
                height: height as u32,
            })
    }))
}

pub fn waveform_put(app: &AppHandle, track_id: u64, samples: &[u32], height: u32) -> Result<()> {
    let json = serde_json::to_string(samples).unwrap_or_else(|_| "[]".into());
    open(app)?.execute(
        "INSERT INTO waveforms (track_urn, samples, height, fetched_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(track_urn) DO UPDATE SET
             samples = excluded.samples,
             height = excluded.height,
             fetched_at = excluded.fetched_at",
        params![urn(track_id), json, height as i64, now()],
    )?;
    Ok(())
}

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

/// A set of tracks that are the same recording under different rows.
#[derive(Debug, Serialize)]
pub struct DuplicateGroup {
    /// The one to keep by default: whichever entered the library first.
    pub keep: StoredTrack,
    pub others: Vec<StoredTrack>,
}

/// Words that make two uploads *different* recordings rather than the same one.
///
/// The whole difficulty of this feature is here. Stripping every bracketed
/// segment turns `Track (VIP Mix)` and `Track (Radio Edit)` into the same
/// string, and merging a remix with its original is a much worse failure than
/// missing a duplicate — one loses music, the other loses tidiness. So a
/// bracketed segment is only dropped when it contains none of these.
const DISTINGUISHING: &[&str] = &[
    "remix",
    "rmx",
    "edit",
    "mix",
    "version",
    "vip",
    "bootleg",
    "flip",
    "live",
    "cover",
    "mashup",
    "extended",
    "radio",
    "instrumental",
    "acoustic",
    "demo",
    "remaster",
    "slowed",
    "sped",
    "nightcore",
    "dub",
    "rework",
    "refix",
];

/// Decoration that says nothing about which recording this is.
const NOISE: &[&str] = &[
    "free dl",
    "free download",
    "download",
    "out now",
    "official audio",
    "official video",
    "official",
    "premiere",
    "exclusive",
    "hq",
    "hd",
    "prod by",
    "prod",
    "click buy for free",
    "buy link",
    "снят",
    "free",
];

/// The key two rows must agree on to be the same recording.
///
/// Public because the test for it is the only thing standing between this
/// feature and somebody's remix collection.
pub fn duplicate_key(title: &str, artist: Option<&str>) -> String {
    let mut kept = String::new();
    let mut depth_buffer = String::new();
    let mut depth = 0usize;

    // Walk the title once, holding bracketed spans aside to judge them whole.
    for c in title.chars() {
        match c {
            '(' | '[' | '{' => {
                depth += 1;
                if depth == 1 {
                    depth_buffer.clear();
                    continue;
                }
                depth_buffer.push(c);
            }
            ')' | ']' | '}' if depth > 0 => {
                depth -= 1;
                if depth == 0 {
                    let inner = fold::fold(&depth_buffer);
                    // The keywords are folded too, and they have to be: `fold`
                    // rewrites `w` as `v`, so a literal "slowed" here would
                    // never match the "sloved" the title folds to — and a
                    // slowed edit would be merged with its original.
                    if DISTINGUISHING
                        .iter()
                        .any(|word| inner.split(' ').any(|w| w == fold::fold(word)))
                    {
                        kept.push(' ');
                        kept.push_str(&depth_buffer);
                    }
                    continue;
                }
                depth_buffer.push(c);
            }
            _ if depth > 0 => depth_buffer.push(c),
            _ => kept.push(c),
        }
    }
    // An unclosed bracket is not a reason to lose the rest of the title.
    if depth > 0 {
        kept.push(' ');
        kept.push_str(&depth_buffer);
    }

    let mut key = fold::fold(&kept);
    for noise in NOISE {
        // Folded for the same reason as above — and because one of these is
        // written in Cyrillic, which by this point the key no longer is.
        key = key.replace(&fold::fold(noise), " ");
    }
    let key: String = key.split_whitespace().collect::<Vec<_>>().join(" ");

    match artist {
        Some(artist) => format!("{} :: {key}", fold::fold(artist)),
        None => key,
    }
}

/// Tracks that are almost certainly the same recording twice.
///
/// Two rows group together when the key above matches *and* their durations are
/// within two seconds. Duration is what makes this safe: two uploads of the same
/// title by the same artist that differ by a minute are not the same file, and
/// SoundCloud is full of both edits and re-uploads.
pub fn duplicates(app: &AppHandle) -> Result<Vec<DuplicateGroup>> {
    let conn = open(app)?;
    let mut stmt =
        conn.prepare("SELECT * FROM tracks WHERE hidden_at IS NULL ORDER BY added_at ASC")?;
    let tracks: Vec<StoredTrack> = stmt
        .query_map([], row_to_stored)?
        .collect::<rusqlite::Result<_>>()?;

    let mut buckets: HashMap<String, Vec<StoredTrack>> = HashMap::new();
    for track in tracks {
        let key = duplicate_key(&track.track.title, track.track.artist.as_deref());
        if key.trim().is_empty() {
            continue;
        }
        buckets.entry(key).or_default().push(track);
    }

    const TOLERANCE_MS: i64 = 2_000;
    let mut groups = Vec::new();
    for (_, mut bucket) in buckets {
        if bucket.len() < 2 {
            continue;
        }
        // Within a bucket, split again by duration: same title and artist can
        // still be a two-minute snippet and the full track.
        bucket.sort_by_key(|t| t.track.duration);
        let mut run: Vec<StoredTrack> = Vec::new();
        let flush = |run: &mut Vec<StoredTrack>, groups: &mut Vec<DuplicateGroup>| {
            if run.len() > 1 {
                // Oldest addition is the one to keep — it is the row the user's
                // own history and marks are most likely attached to.
                run.sort_by_key(|t| t.added_at);
                let mut rest = std::mem::take(run);
                let keep = rest.remove(0);
                groups.push(DuplicateGroup { keep, others: rest });
            } else {
                run.clear();
            }
        };
        for track in bucket {
            match run.last() {
                Some(last)
                    if (track.track.duration as i64 - last.track.duration as i64).abs()
                        <= TOLERANCE_MS => {}
                Some(_) => flush(&mut run, &mut groups),
                None => {}
            }
            run.push(track);
        }
        flush(&mut run, &mut groups);
    }

    // Biggest pile first: the interface shows these as a list to work through,
    // and the worst offender is the one worth looking at.
    groups.sort_by_key(|group| std::cmp::Reverse(group.others.len()));
    Ok(groups)
}

/// Hide these rows locally. Reversible, and it touches nothing on SoundCloud.
pub fn hide_tracks(app: &AppHandle, ids: &[u64]) -> Result<()> {
    let mut conn = open(app)?;
    let tx = conn.transaction()?;
    let at = now();
    for id in ids {
        tx.execute(
            "UPDATE tracks SET hidden_at = ?2 WHERE urn = ?1",
            params![urn(*id), at],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// Put everything hidden back. The undo the interface promises.
pub fn unhide_all(app: &AppHandle) -> Result<usize> {
    Ok(open(app)?.execute(
        "UPDATE tracks SET hidden_at = NULL WHERE hidden_at IS NOT NULL",
        [],
    )?)
}

/// The ids currently hidden, so a list can leave them out.
pub fn hidden_ids(app: &AppHandle) -> Result<Vec<u64>> {
    let conn = open(app)?;
    let mut stmt = conn.prepare("SELECT track_id FROM tracks WHERE hidden_at IS NOT NULL")?;
    let rows = stmt.query_map([], |r| r.get::<_, i64>(0))?;
    Ok(rows
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .map(|id| id as u64)
        .collect())
}

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
    use super::{duplicate_key, hash_url, urn, urn_id};

    #[test]
    fn urns_round_trip() {
        assert_eq!(urn_id(&urn(12345)), Some(12345));
        assert_eq!(urn_id("nonsense"), None);
    }

    #[test]
    fn a_reupload_is_a_duplicate() {
        // The case this feature exists for: the same recording, twice, with the
        // decoration one of the uploads happens to carry.
        assert_eq!(
            duplicate_key("Sunset Grid [Free DL]", Some("Someone")),
            duplicate_key("Sunset Grid", Some("someone")),
        );
        assert_eq!(
            duplicate_key("Вязки (prod. by Nobody)", Some("Artist")),
            duplicate_key("vyazki", Some("artist")),
        );
    }

    #[test]
    fn a_remix_is_not_a_duplicate() {
        // The failure that would cost someone music, so it is the one with the
        // most cases. Every pair below must stay apart.
        let original = duplicate_key("Sunset Grid", Some("Someone"));
        for other in [
            "Sunset Grid (VIP Mix)",
            "Sunset Grid (Radio Edit)",
            "Sunset Grid [Live]",
            "Sunset Grid (Someone Else Remix)",
            "Sunset Grid (Extended Version)",
            "Sunset Grid (Slowed)",
        ] {
            assert_ne!(
                original,
                duplicate_key(other, Some("Someone")),
                "{other:?} must not collide with the original",
            );
        }
        // …and two different remixes must not collide with each other either.
        assert_ne!(
            duplicate_key("Sunset Grid (VIP Mix)", Some("Someone")),
            duplicate_key("Sunset Grid (Radio Edit)", Some("Someone")),
        );
    }

    #[test]
    fn a_different_artist_is_a_different_track() {
        assert_ne!(
            duplicate_key("Sunset Grid", Some("Someone")),
            duplicate_key("Sunset Grid", Some("Someone Else")),
        );
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
