//! Browser login flow: open SoundCloud in the user's real browser (where the
//! anti-bot captcha passes normally, unlike our embedded WebKitGTK webview),
//! then read the `oauth_token` cookie straight from the browser's cookie store.
//!
//! Supports Firefox-family browsers (Firefox, Zen, LibreWolf, …), which keep
//! cookies in a `cookies.sqlite` SQLite DB, and — on macOS — Safari, which uses
//! its own `Cookies.binarycookies` format. Safari matters disproportionately
//! there: it is the default browser, so without it the flow opens a browser, the
//! user signs in, and nothing ever happens.
//!
//! Chromium-family browsers are *not* supported and cannot easily be: their
//! cookie values are AES-encrypted with a key held in the OS keychain, so
//! reading them means prompting for keychain access. Those users take the manual
//! token path instead.
//!
//! The user explicitly opts into this (it reads their browser profile). Only the
//! SoundCloud `oauth_token` is read; the token is never logged.
//!
//! Profile locations differ per platform, so the candidate roots below are
//! `cfg`-gated. Getting this wrong doesn't fail loudly — the scan simply finds
//! nothing and the user is left waiting on a login that can never complete.

use std::path::{Path, PathBuf};

use super::AuthError;

const SIGNIN_URL: &str = "https://soundcloud.com/signin";

/// Open SoundCloud's sign-in page in the user's default browser.
///
/// `open::that` picks the right mechanism per platform — `xdg-open`, `open`
/// and `ShellExecute` respectively. Shelling out to `xdg-open` directly, as
/// this used to, is a no-op on macOS and Windows.
pub fn open_signin() -> Result<(), AuthError> {
    open::that(SIGNIN_URL)
        .map_err(|e| AuthError::Browser(format!("failed to open browser: {e}")))?;
    Ok(())
}

/// Scan every supported browser's cookie store for a SoundCloud `oauth_token`.
/// Returns the first non-empty value found.
pub fn find_token() -> Option<String> {
    find_cookie("oauth_token")
}

/// Whether a path is a file this process can actually open and read.
///
/// `is_file` was the test, and on macOS it is not one. Safari's jar exists on
/// every Mac and is unreadable without Full Disk Access, so the check written to
/// say "this route cannot work here" answered "it can" on exactly the machine it
/// was written for: the app opened a browser, the user signed in properly, and
/// then waited out a three-minute timeout that was certain from the first
/// second.
///
/// Opening it is the only honest answer — permissions, sandbox containers and
/// macOS privacy protection all decide at `open`, not at `stat`. The handle is
/// dropped immediately; nothing is read here, and reading is what the callers do
/// later on their own terms.
///
/// `is_file` stays in front of it because a directory opens perfectly well on
/// Unix and fails only when something tries to read it.
fn readable(path: &Path) -> bool {
    path.is_file() && std::fs::File::open(path).is_ok()
}

/// Whether there is any cookie store on this machine this build can read.
///
/// Asked *before* opening the browser, so the flow can decline instead of
/// performing it. The failure it prevents is the one this module's header warns
/// about and macOS runs into constantly: a Chromium-family default browser (or
/// Safari without Full Disk Access) leaves nothing readable, so the app opened a
/// browser, the user signed in, and then waited three minutes for a timeout that
/// was certain from the first second. Telling them up front costs nothing and is
/// the difference between "sign-in is broken" and "sign-in needs a different
/// route on this machine".
///
/// Note what this does *not* claim: that a token will be found. The user may
/// have a readable browser installed and sign in with a different one. It only
/// rules out the case where success was impossible.
pub fn can_read_any_store() -> bool {
    if !cookie_dbs().is_empty() {
        return true;
    }
    #[cfg(target_os = "macos")]
    if !safari_jars().is_empty() {
        return true;
    }
    false
}

/// First non-empty value of `name` for soundcloud.com, across every store.
fn find_cookie(name: &str) -> Option<String> {
    for db in cookie_dbs() {
        if let Some(value) = read_cookie(&db, name) {
            return Some(value);
        }
    }

    #[cfg(target_os = "macos")]
    for jar in safari_jars() {
        if let Some(value) = safari::read_cookie(&jar, name) {
            return Some(value);
        }
    }

    None
}

/// Safari's cookie jars: the sandboxed container first (that is where a current
/// Safari actually writes), then the legacy location.
///
/// Both live under macOS privacy protection, so reading them requires the app to
/// have Full Disk Access. Without it the files are there and cannot be opened,
/// which is why the filter below opens them rather than asking whether they
/// exist.
#[cfg(target_os = "macos")]
fn safari_jars() -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else {
        return Vec::new();
    };
    [
        "Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies",
        "Library/Cookies/Cookies.binarycookies",
    ]
    .iter()
    .map(|rel| home.join(rel))
    .filter(|p| readable(p))
    .collect()
}

