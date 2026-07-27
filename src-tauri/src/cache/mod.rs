//! Local metadata cache (SQLite via `sqlx`).
//!
//! Caches track/playlist/user metadata so the UI stays responsive and we lean
//! less on the fragile api-v2. Signed CDN stream URLs are short-lived — do NOT
//! cache those (see docs/sc-api.md).
//!
//! NOT YET IMPLEMENTED.
