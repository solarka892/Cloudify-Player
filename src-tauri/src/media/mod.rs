//! Telling the OS what is playing.
//!
//! On desktop the webview's own Media Session API already reaches MPRIS and
//! SMTC, so there is nothing for Rust to do. On Android it is not optional: a
//! backgrounded WebView stops getting CPU, so without a foreground service the
//! audio dies the moment the screen goes off. That service is also what puts
//! transport controls on the lock screen.
//!
//! The frontend calls this on every track change and play/pause regardless of
//! platform; the no-op desktop path keeps that free of `if (isAndroid)`.

use serde::{Deserialize, Serialize};

/// What the lock screen and notification should show.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    /// Artwork URL, fetched natively: a notification needs a `Bitmap`, and the
    /// WebView's copy of the image is not reachable from the service.
    #[serde(default)]
    pub artwork_url: Option<String>,
    pub duration_ms: u64,
    pub position_ms: u64,
    pub playing: bool,
    /// Whether to offer next/previous, so the controls match the real queue.
    pub can_skip_next: bool,
    pub can_skip_previous: bool,
}

/// Start, or update, the OS-level playback session.
#[cfg(target_os = "android")]
pub async fn update(state: NowPlaying) -> Result<(), String> {
    crate::android::playback_update(state)
        .await
        .map_err(|e| e.to_string())
}

/// Tear the session down — playback has stopped for good.
#[cfg(target_os = "android")]
pub async fn stop() -> Result<(), String> {
    crate::android::playback_stop()
        .await
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "android"))]
pub async fn update(_state: NowPlaying) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "android"))]
pub async fn stop() -> Result<(), String> {
    Ok(())
}
