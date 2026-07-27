//! Browser login flow: open SoundCloud in the user's real browser (where the
//! anti-bot captcha passes normally, unlike our embedded WebKitGTK webview),
//! then read the `oauth_token` cookie straight from the browser's cookie store.
//!
//! Supports Firefox-family browsers (Firefox, Zen, LibreWolf, …), which keep
//! cookies in a `cookies.sqlite` SQLite DB. The user explicitly opts into this
//! (it reads their browser profile). Only the SoundCloud `oauth_token` is read;
//! the token is never logged.

use std::path::{Path, PathBuf};

use super::AuthError;

const SIGNIN_URL: &str = "https://soundcloud.com/signin";

/// Open SoundCloud's sign-in page in the user's default browser.
pub fn open_signin() -> Result<(), AuthError> {
    std::process::Command::new("xdg-open")
        .arg(SIGNIN_URL)
        .spawn()
        .map_err(|e| AuthError::Browser(format!("failed to open browser: {e}")))?;
    Ok(())
}

/// Scan known Firefox-family profiles for a SoundCloud `oauth_token` cookie.
/// Returns the first non-empty value found.
pub fn find_token() -> Option<String> {
    for db in cookie_dbs() {
        if let Some(token) = read_oauth_token(&db) {
            return Some(token);
        }
    }
    None
}

/// Candidate `cookies.sqlite` paths across Firefox-family profiles.
fn cookie_dbs() -> Vec<PathBuf> {
    let mut dbs = Vec::new();
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return dbs;
    };

    // Each root holds one directory per profile; the DB is directly inside.
    // Note: on some setups (e.g. this one) browsers keep profiles under
    // ~/.config/<browser> rather than the classic ~/.<browser>.
    let roots = [
        home.join(".config/zen"),
        home.join(".config/mozilla/firefox"),
        home.join(".config/librewolf"),
        home.join(".zen"),
        home.join(".mozilla/firefox"),
        home.join(".librewolf"),
        home.join(".var/app/io.github.zen_browser.zen/.zen"),
        home.join(".var/app/org.mozilla.firefox/.mozilla/firefox"),
    ];

    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let db = entry.path().join("cookies.sqlite");
            if db.is_file() {
                dbs.push(db);
            }
        }
    }
    dbs
}

/// Read the `oauth_token` cookie for soundcloud.com from one cookies.sqlite.
///
/// The browser keeps the DB open in WAL mode, so we copy it (plus its -wal/-shm
/// sidecars, to see freshly-written cookies) to a temp file and read that copy
/// read-only — avoiding lock contention with the running browser.
fn read_oauth_token(db: &Path) -> Option<String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("cloudify-cookies-{stamp}.sqlite"));

    std::fs::copy(db, &tmp).ok()?;
    for ext in ["-wal", "-shm"] {
        let src = with_suffix(db, ext);
        if src.exists() {
            let _ = std::fs::copy(&src, with_suffix(&tmp, ext));
        }
    }

    let value = (|| {
        let conn = rusqlite::Connection::open_with_flags(
            &tmp,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .ok()?;
        conn.query_row(
            "SELECT value FROM moz_cookies \
             WHERE name = 'oauth_token' AND host LIKE '%soundcloud.com' \
             ORDER BY LENGTH(value) DESC LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
    })();

    // Clean up temp copies.
    let _ = std::fs::remove_file(&tmp);
    for ext in ["-wal", "-shm"] {
        let _ = std::fs::remove_file(with_suffix(&tmp, ext));
    }

    value.filter(|v| !v.is_empty())
}

/// Append a suffix to a path's file name (e.g. `foo.sqlite` + `-wal`).
fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut s = path.as_os_str().to_owned();
    s.push(suffix);
    PathBuf::from(s)
}
