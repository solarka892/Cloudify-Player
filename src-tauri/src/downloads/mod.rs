//! Offline library: download tracks to disk, tag them, index them.
//!
//! Files land in `{app_data}/downloads/{track_id}.mp3` and are indexed in a
//! SQLite table so the library survives restarts and can be listed without
//! touching SoundCloud. Playback of a downloaded track goes through Tauri's
//! asset protocol, so the app works with no network at all.
//!
//! Quality note: SoundCloud's `progressive` transcoding is 128 kbps — that is
//! the ceiling for anything not explicitly marked downloadable by the artist.

use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::sc_api::{self, models::Track};

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),
    #[error("local library error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("tagging error: {0}")]
    Tag(#[from] id3::Error),
    #[error("soundcloud error: {0}")]
    ScApi(#[from] sc_api::ScApiError),
    #[error("could not resolve the app data directory")]
    NoAppDir,
    /// SoundCloud offers this track only in a form that cannot be written out as
    /// a file here — an opus or AAC HLS playlist, which would need a muxer. It
    /// still *plays*; see `sc_api::stream`.
    #[error("this track is streaming-only — SoundCloud offers no downloadable form of it")]
    NotDownloadable,
}

impl Serialize for DownloadError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// A track that exists on disk.
///
/// Snake case throughout, like `Track` which it flattens in — a `rename_all`
/// here would quietly rename `downloaded_at` out from under the frontend.
#[derive(Debug, Serialize)]
pub struct DownloadedTrack {
    #[serde(flatten)]
    pub track: Track,
    /// Absolute path; the frontend turns this into an asset URL.
    pub path: String,
    /// The cover, saved beside the audio during the download.
    ///
    /// The bytes are fetched anyway to embed in the ID3 tag, so keeping a copy
    /// costs one file write and saves a CDN request every single time the track
    /// appears in a list, a queue or the player — which for a track you have
    /// downloaded is the one remaining reason it touches the network at all.
    ///
    /// `None` for anything downloaded before this existed, and for tracks with
    /// no artwork; both fall back to the remote URL.
    pub cover_path: Option<String>,
    pub bytes: u64,
    /// Unix seconds.
    pub downloaded_at: i64,
}

/// Emitted on `download://progress` while bytes are arriving.
#[derive(Clone, Serialize)]
struct Progress {
    track_id: u64,
    received: u64,
    /// `None` when the CDN omits `content-length`.
    total: Option<u64>,
}

fn downloads_dir(app: &AppHandle) -> Result<PathBuf, DownloadError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DownloadError::NoAppDir)?
        .join("downloads");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn open_db(app: &AppHandle) -> Result<Connection, DownloadError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| DownloadError::NoAppDir)?;
    std::fs::create_dir_all(&dir)?;
    let conn = Connection::open(dir.join("library.db"))?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS downloads (
            track_id      INTEGER PRIMARY KEY,
            title         TEXT NOT NULL,
            artist        TEXT,
            duration      INTEGER NOT NULL DEFAULT 0,
            artwork_url   TEXT,
            permalink_url TEXT,
            path          TEXT NOT NULL,
            bytes         INTEGER NOT NULL DEFAULT 0,
            downloaded_at INTEGER NOT NULL
        )",
        [],
    )?;
    // Added after the table shipped. SQLite has no `ADD COLUMN IF NOT EXISTS`,
    // and the only way it can fail on an existing database is by already being
    // there — which is the desired state, so the error is the success case.
    let _ = conn.execute("ALTER TABLE downloads ADD COLUMN cover_path TEXT", []);
    Ok(conn)
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Track ids whose download is holding.
///
/// A set rather than a flag per download task: the task itself is spawned by
/// Tauri per command and has nowhere to keep state the frontend can reach, so
/// "is this one paused" lives here and the fetch loops ask between chunks.
fn paused() -> &'static Mutex<HashSet<u64>> {
    static PAUSED: OnceLock<Mutex<HashSet<u64>>> = OnceLock::new();
    PAUSED.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Hold or resume the download of one track.
///
/// What this is *not*: a pause that survives the app. The connection is held
/// open while the loop waits, so a pause of minutes may end with SoundCloud
/// hanging up — the download then fails like any other dropped connection and
/// the track can be fetched again. A pause that resumes from the middle needs
/// the partial file on disk and a ranged request, which is a bigger job than
/// the button that started this.
pub fn set_paused(track_id: u64, hold: bool) {
    let mut set = paused().lock().expect("paused set poisoned");
    if hold {
        set.insert(track_id);
    } else {
        set.remove(&track_id);
    }
}

/// Whether this track's download is holding right now.
fn is_paused(track_id: u64) -> bool {
    paused()
        .lock()
        .expect("paused set poisoned")
        .contains(&track_id)
}

