import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Typed bridge to the Rust backend.
 *
 * The UI must NEVER touch the SoundCloud API or `invoke()` raw command names
 * directly — it goes through these wrappers only (see CLAUDE.md: "Frontend
 * вызывает только методы вроде getUserLikes()"). Add one function per Tauri
 * command; keep names domain-oriented, not endpoint-oriented.
 */

/** App version reported by the Rust core — smoke-tests the JS↔Rust bridge. */
export function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

/**
 * Auto-extract SoundCloud's `client_id` (cached 24h in the backend).
 * The returned value is secret-ish — mask it before showing/logging.
 */
export function getClientId(force = false): Promise<string> {
  return invoke<string>("get_client_id", { force });
}

/** The logged-in SoundCloud user (subset of the `/me` object). */
export interface Me {
  id: number;
  username: string;
  avatar_url: string | null;
  permalink_url: string | null;
  followers_count: number | null;
}

/** Open the embedded SC login window; resolves once the token is captured. */
export function scLogin(): Promise<void> {
  return invoke<void>("sc_login");
}

/**
 * Browser login: opens SoundCloud in the user's real browser and waits until
 * the oauth_token cookie appears in the browser's cookie store, then validates
 * and stores it. Resolves with the logged-in user.
 */
export function scLoginBrowser(): Promise<Me> {
  return invoke<Me>("sc_login_browser");
}

/** Remove the stored token. */
export function scLogout(): Promise<void> {
  return invoke<void>("sc_logout");
}

/** Whether a token is currently stored. */
export function scIsLoggedIn(): Promise<boolean> {
  return invoke<boolean>("sc_is_logged_in");
}

/** Fetch the logged-in user; rejects if not logged in or token invalid. */
export function scGetMe(): Promise<Me> {
  return invoke<Me>("sc_get_me");
}

/**
 * Manual login: validate + store a user-provided OAuth token. Reliable fallback
 * when the embedded login is blocked by a captcha. Rejects if the token is
 * invalid. Returns the logged-in user on success.
 */
export function scSetToken(token: string): Promise<Me> {
  return invoke<Me>("sc_set_token", { token });
}

/** Minimal track projection used across the library/player UI. */
export interface Track {
  id: number;
  /** Duration in milliseconds. */
  duration: number;
  title: string;
  artwork_url: string | null;
  permalink_url: string | null;
  artist: string | null;
}

/** A SoundCloud user (search result, following, …). */
export interface User {
  id: number;
  username: string;
  avatar_url: string | null;
  permalink_url: string | null;
  followers_count: number | null;
  track_count: number | null;
}

/** A playlist or album. */
export interface Playlist {
  id: number;
  title: string;
  track_count: number;
  artwork_url: string | null;
  permalink_url: string | null;
  owner: string | null;
  is_album: boolean;
}

/** One page of search results. `next_offset` is null at the end. */
export interface SearchPage<T> {
  items: T[];
  next_offset: number | null;
  total: number | null;
}

/** Fetch the given user's liked tracks (all pages). Requires login. */
export function scGetLikes(userId: number, limit?: number): Promise<Track[]> {
  return invoke<Track[]>("sc_get_likes", { userId, limit });
}

/** Fetch the given user's liked playlists and albums. Requires login. */
export function scGetLikedPlaylists(
  userId: number,
  limit?: number,
): Promise<Playlist[]> {
  return invoke<Playlist[]>("sc_get_liked_playlists", { userId, limit });
}

/** Fetch the playlists a user created. */
export function scGetPlaylists(
  userId: number,
  limit?: number,
): Promise<Playlist[]> {
  return invoke<Playlist[]>("sc_get_playlists", { userId, limit });
}

/** Fetch a playlist's tracks, in playlist order. */
export function scGetPlaylistTracks(playlistId: number): Promise<Track[]> {
  return invoke<Track[]>("sc_get_playlist_tracks", { playlistId });
}

/** Fetch the users someone follows. */
export function scGetFollowings(
  userId: number,
  limit?: number,
): Promise<User[]> {
  return invoke<User[]>("sc_get_followings", { userId, limit });
}

/** Fetch a user's uploaded tracks. */
export function scGetUserTracks(
  userId: number,
  limit?: number,
): Promise<Track[]> {
  return invoke<Track[]>("sc_get_user_tracks", { userId, limit });
}

/**
 * Search tracks. Public data — no login needed. A blank query resolves to an
 * empty page; page on with the returned `next_offset`.
 *
 * `filters` mirrors soundcloud.com's own narrowing controls; see
 * `SearchFilters`. A value Rust does not recognise is dropped rather than
 * sent, so a typo cannot silently return zero results.
 */
export function scSearchTracks(
  query: string,
  offset?: number,
  limit?: number,
  filters?: SearchFilters,
): Promise<SearchPage<Track>> {
  return invoke<SearchPage<Track>>("sc_search_tracks", {
    query,
    offset,
    limit,
    filterGenre: filters?.genre,
    filterDuration: filters?.duration,
    filterCreatedAt: filters?.createdAt,
    filterLicense: filters?.license,
  });
}

/** Search users. Public. */
export function scSearchUsers(
  query: string,
  offset?: number,
  limit?: number,
): Promise<SearchPage<User>> {
  return invoke<SearchPage<User>>("sc_search_users", { query, offset, limit });
}

/** Search playlists. Public. */
export function scSearchPlaylists(
  query: string,
  offset?: number,
  limit?: number,
): Promise<SearchPage<Playlist>> {
  return invoke<SearchPage<Playlist>>("sc_search_playlists", {
    query,
    offset,
    limit,
  });
}

/**
 * Resolve a track to a directly-playable (progressive mp3) URL. The URL is
 * short-lived — resolve right before playback, don't cache.
 */
export function scGetStreamUrl(trackId: number): Promise<string> {
  return invoke<string>("sc_get_stream_url", { trackId });
}

// ───────────────────────────────────────────────────────── discovery ────

/** A curated home-page row from SoundCloud. */
export interface Selection {
  id: string;
  title: string;
  playlists: Playlist[];
}

/** SoundCloud's own curated rows. Public. */
export function scMixedSelections(limit?: number): Promise<Selection[]> {
  return invoke<Selection[]>("sc_mixed_selections", { limit });
}

/** "More like this" for a track. Public — powers radio and autoplay. */
export function scRelatedTracks(
  trackId: number,
  limit?: number,
): Promise<Track[]> {
  return invoke<Track[]>("sc_related_tracks", { trackId, limit });
}

/** An endless station seeded by a track or an artist. Public. */
export function scStationTracks(
  seed: "track" | "artist",
  seedId: number,
  limit?: number,
): Promise<Track[]> {
  return invoke<Track[]>("sc_station_tracks", { seed, seedId, limit });
}

/** The logged-in user's feed: new uploads and reposts from who they follow. */
export function scStream(limit?: number): Promise<Track[]> {
  return invoke<Track[]>("sc_stream", { limit });
}

/** Recently played, newest first, de-duplicated. Requires login. */
export function scPlayHistory(limit?: number): Promise<Track[]> {
  return invoke<Track[]>("sc_play_history", { limit });
}

// ──────────────────────────────────────────────────────────── lyrics ────

export interface Lyrics {
  /** Raw LRC (`[mm:ss.xx] line`) when a synced transcription exists. */
  synced: string | null;
  plain: string | null;
  source: string;
}

/**
 * Lyrics from LRCLIB — the one non-SoundCloud service the app talks to.
 * Resolves to `null` when the track has none, which is common on SoundCloud.
 */
export function getLyrics(
  title: string,
  artist: string | null,
  durationMs?: number,
): Promise<Lyrics | null> {
  return invoke<Lyrics | null>("get_lyrics", { title, artist, durationMs });
}

// ───────────────────────────────────────────────────────── downloads ────

/** A track that lives on disk. Carries every `Track` field, plus location. */
export interface DownloadedTrack extends Track {
  path: string;
  bytes: number;
  /** Unix seconds. */
  downloaded_at: number;
}

/** Progress payload of the `download://progress` event. */
export interface DownloadProgress {
  track_id: number;
  received: number;
  total: number | null;
}

/** Download a track for offline playback. Progress arrives via `onDownloadProgress`. */
export function downloadTrack(track: Track): Promise<DownloadedTrack> {
  return invoke<DownloadedTrack>("download_track", { track });
}

/** Everything in the offline library, newest first. */
export function listDownloads(): Promise<DownloadedTrack[]> {
  return invoke<DownloadedTrack[]>("list_downloads");
}

/** Delete a downloaded track, file and index row. */
export function deleteDownload(trackId: number): Promise<void> {
  return invoke<void>("delete_download", { trackId });
}

/** Subscribe to download progress. Returns an unsubscribe function. */
export function onDownloadProgress(
  handler: (progress: DownloadProgress) => void,
): Promise<UnlistenFn> {
  return listen<DownloadProgress>("download://progress", (e) => handler(e.payload));
}

/**
 * Turn an absolute path into a URL the webview can play.
 * Requires `assetProtocol` in tauri.conf.json, which is enabled for app data.
 */
export function localFileUrl(path: string): string {
  return convertFileSrc(path);
}

// ────────────────────────────────────────────────────────── profiles ────

/** A full user page: what soundcloud.com shows in its profile header. */
export interface Profile {
  id: number;
  username: string;
  full_name: string | null;
  description: string | null;
  city: string | null;
  country_code: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  permalink_url: string | null;
  verified: boolean;
  followers_count: number | null;
  followings_count: number | null;
  track_count: number | null;
  playlist_count: number | null;
  likes_count: number | null;
}

/** Fetch a user's full profile. Public. */
export function scGetProfile(userId: number): Promise<Profile> {
  return invoke<Profile>("sc_get_profile", { userId });
}

// ──────────────────────────────────────────────────────────── actions ────

/** Like or unlike a track. Requires login. */
export function scLikeTrack(trackId: number, on: boolean): Promise<void> {
  return invoke<void>("sc_like_track", { trackId, on });
}

/** Like or unlike a playlist or album. Requires login. */
export function scLikePlaylist(playlistId: number, on: boolean): Promise<void> {
  return invoke<void>("sc_like_playlist", { playlistId, on });
}

/** Follow or unfollow a user. Requires login. */
export function scFollowUser(userId: number, on: boolean): Promise<void> {
  return invoke<void>("sc_follow_user", { userId, on });
}

/** Create a playlist, optionally seeded with tracks. Resolves with its id. */
export function scCreatePlaylist(
  title: string,
  trackIds: number[],
  isPublic = false,
): Promise<number> {
  return invoke<number>("sc_create_playlist", {
    title,
    trackIds,
    public: isPublic,
  });
}

/** Add a track to a playlist (read-modify-write on SoundCloud's side). */
export function scAddToPlaylist(
  playlistId: number,
  trackId: number,
): Promise<void> {
  return invoke<void>("sc_add_to_playlist", { playlistId, trackId });
}

/** Remove a track from a playlist. */
export function scRemoveFromPlaylist(
  playlistId: number,
  trackId: number,
): Promise<void> {
  return invoke<void>("sc_remove_from_playlist", { playlistId, trackId });
}

/** Fetch the users who follow someone. Public. */
export function scGetFollowers(
  userId: number,
  limit?: number,
): Promise<User[]> {
  return invoke<User[]>("sc_get_followers", { userId, limit });
}

/** Delete every downloaded track. Resolves with how many were removed. */
export function clearDownloads(): Promise<number> {
  return invoke<number>("clear_downloads");
}

// ────────────────────────────────────────────────────────── track pages ────

/** Everything a track page shows, beyond what a list row needs. */
export interface TrackDetail {
  id: number;
  title: string;
  duration: number;
  artwork_url: string | null;
  permalink_url: string | null;
  artist: string | null;
  user: User | null;
  description: string | null;
  genre: string | null;
  tags: string[];
  waveform_url: string | null;
  playback_count: number | null;
  likes_count: number | null;
  reposts_count: number | null;
  comment_count: number | null;
  created_at: string | null;
  license: string | null;
  purchase_url: string | null;
  purchase_title: string | null;
  /** The uploader allows downloading the original file. */
  downloadable: boolean;
  label_name: string | null;
}

/** A track's waveform: `samples` are heights in `0..=height`. */
export interface Waveform {
  width: number;
  height: number;
  samples: number[];
}

/** The full track object behind a track page. Public. */
export function scTrackDetail(trackId: number): Promise<TrackDetail> {
  return invoke<TrackDetail>("sc_track_detail", { trackId });
}

/** Users who liked a track. Public. */
export function scTrackLikers(
  trackId: number,
  limit?: number,
): Promise<User[]> {
  return invoke<User[]>("sc_track_likers", { trackId, limit });
}

/** Users who reposted a track. Public. */
export function scTrackReposters(
  trackId: number,
  limit?: number,
): Promise<User[]> {
  return invoke<User[]>("sc_track_reposters", { trackId, limit });
}

/** Playlists a track appears in. Public. */
export function scTrackInPlaylists(
  trackId: number,
  limit?: number,
): Promise<Playlist[]> {
  return invoke<Playlist[]>("sc_track_in_playlists", { trackId, limit });
}

/**
 * The uploader's original file, for tracks with downloads enabled — a
 * different thing from `downloadTrack`, which saves the streaming mp3.
 */
export function scTrackDownloadUrl(trackId: number): Promise<string> {
  return invoke<string>("sc_track_download_url", { trackId });
}

/** Waveform samples, from the URL on a track's detail object. */
export function scWaveform(url: string): Promise<Waveform> {
  return invoke<Waveform>("sc_waveform", { url });
}

// ─────────────────────────────────────────────────────────────── comments ────

/** A comment, pinned to a point in the track when `timestamp` is set. */
export interface Comment {
  id: number;
  body: string;
  /** Milliseconds into the track, or null for an untimed comment. */
  timestamp: number | null;
  created_at: string | null;
  user: User | null;
}

/** A track's comments, newest first. Public. */
export function scTrackComments(
  trackId: number,
  limit?: number,
): Promise<Comment[]> {
  return invoke<Comment[]>("sc_track_comments", { trackId, limit });
}

/** Post a comment, optionally pinned to a point in the track. */
export function scPostComment(
  trackId: number,
  body: string,
  timestampMs?: number | null,
): Promise<Comment> {
  return invoke<Comment>("sc_post_comment", { trackId, body, timestampMs });
}

/** Delete one of your own comments. */
export function scDeleteComment(commentId: number): Promise<void> {
  return invoke<void>("sc_delete_comment", { commentId });
}

// ─────────────────────────────────────────────────────────────── messages ────

/** A thread in the inbox. Threads are one-to-one on SoundCloud. */
export interface Conversation {
  user: User;
  last_message: string | null;
  last_at: string | null;
  unread: boolean;
}

/** One message in a thread. */
export interface Message {
  id: number | null;
  content: string;
  created_at: string | null;
  from_me: boolean;
  /** Messages can carry a track, which the UI renders playable. */
  track: Track | null;
}

/** The inbox, newest activity first. Requires login. */
export function scConversations(limit?: number): Promise<Conversation[]> {
  return invoke<Conversation[]>("sc_conversations", { limit });
}

/** How many threads are unread. Requires login. */
export function scUnreadMessages(): Promise<number> {
  return invoke<number>("sc_unread_messages");
}

/** One thread's messages, oldest first. Requires login. */
export function scConversation(
  userId: number,
  limit?: number,
): Promise<Message[]> {
  return invoke<Message[]>("sc_conversation", { userId, limit });
}

/** Send a message; creates the thread if there isn't one. Requires login. */
export function scSendMessage(userId: number, content: string): Promise<void> {
  return invoke<void>("sc_send_message", { userId, content });
}

/** Mark a thread read or unread. Requires login. */
export function scMarkConversation(
  userId: number,
  read: boolean,
): Promise<void> {
  return invoke<void>("sc_mark_conversation", { userId, read });
}

/** Delete a thread. Requires login. */
export function scDeleteConversation(userId: number): Promise<void> {
  return invoke<void>("sc_delete_conversation", { userId });
}

// ────────────────────────────────────────────────────────── notifications ────

/**
 * One line in the notifications list. `kind` is SoundCloud's own type string —
 * `track`, `playlist`, `track-repost`, `playlist-repost`, `comment`,
 * `favoriting`, `affiliation` (a follow).
 */
export interface Activity {
  kind: string;
  created_at: string | null;
  user: User | null;
  track: Track | null;
  playlist: Playlist | null;
  comment: string | null;
  comment_timestamp: number | null;
}

/** Likes, comments, follows and reposts on your things. Requires login. */
export function scNotifications(limit?: number): Promise<Activity[]> {
  return invoke<Activity[]>("sc_notifications", { limit });
}

// ─────────────────────────────────────────────────────── profile sections ────

/** Tracks and playlists together, for the endpoints that mix them. */
export interface Mixed {
  tracks: Track[];
  playlists: Playlist[];
}

/** Albums a user released. Public. */
export function scGetAlbums(
  userId: number,
  limit?: number,
): Promise<Playlist[]> {
  return invoke<Playlist[]>("sc_get_albums", { userId, limit });
}

/** A user's most-played tracks. Public. */
export function scGetTopTracks(
  userId: number,
  limit?: number,
): Promise<Track[]> {
  return invoke<Track[]>("sc_get_top_tracks", { userId, limit });
}

/** What a user pinned to the top of their profile. Public. */
export function scGetSpotlight(userId: number, limit?: number): Promise<Mixed> {
  return invoke<Mixed>("sc_get_spotlight", { userId, limit });
}

/** What a user reposted. Public. */
export function scGetReposts(userId: number, limit?: number): Promise<Mixed> {
  return invoke<Mixed>("sc_get_reposts", { userId, limit });
}

/** Artists SoundCloud considers similar. Public. */
export function scGetRelatedArtists(
  userId: number,
  limit?: number,
): Promise<User[]> {
  return invoke<User[]>("sc_get_related_artists", { userId, limit });
}

// ─────────────────────────────────────────────────── browse & link paste ────

/** Newest tracks carrying a tag — SoundCloud's genre pages. Public. */
export function scTagTracks(tag: string, limit?: number): Promise<Track[]> {
  return invoke<Track[]>("sc_tag_tracks", { tag, limit });
}

/** Whatever a pasted soundcloud.com link turned out to be. */
export type Resolved =
  | ({ kind: "track" } & Track)
  | ({ kind: "user" } & User)
  | ({ kind: "playlist" } & Playlist);

/** Resolve a soundcloud.com link. Rejects anything that isn't one. */
export function scResolve(url: string): Promise<Resolved> {
  return invoke<Resolved>("sc_resolve", { url });
}

// ─────────────────────────────────────── search: albums, all, autocomplete ────

/** One entry in an "Everything" result set. */
export type SearchMixed =
  | ({ kind: "track" } & Track)
  | ({ kind: "user" } & User)
  | ({ kind: "playlist" } & Playlist)
  | { kind: "unknown" };

/** How SoundCloud's own result filters narrow a track search. */
export interface SearchFilters {
  genre?: string;
  duration?: "short" | "medium" | "long" | "epic";
  createdAt?: "last_hour" | "last_day" | "last_week" | "last_month" | "last_year";
  license?: "to_share" | "to_modify_commercially" | "to_use_commercially";
}

/** Search albums. Distinct from playlists on SoundCloud. Public. */
export function scSearchAlbums(
  query: string,
  offset?: number,
  limit?: number,
): Promise<SearchPage<Playlist>> {
  return invoke<SearchPage<Playlist>>("sc_search_albums", {
    query,
    offset,
    limit,
  });
}

/** "Everything": tracks, users and playlists in one ranked list. Public. */
export function scSearchAll(
  query: string,
  offset?: number,
  limit?: number,
): Promise<SearchPage<SearchMixed>> {
  return invoke<SearchPage<SearchMixed>>("sc_search_all", {
    query,
    offset,
    limit,
  });
}

/** Autocomplete suggestions for the search box. Public. */
export function scSearchSuggest(
  query: string,
  limit?: number,
): Promise<string[]> {
  return invoke<string[]>("sc_search_suggest", { query, limit });
}

// ──────────────────────────────────────────── reposts & playlist editing ────

/** Repost or un-repost a track. Requires login. */
export function scRepostTrack(trackId: number, on: boolean): Promise<void> {
  return invoke<void>("sc_repost_track", { trackId, on });
}

/** Repost or un-repost a playlist or album. Requires login. */
export function scRepostPlaylist(
  playlistId: number,
  on: boolean,
): Promise<void> {
  return invoke<void>("sc_repost_playlist", { playlistId, on });
}

/**
 * Rename a playlist, change its description or visibility. Fields left
 * undefined are untouched — the track list included.
 */
export function scEditPlaylist(
  playlistId: number,
  changes: { title?: string; description?: string; public?: boolean },
): Promise<void> {
  return invoke<void>("sc_edit_playlist", {
    playlistId,
    title: changes.title,
    description: changes.description,
    public: changes.public,
  });
}

/** Delete a playlist. Requires login. */
export function scDeletePlaylist(playlistId: number): Promise<void> {
  return invoke<void>("sc_delete_playlist", { playlistId });
}

/**
 * Set a playlist's tracks outright — how reordering and bulk removal work,
 * since SoundCloud replaces the whole list on every edit.
 */
export function scSetPlaylistTracks(
  playlistId: number,
  trackIds: number[],
): Promise<void> {
  return invoke<void>("sc_set_playlist_tracks", { playlistId, trackIds });
}
