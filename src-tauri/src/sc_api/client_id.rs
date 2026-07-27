//! `client_id` auto-extraction (MVP #3).
//!
//! SoundCloud has no public API keys; we lift the `client_id` the web app
//! itself uses, out of its JS bundles. The approach is proven in
//! `recon/sc_recon.py` — this module ports it to Rust.
//!
//! Flow (see docs/sc-api.md):
//!   1. GET https://soundcloud.com/ with a browser User-Agent.
//!   2. Extract `<script src="...js">` bundle URLs.
//!   3. Fetch bundles (last-first) and regex `client_id\s*[:=]\s*"([A-Za-z0-9]{20,})"`.
//!   4. Cache the value; on 401/403 from api-v2, re-extract.
//!
//! NOT YET IMPLEMENTED — this is the next task. Implementing it will add
//! `reqwest` + `regex` to Cargo.toml (currently commented out there). The
//! resulting value is a secret-ish rotating token: never log it, never commit
//! it, never write it to a plain file (CLAUDE.md rules).

// TODO(next): implement `pub async fn fetch() -> Result<String, Error>` and an
// in-memory cache with a 24h validity check.
