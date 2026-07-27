//! Offline library: download tracks to disk, tag them, index them.
//!
//! Files land in `{app_data}/downloads/{track_id}.mp3` and are indexed in a
//! SQLite table so the library survives restarts and can be listed without
//! touching SoundCloud. Playback of a downloaded track goes through Tauri's
//! asset protocol, so the app works with no network at all.
//!
//! Quality note: SoundCloud's `progressive` transcoding is 128 kbps — that is
//! the ceiling for anything not explicitly marked downloadable by the artist.

use std::io::Write;
use std::path::{Path, PathBuf};

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
}

impl Serialize for DownloadError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

/// A track that exists on disk.
#[derive(Debug, Serialize)]
pub struct DownloadedTrack {
    #[serde(flatten)]
    pub track: Track,
    /// Absolute path; the frontend turns this into an asset URL.
    pub path: String,
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
    Ok(conn)
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

/// Download `track`, tag it, and add it to the local library.
///
/// Re-downloading a track that is already present overwrites it, which is also
/// how a failed or truncated earlier attempt gets repaired.
pub async fn download(app: &AppHandle, track: Track) -> Result<DownloadedTrack, DownloadError> {
    let url = sc_api::stream::get_stream_url(track.id).await?;
    let client = sc_api::http_client()?;

    let mut resp = client.get(url).send().await?.error_for_status()?;
    let total = resp.content_length();
    let mut bytes: Vec<u8> = Vec::with_capacity(total.unwrap_or(6 << 20) as usize);

    while let Some(chunk) = resp.chunk().await? {
        bytes.extend_from_slice(&chunk);
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

    let path = downloads_dir(app)?.join(format!("{}.mp3", track.id));
    {
        let mut file = std::fs::File::create(&path)?;
        file.write_all(&bytes)?;
    }

    // Tagging is cosmetic — a file that plays but has no cover beats no file.
    if let Err(e) = write_tags(&path, &track, &client).await {
        eprintln!("cloudify: tagging {} failed: {e}", track.id);
    }

    let size = bytes.len() as u64;
    let stamp = now();
    let path_str = path.to_string_lossy().to_string();

    open_db(app)?.execute(
        "INSERT INTO downloads
            (track_id, title, artist, duration, artwork_url, permalink_url, path, bytes, downloaded_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(track_id) DO UPDATE SET
            path = excluded.path,
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
            size,
            stamp,
        ],
    )?;

    Ok(DownloadedTrack {
        track,
        path: path_str,
        bytes: size,
        downloaded_at: stamp,
    })
}

/// Write title/artist and embed the cover so the file makes sense in any
/// other player too.
async fn write_tags(
    path: &Path,
    track: &Track,
    client: &reqwest::Client,
) -> Result<(), DownloadError> {
    use id3::{frame::Picture, frame::PictureType, Tag, TagLike, Version};

    let mut tag = Tag::new();
    tag.set_title(track.title.clone());
    if let Some(artist) = &track.artist {
        tag.set_artist(artist.clone());
    }

    if let Some(art) = &track.artwork_url {
        let hi_res = art.replace("-large", "-t500x500");
        if let Ok(resp) = client.get(&hi_res).send().await {
            if resp.status().is_success() {
                let mime = resp
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("image/jpeg")
                    .to_string();
                if let Ok(data) = resp.bytes().await {
                    tag.add_frame(Picture {
                        mime_type: mime,
                        picture_type: PictureType::CoverFront,
                        description: String::new(),
                        data: data.to_vec(),
                    });
                }
            }
        }
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
                    path, bytes, downloaded_at
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
    }
    open_db(app)?.execute("DELETE FROM downloads", [])?;
    Ok(count)
}

/// Remove a track from the local library, file and all.
pub fn remove(app: &AppHandle, track_id: u64) -> Result<(), DownloadError> {
    let conn = open_db(app)?;
    let path: Option<String> = conn
        .query_row(
            "SELECT path FROM downloads WHERE track_id = ?1",
            [track_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(path) = path {
        // An already-missing file is success: the desired end state is "gone".
        let _ = std::fs::remove_file(path);
    }
    conn.execute("DELETE FROM downloads WHERE track_id = ?1", [track_id])?;
    Ok(())
}
