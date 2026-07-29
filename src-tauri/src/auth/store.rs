//! Where the OAuth token lives, per platform.
//!
//! The rule from CLAUDE.md is that the token never touches a plain file. On
//! desktop that means the OS keyring. Android has no keyring the `keyring` crate
//! can reach, so the platform's own equivalent is used instead:
//! `EncryptedSharedPreferences`, whose master key lives in the hardware-backed
//! Android Keystore and never leaves it. See `crate::android` for the bridge.
//!
//! Both backends present the same three operations, so nothing above this module
//! needs a `cfg`.

use super::AuthError;

/// Identifies the app to the platform store. Android's store is already scoped
/// to the app, so only the keyring backend needs this.
#[cfg(not(target_os = "android"))]
const SERVICE: &str = "com.cloudifyplayer.app";
/// Identifies the secret within the app's store.
const ACCOUNT: &str = "soundcloud-oauth-token";

#[cfg(not(target_os = "android"))]
mod imp {
    use super::{AuthError, ACCOUNT, SERVICE};

    use keyring::Entry;

    fn entry() -> Result<Entry, AuthError> {
        Ok(Entry::new(SERVICE, ACCOUNT)?)
    }

    pub fn set(token: &str) -> Result<(), AuthError> {
        Ok(entry()?.set_password(token)?)
    }

    pub fn get() -> Result<Option<String>, AuthError> {
        match entry()?.get_password() {
            Ok(token) => Ok(Some(token)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn delete() -> Result<(), AuthError> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg(target_os = "android")]
mod imp {
    use super::{AuthError, ACCOUNT};

    use crate::android;

    pub fn set(token: &str) -> Result<(), AuthError> {
        Ok(android::secret_set(ACCOUNT, token)?)
    }

    pub fn get() -> Result<Option<String>, AuthError> {
        Ok(android::secret_get(ACCOUNT)?)
    }

    pub fn delete() -> Result<(), AuthError> {
        Ok(android::secret_delete(ACCOUNT)?)
    }
}

pub use imp::{delete, get, set};
