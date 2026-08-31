import { invoke } from "@tauri-apps/api/core";
import type { Track } from "./tauri";

/**
 * The local store, as the frontend sees it.
 *
 * Separate from `tauri.ts` on purpose. That file is the bridge to SoundCloud and
 * carries a warning at the top about never going around it; this one is the
 * bridge to a SQLite file on this machine that SoundCloud has never heard of.
 * Keeping them apart means "does this leave the computer?" is answered by which
 * module a call came from, which is the question the privacy screen makes a
 * promise about.
 *
 * Every function here is a thin wrapper over a command in `src-tauri/src/cache`.
 * None of them can fail in a way the interface should shout about: a missing
 * mark or an unmeasured track is a normal state, so failures resolve to empty
 * rather than throwing where that is the honest answer.
 */

/** A track as the mirror holds it, with what happened to it locally. */
export interface StoredTrack extends Track {
  urn: string;
  added_at: number;
  /** Unix seconds since which SoundCloud has stopped returning it. */
  gone_at: number | null;
  /** Hidden by the duplicate finder — locally, and reversibly. */
  hidden_at: number | null;
}

export interface SearchHit extends StoredTrack {
  /** Set when the hit came from a mark's note rather than from a title. */
  note: string | null;
  note_position_ms: number | null;
}

export interface Mark {
  id: number;
  track_urn: string;
  position_ms: number;
  note: string | null;
  created_at: number;
}

export interface LaterItem {
  track_urn: string;
  track_id: number;
  title: string;
  artist: string | null;
  added_at: number;
  source: "manual" | "trap" | "search" | string;
  expires_at: number | null;
}

export interface DiaryEntry {
  id: number;
  track_urn: string;
  track_id: number;
  title: string;
  artist: string | null;
  started_at: number;
  ended_at: number | null;
  position_ms: number;
  outcome: "playing" | "played" | "skipped" | "liked" | "marked" | string;
}

export interface DuplicateGroup {
  keep: StoredTrack;
  others: StoredTrack[];
}

export interface StorageReport {
  lines: { id: string; rows: number }[];
  bytes: number;
  path: string;
}

export interface CachedWaveform {
  samples: number[];
  height: number;
}

// ─────────────────────────────────────────────────────────── the mirror ────

/** Write what the API just returned into the local mirror. */
export function cacheSyncTracks(tracks: Track[]): Promise<number> {
  return invoke<number>("cache_sync_tracks", { tracks });
}


export function cacheTrack(trackId: number): Promise<StoredTrack | null> {
  return invoke<StoredTrack | null>("cache_track", { trackId });
}


/** Search the mirror: offline, transliterated, notes included. */
export function cacheSearch(query: string, limit = 50): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("cache_search", { query, limit });
}

// ──────────────────────────────────────────────────────────────── diary ────

export function diaryStart(track: Track): Promise<number> {
  return invoke<number>("diary_start", { track });
}

export function diaryFinish(
  id: number,
  outcome: "played" | "skipped" | "liked" | "marked",
  positionMs: number,
): Promise<void> {
  return invoke<void>("diary_finish", {
    id,
    outcome,
    positionMs: Math.round(positionMs),
  });
}

export function diaryList(limit = 500): Promise<DiaryEntry[]> {
  return invoke<DiaryEntry[]>("diary_list", { limit });
}

/** Drop entries older than the retention the user chose. 0 keeps everything. */
export function diaryPrune(keepDays: number): Promise<number> {
  return invoke<number>("diary_prune", { keepDays });
}

export function diaryClear(): Promise<void> {
  return invoke<void>("diary_clear");
}

// ───────────────────────────────────────────────────────────── loudness ────

export function loudnessGet(trackId: number): Promise<number | null> {
  return invoke<number | null>("loudness_get", { trackId });
}

export function loudnessSet(trackId: number, levelDb: number): Promise<void> {
  return invoke<void>("loudness_set", { trackId, levelDb });
}

// ───────────────────────────────────────────────────────────────── trap ────

export function linkDeclined(url: string): Promise<boolean> {
  return invoke<boolean>("link_declined", { url });
}

export function declineLink(url: string): Promise<void> {
  return invoke<void>("decline_link", { url });
}

// ────────────────────────────────────────────────────────── odds and ends ──

export function kvGet(key: string): Promise<string | null> {
  return invoke<string | null>("kv_get", { key });
}

export function kvSet(key: string, value: string): Promise<void> {
  return invoke<void>("kv_set", { key, value });
}

// ────────────────────────────────────────────────────────────── storage ────

export function storageReport(): Promise<StorageReport> {
  return invoke<StorageReport>("storage_report");
}

export function storageErase(id: string): Promise<void> {
  return invoke<void>("storage_erase", { id });
}