/// Where Firefox-family browsers keep their profile directories.
///
/// Linux additionally covers `~/.config/<browser>` (some distributions and
/// Zen put profiles there rather than in the classic dotfile location) and
/// Flatpak sandboxes.
#[cfg(all(unix, not(target_os = "macos")))]
fn profile_roots(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".config/zen"),
        home.join(".config/mozilla/firefox"),
        home.join(".config/librewolf"),
        home.join(".zen"),
        home.join(".mozilla/firefox"),
        home.join(".librewolf"),
        home.join(".var/app/io.github.zen_browser.zen/.zen"),
        home.join(".var/app/org.mozilla.firefox/.mozilla/firefox"),
    ]
}

#[cfg(target_os = "macos")]
fn profile_roots(home: &Path) -> Vec<PathBuf> {
    let support = home.join("Library/Application Support");
    vec![
        support.join("Firefox/Profiles"),
        support.join("zen/Profiles"),
        support.join("LibreWolf/Profiles"),
        support.join("Waterfox/Profiles"),
    ]
}

#[cfg(target_os = "windows")]
fn profile_roots(home: &Path) -> Vec<PathBuf> {
    // %APPDATA% is the canonical location; fall back to the usual path under
    // the home directory when the variable is missing.
    let roaming = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| home.join("AppData/Roaming"));
    vec![
        roaming.join("Mozilla/Firefox/Profiles"),
        roaming.join("zen/Profiles"),
        roaming.join("librewolf/Profiles"),
        roaming.join("Waterfox/Profiles"),
    ]
}

/// Candidate `cookies.sqlite` paths across Firefox-family profiles.
fn cookie_dbs() -> Vec<PathBuf> {
    let mut dbs = Vec::new();
    // Windows has no HOME; USERPROFILE is its equivalent.
    let Some(home) = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
    else {
        return dbs;
    };

    // Each root holds one directory per profile; the DB is directly inside.
    let roots = profile_roots(&home);

    for root in roots {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.flatten() {
            let db = entry.path().join("cookies.sqlite");
            if readable(&db) {
                dbs.push(db);
            }
        }
    }
    dbs
}

