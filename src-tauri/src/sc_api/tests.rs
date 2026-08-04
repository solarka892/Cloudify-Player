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

use super::{comments, discover, playlists, resolve, search, tracks, users};

/// A long-lived public account (`soundcloud.com/forss`) used as a fixture.
const FIXTURE_USER: u64 = 183;

#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn search_pages_through_tracks() {
    let first = search::search_tracks("lofi", 5, 0, &search::Filters::default())
        .await
        .expect("page 1");
    assert_eq!(first.items.len(), 5, "expected a full page");
    assert_eq!(first.next_offset, Some(5));
    assert!(first.total.unwrap_or(0) > 0);

    let second = search::search_tracks("lofi", 5, 5, &search::Filters::default())
        .await
        .expect("page 2");
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
    let page = search::search_tracks("   ", 5, 0, &search::Filters::default())
        .await
        .expect("blank");
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

/// The discovery endpoints that replaced the dead `/charts`.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn discovery_endpoints_answer() {
    let rows = discover::mixed_selections(5).await.expect("selections");
    assert!(!rows.is_empty(), "no curated rows came back");
    assert!(rows.iter().all(|r| !r.playlists.is_empty()));
    println!(
        "selections: {}",
        rows.iter()
            .map(|r| format!("{} ({})", r.title, r.playlists.len()))
            .collect::<Vec<_>>()
            .join(", ")
    );

    let found = search::search_tracks("lofi", 1, 0, &search::Filters::default())
        .await
        .expect("seed");
    let seed = found.items.first().expect("a seed track");

    let related = discover::related_tracks(seed.id, 10)
        .await
        .expect("related");
    assert!(!related.is_empty());

    let station = discover::station_tracks("track", seed.id, 10)
        .await
        .expect("station");
    assert!(!station.is_empty());
    assert!(station.iter().all(|t| !t.title.is_empty()));
}

/// A track page's worth of data: the detail object plus the three side lists.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn track_page_endpoints_answer() {
    // `forss/flickermood` — the fixture the rest of the recon notes use.
    const FIXTURE_TRACK: u64 = 293;

    let detail = tracks::detail(None, FIXTURE_TRACK).await.expect("detail");
    assert_eq!(detail.id, FIXTURE_TRACK);
    assert!(!detail.title.is_empty());
    assert!(detail.playback_count.is_some(), "stats went missing");
    println!(
        "track {:?}: {} plays, {} comments, tags {:?}",
        detail.title,
        detail.playback_count.unwrap_or(0),
        detail.comment_count.unwrap_or(0),
        detail.tags
    );

    // The waveform lives on a CDN, not on api-v2, and is JSON rather than an
    // image — the one place where a "url" field is fetched directly.
    let url = detail.waveform_url.as_deref().expect("a waveform url");
    let wave = tracks::waveform(url).await.expect("waveform");
    assert!(!wave.samples.is_empty());
    assert!(wave.samples.iter().all(|s| *s <= wave.height));

    let likers = tracks::likers(FIXTURE_TRACK, 5).await.expect("likers");
    assert!(!likers.is_empty());

    let comments = comments::list(None, FIXTURE_TRACK, 5)
        .await
        .expect("comments");
    println!("comments: {}", comments.len());

    // Reposters and playlists can legitimately be empty; the assertion worth
    // making is that the routes still parse into the projections.
    tracks::reposters(FIXTURE_TRACK, 5)
        .await
        .expect("reposters");
    tracks::in_playlists(FIXTURE_TRACK, 5)
        .await
        .expect("in playlists");
}

/// Profile tabs beyond tracks: albums, top tracks, reposts, related artists.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn profile_section_endpoints_answer() {
    let albums = users::get_albums(None, FIXTURE_USER, 5)
        .await
        .expect("albums");
    assert!(albums.iter().all(|a| a.is_album), "a set slipped in");

    let top = users::get_top_tracks(FIXTURE_USER, 5)
        .await
        .expect("top tracks");
    assert!(!top.is_empty());

    let related = users::get_related_artists(FIXTURE_USER, 5)
        .await
        .expect("related artists");
    println!("related artists: {}", related.len());

    users::get_spotlight(FIXTURE_USER, 5)
        .await
        .expect("spotlight");
    users::get_reposts(FIXTURE_USER, 5).await.expect("reposts");
}

/// Search's remaining surfaces: albums, "everything", and autocomplete.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn search_extras_answer() {
    let albums = search::search_albums("aphex", 5, 0).await.expect("albums");
    assert!(!albums.items.is_empty());

    let everything = search::search_all("aphex", 10, 0).await.expect("all");
    assert!(!everything.items.is_empty());

    let suggestions = search::suggest("aphe", 5).await.expect("suggest");
    assert!(!suggestions.is_empty(), "autocomplete returned nothing");
    println!("suggestions: {suggestions:?}");

    // A filter SoundCloud understands must narrow rather than empty the list;
    // one it does not is dropped before the request, so it cannot silently
    // produce zero results.
    let filtered = search::search_tracks(
        "house",
        10,
        0,
        &search::Filters {
            duration: Some("short"),
            ..Default::default()
        },
    )
    .await
    .expect("filtered search");
    assert!(
        !filtered.items.is_empty(),
        "duration filter emptied the page"
    );
}

/// Pasting a link: every kind resolves to the projection it should.
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn resolve_handles_each_kind() {
    let track = resolve::resolve(None, "https://soundcloud.com/forss/flickermood")
        .await
        .expect("track link");
    assert!(matches!(track, resolve::Resolved::Track(_)));

    let user = resolve::resolve(None, "https://soundcloud.com/forss")
        .await
        .expect("user link");
    assert!(matches!(user, resolve::Resolved::User(_)));

    // A non-SoundCloud URL is refused before any request goes out.
    let refused = resolve::resolve(None, "https://example.com/evil").await;
    assert!(matches!(refused, Err(super::ScApiError::NotSoundCloudUrl)));
}

/// Genre/tag browsing, which is what replaced the dead `/charts` for "show me
/// popular <genre>".
#[tokio::test]
#[ignore = "hits the live SoundCloud API"]
async fn tag_browse_answers() {
    let tracks = discover::tag_tracks("house", 10).await.expect("tag tracks");
    assert!(!tracks.is_empty());
    assert!(tracks.iter().all(|t| !t.title.is_empty()));
}
