//! Authentication — OAuth flow, session, and secure token storage.
//!
//! Tokens live in the OS keyring (via the `keyring` crate), NEVER in a file or
//! in code (CLAUDE.md hard rule). Login happens through an in-app web window
//! showing SoundCloud's own OAuth form.
//!
//! NOT YET IMPLEMENTED — arrives with MVP #4.