/// Read a named cookie for soundcloud.com from one cookies.sqlite.
///
/// The browser keeps the DB open in WAL mode, so we copy it (plus its -wal/-shm
/// sidecars, to see freshly-written cookies) to a temp file and read that copy
/// read-only — avoiding lock contention with the running browser.
fn read_cookie(db: &Path, name: &str) -> Option<String> {
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
        let conn =
            rusqlite::Connection::open_with_flags(&tmp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .ok()?;
        conn.query_row(
            "SELECT value FROM moz_cookies \
             WHERE name = ?1 AND host LIKE '%soundcloud.com' \
             ORDER BY LENGTH(value) DESC LIMIT 1",
            [name],
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

/// Safari's `Cookies.binarycookies` reader.
///
/// The format is undocumented but stable and simple:
///
/// ```text
/// "cook" | u32be page_count | u32be page_size × N | page × N
/// page:  0x00000100 | u32le cookie_count | u32le offset × N | cookie × N
/// cookie: u32le size | 4 bytes | u32le flags | 4 bytes
///         | u32le url_off | u32le name_off | u32le path_off | u32le value_off
///         | 8 bytes | f64le expiry | f64le creation | NUL-terminated strings
/// ```
///
/// String offsets are relative to the start of their cookie. Everything the
/// reader does not need is skipped rather than parsed, so a future field
/// addition inside a cookie record cannot break it.
///
/// Built as its own module so the pure parsing can be unit-tested off-platform —
/// which is why it is compiled under `test` on every platform, but only reaches
/// the filesystem on macOS.
#[cfg(any(target_os = "macos", test))]
mod safari {
    /// Read a named SoundCloud cookie out of a binarycookies file.
    #[cfg(target_os = "macos")]
    pub fn read_cookie(path: &std::path::Path, name: &str) -> Option<String> {
        let bytes = std::fs::read(path).ok()?;
        find_cookie(&bytes, name, "soundcloud.com")
    }

    fn u32be(b: &[u8], at: usize) -> Option<usize> {
        Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?) as usize)
    }

    fn u32le(b: &[u8], at: usize) -> Option<usize> {
        Some(u32::from_le_bytes(b.get(at..at + 4)?.try_into().ok()?) as usize)
    }

    /// NUL-terminated UTF-8 string at `at`.
    fn cstr(b: &[u8], at: usize) -> Option<&str> {
        let rest = b.get(at..)?;
        let end = rest.iter().position(|&c| c == 0)?;
        std::str::from_utf8(&rest[..end]).ok()
    }

    /// Search every page for a cookie matching `name` on `domain`.
    ///
    /// `domain` matches by suffix, because Safari stores the host as written by
    /// the site — `.soundcloud.com` for a domain cookie, `soundcloud.com` for a
    /// host-only one.
    pub fn find_cookie(bytes: &[u8], name: &str, domain: &str) -> Option<String> {
        if bytes.get(..4)? != b"cook" {
            return None;
        }

        let pages = u32be(bytes, 4)?;
        // Page sizes come as a run of big-endian u32s right after the count.
        let sizes: Vec<usize> = (0..pages)
            .map(|i| u32be(bytes, 8 + i * 4))
            .collect::<Option<_>>()?;

        let mut at = 8 + pages * 4;
        for size in sizes {
            let page = bytes.get(at..at + size)?;
            if let Some(found) = find_in_page(page, name, domain) {
                return Some(found);
            }
            at += size;
        }
        None
    }

    fn find_in_page(page: &[u8], name: &str, domain: &str) -> Option<String> {
        let count = u32le(page, 4)?;
        for i in 0..count {
            let start = u32le(page, 8 + i * 4)?;
            let cookie = page.get(start..)?;

            // Offsets are relative to the cookie, so the slice above is the
            // right base for all four of them.
            let url = cstr(cookie, u32le(cookie, 16)?)?;
            let found = cstr(cookie, u32le(cookie, 20)?)?;
            if found != name || !url.trim_start_matches('.').ends_with(domain) {
                continue;
            }

            let value = cstr(cookie, u32le(cookie, 28)?)?;
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::{readable, safari};
    use std::path::PathBuf;

    /// A path nobody can open is not a cookie store, however much it exists.
    ///
    /// This is the whole bug: the check that decides whether the browser flow
    /// can work at all used to ask only whether the file was there, and Safari's
    /// jar is there on every Mac — locked behind Full Disk Access. The answer
    /// was "yes, this will work" on the one machine where it could not.
    #[test]
    fn a_file_that_will_not_open_is_not_a_store() {
        let dir = std::env::temp_dir().join(format!(
            "cloudify-readable-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let file = dir.join("cookies.sqlite");
        std::fs::write(&file, b"not really a database").expect("write");

        // Readable to start with, or the rest of this proves nothing.
        assert!(readable(&file));

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o000)).expect("chmod");

            // Root ignores the mode bits, so there is nothing to assert there.
            if std::fs::File::open(&file).is_err() {
                assert!(!readable(&file));
            }

            std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600))
                .expect("chmod back");
        }

        std::fs::remove_dir_all(&dir).ok();
    }

    /// The two ways a path can fail to be a file at all.
    #[test]
    fn a_missing_path_and_a_directory_are_not_stores() {
        assert!(!readable(&PathBuf::from(
            "/definitely/not/here/cookies.sqlite"
        )));
        // A directory opens fine on Unix and fails only when read, which is why
        // `readable` keeps the `is_file` test in front of the open.
        assert!(!readable(&std::env::temp_dir()));
    }

    /// Build a one-page, one-cookie file exactly as Safari lays it out.
    fn binarycookies(url: &str, name: &str, value: &str) -> Vec<u8> {
        // Fixed header of a cookie record is 56 bytes; strings follow it.
        const HEAD: usize = 56;
        let path = "/";
        let url_off = HEAD;
        let name_off = url_off + url.len() + 1;
        let path_off = name_off + name.len() + 1;
        let value_off = path_off + path.len() + 1;
        let size = value_off + value.len() + 1;

        let mut cookie = vec![0u8; HEAD];
        cookie[0..4].copy_from_slice(&(size as u32).to_le_bytes());
        cookie[16..20].copy_from_slice(&(url_off as u32).to_le_bytes());
        cookie[20..24].copy_from_slice(&(name_off as u32).to_le_bytes());
        cookie[24..28].copy_from_slice(&(path_off as u32).to_le_bytes());
        cookie[28..32].copy_from_slice(&(value_off as u32).to_le_bytes());
        for s in [url, name, path, value] {
            cookie.extend_from_slice(s.as_bytes());
            cookie.push(0);
        }

        let mut page = Vec::new();
        page.extend_from_slice(&[0x00, 0x00, 0x01, 0x00]);
        page.extend_from_slice(&1u32.to_le_bytes());
        // One offset, pointing just past the header and the offset list.
        page.extend_from_slice(&12u32.to_le_bytes());
        page.extend_from_slice(&cookie);

        let mut out = Vec::from(*b"cook");
        out.extend_from_slice(&1u32.to_be_bytes());
        out.extend_from_slice(&(page.len() as u32).to_be_bytes());
        out.extend_from_slice(&page);
        out
    }

    #[test]
    fn reads_a_domain_cookie() {
        let bytes = binarycookies(".soundcloud.com", "oauth_token", "2-abc");
        assert_eq!(
            safari::find_cookie(&bytes, "oauth_token", "soundcloud.com").as_deref(),
            Some("2-abc"),
        );
    }

    #[test]
    fn ignores_other_sites_and_other_cookies() {
        let other = binarycookies(".example.com", "oauth_token", "nope");
        assert_eq!(
            safari::find_cookie(&other, "oauth_token", "soundcloud.com"),
            None
        );

        let wrong_name = binarycookies(".soundcloud.com", "session", "nope");
        assert_eq!(
            safari::find_cookie(&wrong_name, "oauth_token", "soundcloud.com"),
            None,
        );
    }

    #[test]
    fn rejects_a_file_that_is_not_a_cookie_jar() {
        assert_eq!(
            safari::find_cookie(b"not a jar at all", "oauth_token", "soundcloud.com"),
            None
        );
        assert_eq!(
            safari::find_cookie(b"cook", "oauth_token", "soundcloud.com"),
            None
        );
    }
}