/// Wait here while the download is paused.
///
/// Polled rather than woken by a signal: a download that is paused is a
/// download nobody is waiting on, so a check every 200ms costs nothing worth
/// counting and needs no channel to keep in sync with the set above.
async fn wait_while_paused(track_id: u64) {
    while is_paused(track_id) {
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// Download `track`, tag it, and add it to the local library.
///
/// Re-downloading a track that is already present overwrites it, which is also
/// how a failed or truncated earlier attempt gets repaired.
pub async fn download(app: &AppHandle, track: Track) -> Result<DownloadedTrack, DownloadError> {
    // Start unheld. A download that failed while paused — the connection went
    // away, which is exactly what a long pause invites — would otherwise leave
    // its id in the set and hold this attempt before its first chunk.
    set_paused(track.id, false);

    let stream = sc_api::stream::get_stream_url(track.id).await?;
    let client = sc_api::http_client()?;

    let bytes = if stream.protocol == "hls" {
        fetch_hls(app, &client, &track, &stream).await?
    } else {
        fetch_whole(app, &client, &track, &stream.url).await?
    };

    let dir = downloads_dir(app)?;
    let path = dir.join(format!("{}.mp3", track.id));
    {
        let mut file = std::fs::File::create(&path)?;
        file.write_all(&bytes)?;
    }

    // One fetch, two homes: the tag needs the bytes and so does the offline
    // cover. Both are cosmetic — a file that plays but has no artwork beats no
    // file — so neither failing takes the download with it.
    let cover = fetch_cover(&track, &client).await;
    let cover_path = cover.as_ref().and_then(|art| save_cover(&dir, &track, art));
    if let Err(e) = write_tags(&path, &track, cover.as_ref()) {
        eprintln!("cloudify: tagging {} failed: {e}", track.id);
    }

    let size = bytes.len() as u64;
    let stamp = now();
    let path_str = path.to_string_lossy().to_string();

    open_db(app)?.execute(
        "INSERT INTO downloads
            (track_id, title, artist, duration, artwork_url, permalink_url, path,
             cover_path, bytes, downloaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(track_id) DO UPDATE SET
            path = excluded.path,
            cover_path = excluded.cover_path,
            bytes = excluded.bytes,
            downloaded_at = excluded.downloaded_at",
        rusqlite::params![
            track.id,
            track.title,
            track.artist,
            track.duration,
            track.artwork_url,
            track.permalink_url,
            path_str,
            cover_path,
            size,
            stamp,
        ],
    )?;

    Ok(DownloadedTrack {
        track,
        path: path_str,
        cover_path,
        bytes: size,
        downloaded_at: stamp,
    })
}

/// Pull a plain file down, reporting progress as it goes.
async fn fetch_whole(
    app: &AppHandle,
    client: &reqwest::Client,
    track: &Track,
    url: &str,
) -> Result<Vec<u8>, DownloadError> {
    let mut resp = client.get(url).send().await?.error_for_status()?;
    let total = resp.content_length();
    let mut bytes: Vec<u8> = Vec::with_capacity(total.unwrap_or(6 << 20) as usize);

    while let Some(chunk) = resp.chunk().await? {
        bytes.extend_from_slice(&chunk);
        // Between chunks, which is the only place the loop is interruptible
        // without dropping what it already has.
        wait_while_paused(track.id).await;
        // Best-effort: a closed window must not fail the download.
        let _ = app.emit(
            "download://progress",
            Progress {
                track_id: track.id,
                received: bytes.len() as u64,
                total,
            },
        );
    }
    Ok(bytes)
}

/// Pull an HLS playlist down as one file.
///
/// SoundCloud serves a growing share of its catalogue as HLS only, and those
/// tracks used to be undownloadable — the resolver refused them outright. An
/// `audio/mpeg` playlist is a list of segments each of which is raw MP3 frames,
/// so concatenating them in order *is* the file: no remuxing, no container to
/// rewrite, and the result plays in anything.
///
/// That is only true of mpeg. An opus or AAC playlist would need a real muxer
/// to become a file, so it is refused with a reason rather than written out as
/// something that will not play — the one outcome worse than not offering the
/// button.
async fn fetch_hls(
    app: &AppHandle,
    client: &reqwest::Client,
    track: &Track,
    stream: &sc_api::stream::Stream,
) -> Result<Vec<u8>, DownloadError> {
    if !stream.mime_type.contains("mpeg") {
        return Err(DownloadError::NotDownloadable);
    }

    let playlist = client
        .get(&stream.url)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    // An `.m3u8` is line-oriented: everything that is not a `#` directive is a
    // segment URI. SoundCloud sends absolute URLs, so there is no base to
    // resolve against — and anything else is not something to go fetching.
    let segments: Vec<&str> = playlist
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .filter(|line| line.starts_with("https://"))
        .collect();
    if segments.is_empty() {
        return Err(DownloadError::NotDownloadable);
    }

    let mut bytes: Vec<u8> = Vec::with_capacity(6 << 20);
    for (index, segment) in segments.iter().enumerate() {
        wait_while_paused(track.id).await;
        let chunk = client
            .get(*segment)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        bytes.extend_from_slice(&chunk);
        // The total is the only honest number available: segment sizes are not
        // known ahead of time, so progress is reported against the count.
        let _ = app.emit(
            "download://progress",
            Progress {
                track_id: track.id,
                received: bytes.len() as u64,
                total: Some((bytes.len() as u64 * segments.len() as u64) / (index as u64 + 1)),
            },
        );
    }
    Ok(bytes)
}

/// Write title/artist and embed the cover so the file makes sense in any
/// other player too.
/// The track's cover at 500px, fetched once for both the tag and the disk copy.
struct Cover {
    mime: String,
    data: Vec<u8>,
}

async fn fetch_cover(track: &Track, client: &reqwest::Client) -> Option<Cover> {
    let art = track.artwork_url.as_ref()?;
    let hi_res = art.replace("-large", "-t500x500");
    let resp = client.get(&hi_res).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let data = resp.bytes().await.ok()?.to_vec();
    Some(Cover { mime, data })
}

/// Write the cover beside the audio. Returns its path, or `None` if it could
/// not be written — in which case the app falls back to the remote URL, which
/// is what it did before this existed.
fn save_cover(dir: &Path, track: &Track, cover: &Cover) -> Option<String> {
    let extension = if cover.mime.contains("png") {
        "png"
    } else {
        "jpg"
    };
    let path = dir.join(format!("{}.{extension}", track.id));
    std::fs::write(&path, &cover.data).ok()?;
    Some(path.to_string_lossy().to_string())
}

fn write_tags(path: &Path, track: &Track, cover: Option<&Cover>) -> Result<(), DownloadError> {
    use id3::{frame::Picture, frame::PictureType, Tag, TagLike, Version};

    let mut tag = Tag::new();
    tag.set_title(track.title.clone());
    if let Some(artist) = &track.artist {
        tag.set_artist(artist.clone());
    }

    if let Some(cover) = cover {
        tag.add_frame(Picture {
            mime_type: cover.mime.clone(),
            picture_type: PictureType::CoverFront,
            description: String::new(),
            data: cover.data.clone(),
        });
    }

    tag.write_to_path(path, Version::Id3v24)?;
    Ok(())
}

/// Everything in the local library, newest download first.
///
/// Rows whose file has gone missing (the user cleaned the folder) are pruned
/// as they're encountered, so the list never offers a track that won't play.
pub fn list(app: &AppHandle) -> Result<Vec<DownloadedTrack>, DownloadError> {
    let conn = open_db(app)?;
    let rows = {
        let mut stmt = conn.prepare(
            "SELECT track_id, title, artist, duration, artwork_url, permalink_url,
                    path, bytes, downloaded_at, cover_path
             FROM downloads ORDER BY downloaded_at DESC",
        )?;
        // Bound to a local: as a block tail expression the temporaries would
        // outlive `stmt`, which is declared inside this block.
        let mapped = stmt
            .query_map([], |row| {
                Ok(DownloadedTrack {
                    track: Track {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        artist: row.get(2)?,
                        duration: row.get(3)?,
                        artwork_url: row.get(4)?,
                        permalink_url: row.get(5)?,
                    },
                    path: row.get(6)?,
                    bytes: row.get(7)?,
                    downloaded_at: row.get(8)?,
                    // Checked below rather than trusted: a cover the user has
                    // deleted by hand must fall back to the network, not point
                    // the app at a file that is not there.
                    cover_path: row
                        .get::<_, Option<String>>(9)?
                        .filter(|p| Path::new(p).exists()),
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        mapped
    };

    let (present, missing): (Vec<_>, Vec<_>) =
        rows.into_iter().partition(|d| Path::new(&d.path).exists());

    for gone in &missing {
        let _ = conn.execute("DELETE FROM downloads WHERE track_id = ?1", [gone.track.id]);
    }

    Ok(present)
}

/// Delete the whole offline library. Returns how many tracks were removed.
pub fn clear(app: &AppHandle) -> Result<usize, DownloadError> {
    let tracks = list(app)?;
    let count = tracks.len();
    for track in tracks {
        // Keep going on a stubborn file; the index row still goes.
        let _ = std::fs::remove_file(&track.path);
        if let Some(cover) = &track.cover_path {
            let _ = std::fs::remove_file(cover);
        }
    }
    open_db(app)?.execute("DELETE FROM downloads", [])?;
    Ok(count)
}

/// Remove a track from the local library, file and all.
pub fn remove(app: &AppHandle, track_id: u64) -> Result<(), DownloadError> {
    let conn = open_db(app)?;
    let files: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT path, cover_path FROM downloads WHERE track_id = ?1",
            [track_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    if let Some((path, cover)) = files {
        // An already-missing file is success: the desired end state is "gone".
        let _ = std::fs::remove_file(path);
        if let Some(cover) = cover {
            let _ = std::fs::remove_file(cover);
        }
    }
    conn.execute("DELETE FROM downloads WHERE track_id = ?1", [track_id])?;
    Ok(())
}
