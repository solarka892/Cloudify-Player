//! How a failure crosses to the frontend.
//!
//! Everything here answers one question: when something goes wrong in Rust,
//! what does the web side actually receive?
//!
//! It used to receive a sentence — `map_err(|e| e.to_string())`, 104 times over.
//! That works right up until the frontend has to *decide* something, and then it
//! has only English prose to decide on. Two consequences, both real:
//!
//!   - the user is shown a diagnostic. `403 Forbidden` is the correct thing to
//!     write in a log and the wrong thing to put in front of somebody who wanted
//!     to hear a song;
//!   - the app cannot tell failures apart without matching on that prose, and
//!     the one distinction it most needs — "the network is down" against "your
//!     session is over" — decides whether it keeps the user signed in or throws
//!     them out. Getting that wrong is what task 23 was.
//!
//! So a failure crosses as two fields: a stable `kind` slug to branch and
//! translate on, and the full diagnostic `message`, which is still carried and
//! still worth showing — under "details", not instead of an explanation.
//!
//! Nothing here may carry a token or an `Authorization` header. The messages it
//! wraps are built from status codes and response bodies, and a token travels
//! only in a request header, so there is nothing to leak by construction — but
//! it is a hard project rule and this is the doorway it would leave by.

use serde::Serialize;

/// A failure, as the frontend receives it.
#[derive(Debug, Serialize)]
pub struct Failure {
    /// What kind of failure this is. See `ScApiError::kind`.
    pub kind: &'static str,
    /// The diagnostic, in English, for the details pane and the logs.
    pub message: String,
}

/// An error that can name its own kind.
///
/// A trait rather than one big match in this module: each error type knows what
/// its variants mean, and a central table would rot the moment a variant is
/// added somewhere else.
pub trait Kind {
    fn kind(&self) -> &'static str;
}

impl Kind for crate::sc_api::ScApiError {
    fn kind(&self) -> &'static str {
        // Defined next to the variants themselves, in `sc_api::error`.
        Self::kind(self)
    }
}

impl Kind for crate::auth::AuthError {
    fn kind(&self) -> &'static str {
        match self {
            #[cfg(not(target_os = "android"))]
            Self::Keyring(_) => "keyring",
            #[cfg(target_os = "android")]
            Self::Android(_) => "keyring",
            Self::Tauri(_) => "broken",
            // The user closed the window. Not a fault, and the frontend is
            // expected to say nothing at all about it.
            Self::Cancelled => "cancelled",
            Self::Timeout => "login-timeout",
            #[cfg(not(target_os = "android"))]
            Self::Browser(_) => "browser",
            #[cfg(target_os = "android")]
            Self::Rejected => "session-expired",
        }
    }
}

/// Wrap an error for the trip across the bridge.
///
/// Written to be used as `map_err(failure)` so the call sites stay as short as
/// the `map_err(|e| e.to_string())` they replace — a migration that makes every
/// command noisier does not get finished.
pub fn failure<E: Kind + std::fmt::Display>(e: E) -> Failure {
    Failure {
        kind: e.kind(),
        message: e.to_string(),
    }
}

/// A failure the Rust side states itself, with no underlying error to wrap.
pub fn stated(kind: &'static str, message: impl Into<String>) -> Failure {
    Failure {
        kind,
        message: message.into(),
    }
}
