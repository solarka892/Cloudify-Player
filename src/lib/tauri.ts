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
 */
export function scSearchTracks(
  query: string,
  offset?: number,
  limit?: number,
): Promise<SearchPage<Track>> {
  return invoke<SearchPage<Track>>("sc_search_tracks", {
    query,
    offset,
    limit,
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
