//! Android-specific glue: the bridge to this app's Kotlin plugin.
//!
//! Three things on Android have no portable Rust answer, so they live in Kotlin
//! (`gen/android/app/src/main/java/com/cloudifyplayer/app/`) and are reached
//! from here:
//!
//!   - **Secure storage.** The `keyring` crate has no Android backend. The
//!     platform equivalent is `EncryptedSharedPreferences`, whose master key is
//!     held in the hardware-backed Android Keystore — see `SecureStore.kt`.
//!   - **Sign-in.** Tauri cannot open a second window on mobile, so SoundCloud's
//!     sign-in page is shown by a native `WebView`, which can also read the
//!     `oauth_token` cookie back out of `CookieManager` — see `LoginActivity.kt`.
//!   - **Background playback.** Android stops handing CPU to a backgrounded
//!     WebView, which for a music player means audio dying on screen-off. A
//!     foreground service with a `MediaSession` keeps the process alive and puts
//!     real transport controls on the lock screen — see `PlaybackService.kt`.
//!
//! The plugin handle is stashed in a `OnceLock` rather than threaded through
//! every call site: `auth::load_token` is reached from a couple of dozen
//! commands that have no reason to know an `AppHandle` exists.

use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Wry,
};

use crate::media::NowPlaying;

/// Package the Kotlin plugin class lives in — the app's own identifier, since
/// this is app-local code rather than a published Tauri plugin.
const PLUGIN_PACKAGE: &str = "com.cloudifyplayer.app";
/// The `@TauriPlugin`-annotated class.
const PLUGIN_CLASS: &str = "CloudifyPlugin";
/// Plugin name, as seen from JS: events arrive as `plugin:cloudify|<event>`.
pub const PLUGIN_NAME: &str = "cloudify";

static HANDLE: OnceLock<PluginHandle<Wry>> = OnceLock::new();

#[derive(Debug, thiserror::Error)]
pub enum AndroidError {
    #[error("the Android plugin is not registered yet")]
    NotReady,

    #[error("android plugin error: {0}")]
    Plugin(String),
}

impl From<tauri::plugin::mobile::PluginInvokeError> for AndroidError {
    fn from(e: tauri::plugin::mobile::PluginInvokeError) -> Self {
        AndroidError::Plugin(e.to_string())
    }
}

/// The Tauri plugin whose only job is to hand us a handle on the Kotlin side.
pub fn plugin() -> TauriPlugin<Wry> {
    Builder::new(PLUGIN_NAME)
        .setup(|_app, api| {
            let handle = api.register_android_plugin(PLUGIN_PACKAGE, PLUGIN_CLASS)?;
            // A second call would mean `setup` ran twice; the first handle stays
            // valid, so the extra one is simply dropped.
            let _ = HANDLE.set(handle);
            Ok(())
        })
        .build()
}

fn handle() -> Result<&'static PluginHandle<Wry>, AndroidError> {
    HANDLE.get().ok_or(AndroidError::NotReady)
}

/// Invoke a Kotlin `@Command`, blocking on the JNI round trip.
fn call<A, T>(command: &str, args: A) -> Result<T, AndroidError>
where
    A: Serialize,
    T: serde::de::DeserializeOwned,
{
    Ok(handle()?.run_mobile_plugin(command, args)?)
}

/// As [`call`], without blocking the async runtime's worker thread.
async fn call_async<A, T>(command: &str, args: A) -> Result<T, AndroidError>
where
    A: Serialize,
    T: serde::de::DeserializeOwned,
{
    Ok(handle()?.run_mobile_plugin_async(command, args).await?)
}

/// Kotlin commands that report only success resolve with `null`, which no
/// struct deserialises from — `Value` accepts whatever they send.
type Ack = serde_json::Value;

// ---------------------------------------------------------------------------
// Secure storage
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetSecretArgs<'a> {
    key: &'a str,
    value: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeyArgs<'a> {
    key: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretResponse {
    /// `None` when nothing is stored — kept distinct from a stored empty string.
    #[serde(default)]
    value: Option<String>,
}

pub fn secret_set(key: &str, value: &str) -> Result<(), AndroidError> {
    call::<_, Ack>("setSecret", SetSecretArgs { key, value }).map(|_| ())
}

pub fn secret_get(key: &str) -> Result<Option<String>, AndroidError> {
    let response: SecretResponse = call("getSecret", KeyArgs { key })?;
    Ok(response.value.filter(|value| !value.is_empty()))
}

pub fn secret_delete(key: &str) -> Result<(), AndroidError> {
    call::<_, Ack>("deleteSecret", KeyArgs { key }).map(|_| ())
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/// State of the native sign-in WebView.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStatus {
    /// The captured `oauth_token`, once the user has signed in.
    #[serde(default)]
    pub token: Option<String>,
    /// The user dismissed the sign-in screen.
    #[serde(default)]
    pub cancelled: bool,
}

/// Show the native sign-in WebView. Returns as soon as it is on screen — the
/// token arrives later, via [`login_poll`].
///
/// Polling rather than one long-running call is deliberate: a sign-in can take
/// minutes (SSO, 2FA), and it mirrors how the desktop flows already work.
pub async fn login_start() -> Result<(), AndroidError> {
    call_async::<_, Ack>("startLogin", ()).await.map(|_| ())
}

pub async fn login_poll() -> Result<LoginStatus, AndroidError> {
    call_async("pollLogin", ()).await
}

/// Close the sign-in WebView if it is still up (timeout, or a token the API
/// rejected).
pub async fn login_cancel() -> Result<(), AndroidError> {
    call_async::<_, Ack>("cancelLogin", ()).await.map(|_| ())
}

// ---------------------------------------------------------------------------
// Window insets
// ---------------------------------------------------------------------------

/// Ask Kotlin to publish the system-bar insets as CSS custom properties.
///
/// `env(safe-area-inset-*)` is filled from the display cutout alone in Android's
/// webview, so the gesture bar is invisible to it — see
/// `MainActivity.publishInsets`. The frontend calls this once it has mounted,
/// which is the first moment there is a document to write them into.
pub async fn insets_sync() -> Result<(), AndroidError> {
    call_async::<_, Ack>("syncInsets", ()).await.map(|_| ())
}

// ---------------------------------------------------------------------------
// Background playback
// ---------------------------------------------------------------------------

/// Start, or update, the foreground service backing playback.
pub async fn playback_update(state: NowPlaying) -> Result<(), AndroidError> {
    call_async::<_, Ack>("updatePlayback", state)
        .await
        .map(|_| ())
}

/// Tear the service and its notification down — playback has stopped for good.
pub async fn playback_stop() -> Result<(), AndroidError> {
    call_async::<_, Ack>("stopPlayback", ()).await.map(|_| ())
}
