//! Turn a soundcloud.com link into the thing it points at.
//!
//! `GET /resolve?url=…` (verified in recon). This is what makes "paste a link"
//! work for tracks, profiles, playlists and albums alike — SoundCloud decides
//! which it is and stamps the answer with a `kind`.

use serde::{Deserialize, Serialize};

use super::{
    client_id, http_client,
    models::{Playlist, RawPlaylist, RawTrack, RawUser, Track, User},
    ScApiError, API_V2,
};

/// Whatever a link turned out to be. Serialises with a `kind` discriminator,
/// so the frontend can switch on it directly.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Resolved {
    Track(Track),
    User(User),
    Playlist(Playlist),
}

/// `RawTrack` is by far the fattest of the three, so it is boxed rather than
/// making every resolved user carry a track-sized hole.
#[derive(Deserialize)]
#[serde(tag = "kind")]
enum RawResolved {
    #[serde(rename = "track")]
    Track(Box<RawTrack>),
    #[serde(rename = "user")]
    User(RawUser),
    #[serde(rename = "playlist")]
    Playlist(Box<RawPlaylist>),
}

/// Resolve a `soundcloud.com` URL.
///
/// Only SoundCloud's own hosts are accepted: this takes a URL from the
/// clipboard and hands it to a request, so the host is checked rather than
/// trusted. `on.soundcloud.com` short links (what the share sheet produces)
/// resolve fine — SoundCloud follows them itself.
pub async fn resolve(token: Option<&str>, url: &str) -> Result<Resolved, ScApiError> {
    let url = url.trim();
    let host_ok = [
        "https://soundcloud.com/",
        "https://on.soundcloud.com/",
        "https://m.soundcloud.com/",
    ]
    .iter()
    .any(|prefix| url.starts_with(prefix));
    if !host_ok {
        return Err(ScApiError::NotSoundCloudUrl);
    }

    let cid = client_id::get(false).await?;
    let client = http_client()?;

    let mut req = client
        .get(format!("{API_V2}/resolve"))
        .query(&[("url", url), ("client_id", cid.as_str())]);
    if let Some(token) = token {
        req = req.header("Authorization", format!("OAuth {token}"));
    }

    let raw: RawResolved = req.send().await?.error_for_status()?.json().await?;

    Ok(match raw {
        RawResolved::Track(t) => Resolved::Track(Track::from(*t)),
        RawResolved::User(u) => Resolved::User(User::from(u)),
        RawResolved::Playlist(p) => Resolved::Playlist(Playlist::from(*p)),
    })
}
