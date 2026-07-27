//! SoundCloud internal `api-v2` client.
//!
//! ⚠️ ALL code that talks to SoundCloud lives under this module — nothing
//! elsewhere may construct SoundCloud URLs or hit the network for SC data
//! (CLAUDE.md hard rule). The rest of the app depends only on the domain
//! methods this module exposes (e.g. future `get_user_likes`), never on URLs.
//!
//! Design notes for resilience (SC can break us anytime — see CLAUDE.md):
//!   - Endpoint isolation: keep every path in one place.
//!   - Version each method so a fallback can be slotted in.
//!   - Log request/response on error WITHOUT secrets.
//!
//! Reverse-engineering notes & verified endpoints: `docs/sc-api.md`.

pub mod client_id;
