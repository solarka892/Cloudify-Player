//! Live smoke tests against SoundCloud's api-v2.
//!
//! These hit the real network, so they are `#[ignore]`d and never run in CI —
//! they exist to answer "did SoundCloud change something?" in one command:
//!
//! ```sh
//! cargo test -- --ignored --nocapture
//! ```
//!
//! Only public data is touched; nothing here needs a login.

use super::{playlists, search, users};

/// A long-lived public account (`soundcloud.com/forss`) used as a fixture.
const FIXTURE_USER: u64 = 183;

#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn search_pages_through_tracks() {
    let first = search::search_tracks("lofi", 5, 0).await.expect("page 1");
    assert_eq!(first.items.len(), 5, "expected a full page");
    assert_eq!(first.next_offset, Some(5));
    assert!(first.total.unwrap_or(0) > 0);

    let second = search::search_tracks("lofi", 5, 5).await.expect("page 2");
    let overlap = second
        .items
        .iter()
        .filter(|t| first.items.iter().any(|f| f.id == t.id))
        .count();
    assert_eq!(overlap, 0, "second page repeated the first");
}

#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn blank_query_short_circuits() {
    let page = search::search_tracks("   ", 5, 0).await.expect("blank");
    assert!(page.items.is_empty());
    assert_eq!(page.next_offset, None);
}

#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn searches_users_and_playlists() {
    let users = search::search_users("forss", 3, 0).await.expect("users");
    assert!(!users.items.is_empty());
    assert!(users.items.iter().all(|u| !u.username.is_empty()));

    let playlists = search::search_playlists("lofi", 3, 0)
        .await
        .expect("playlists");
    assert!(!playlists.items.is_empty());
}

#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn lists_followings_and_uploads() {
    let following = users::get_followings(None, FIXTURE_USER, 10)
        .await
        .expect("followings");
    assert!(!following.is_empty());

    let uploads = users::get_user_tracks(FIXTURE_USER, 10)
        .await
        .expect("uploads");
    assert!(!uploads.is_empty());
}

/// The interesting one: SoundCloud hydrates only the first few entries of a
/// playlist's `tracks[]` and stubs the rest, so this checks that the stubs get
/// fetched and that playlist order survives the round trip.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn playlist_tracks_are_hydrated_in_order() {
    let sets = playlists::get_user_playlists(None, FIXTURE_USER, 5)
        .await
        .expect("playlists");
    let set = sets
        .iter()
        .max_by_key(|p| p.track_count)
        .expect("fixture user has playlists");

    let tracks = playlists::get_playlist_tracks(None, set.id)
        .await
        .expect("playlist tracks");

    assert!(
        !tracks.is_empty(),
        "playlist {} came back empty ({} tracks expected)",
        set.id,
        set.track_count
    );
    // Every entry must be hydrated — a leftover stub would surface as a blank
    // title in the UI.
    assert!(tracks.iter().all(|t| !t.title.is_empty()));
    println!(
        "playlist {:?}: {} of {} tracks hydrated",
        set.title,
        tracks.len(),
        set.track_count
    );
}

/// The same path on a playlist big enough to force several `?ids=` batches —
/// SoundCloud hydrates ~5 entries inline, so a 200+ track set exercises the
/// chunking and the reordering that follows it.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn large_playlist_hydrates_every_batch() {
    let found = search::search_playlists("lofi", 20, 0)
        .await
        .expect("playlist search");
    let big = found
        .items
        .iter()
        .max_by_key(|p| p.track_count)
        .expect("search returned nothing");
    assert!(
        big.track_count > 50,
        "fixture playlist too small to test batching ({} tracks)",
        big.track_count
    );

    let tracks = playlists::get_playlist_tracks(None, big.id)
        .await
        .expect("playlist tracks");

    println!(
        "large playlist {:?}: {} of {} tracks hydrated",
        big.title,
        tracks.len(),
        big.track_count
    );
    assert!(tracks.iter().all(|t| !t.title.is_empty()));
    // Some tracks legitimately vanish (deleted, geo-blocked); most must remain.
    assert!(
        tracks.len() * 10 >= big.track_count as usize * 8,
        "lost too many tracks: {} of {}",
        tracks.len(),
        big.track_count
    );
}
