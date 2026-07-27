import { invoke } from "@tauri-apps/api/core";

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

/** Fetch the given user's liked tracks (first page). Requires login. */
export function scGetLikes(userId: number, limit?: number): Promise<Track[]> {
  return invoke<Track[]>("sc_get_likes", { userId, limit });
}

/**
 * Search tracks by free-text query. Public data — no login needed. A blank
 * query resolves to an empty list.
 */
export function scSearchTracks(
  query: string,
  limit?: number,
): Promise<Track[]> {
  return invoke<Track[]>("sc_search_tracks", { query, limit });
}

/**
 * Resolve a track to a directly-playable (progressive mp3) URL. The URL is
 * short-lived — resolve right before playback, don't cache.
 */
export function scGetStreamUrl(trackId: number): Promise<string> {
  return invoke<string>("sc_get_stream_url", { trackId });
}
