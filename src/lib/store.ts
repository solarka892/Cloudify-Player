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

/**
 * Report tracks the API was asked for and did not return.
 *
 * Returns the URNs that became tombstones on this call, which is never on the
 * first report — see `MISSES_BEFORE_GONE`.
 */
export function cacheMarkMissing(ids: number[]): Promise<string[]> {
  return invoke<string[]>("cache_mark_missing", { ids });
}

export function cacheGoneTracks(): Promise<StoredTrack[]> {
  return invoke<StoredTrack[]>("cache_gone_tracks");
}

export function cacheTrack(trackId: number): Promise<StoredTrack | null> {
  return invoke<StoredTrack | null>("cache_track", { trackId });
}

/** Marks-per-track and tombstones, keyed by track id. One query, one call. */
export interface RowFacts {
  marks: Record<string, number>;
  gone: Record<string, number>;
}

export function cacheRowFacts(): Promise<RowFacts> {
  return invoke<RowFacts>("cache_row_facts");
}

/** Search the mirror: offline, transliterated, notes included. */
export function cacheSearch(query: string, limit = 50): Promise<SearchHit[]> {
  return invoke<SearchHit[]>("cache_search", { query, limit });
}

// ──────────────────────────────────────────────────────────────── marks ────

export function marksList(trackId: number): Promise<Mark[]> {
  return invoke<Mark[]>("marks_list", { trackId });
}

export function marksAll(limit = 500): Promise<[Mark, StoredTrack | null][]> {
  return invoke<[Mark, StoredTrack | null][]>("marks_all", { limit });
}

export function marksAdd(
  trackId: number,
  positionMs: number,
  note?: string | null,
): Promise<Mark> {
  return invoke<Mark>("marks_add", {
    trackId,
    positionMs: Math.round(positionMs),
    note: note ?? null,
  });
}

export function marksUpdate(
  id: number,
  note: string | null,
  positionMs?: number,
): Promise<void> {
  return invoke<void>("marks_update", { id, note, positionMs });
}

export function marksDelete(id: number): Promise<void> {
  return invoke<void>("marks_delete", { id });
}

export function marksExport(): Promise<string> {
  return invoke<string>("marks_export");
}

// ──────────────────────────────────────────────────────────────── later ────

export function laterList(): Promise<LaterItem[]> {
  return invoke<LaterItem[]>("later_list");
}

export function laterAdd(
  track: Track,
  source: "manual" | "trap" | "search",
): Promise<void> {
  return invoke<void>("later_add", { track, source });
}

export function laterRemove(trackId: number): Promise<void> {
  return invoke<void>("later_remove", { trackId });
}

/** "Yes, still want this" — pushes the question further out. */
export function laterKeep(trackId: number): Promise<void> {
  return invoke<void>("later_keep", { trackId });
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

// ─────────────────────────────────────────────────────────────── thread ────

/** The waveform behind the thread: local copy, else the CDN, else nothing. */
export function threadWaveform(
  trackId: number,
  waveformUrl?: string | null,
): Promise<CachedWaveform | null> {
  return invoke<CachedWaveform | null>("thread_waveform", {
    trackId,
    waveformUrl: waveformUrl ?? null,
  });
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

// ─────────────────────────────────────────────────────────── duplicates ────

export function dupesFind(): Promise<DuplicateGroup[]> {
  return invoke<DuplicateGroup[]>("dupes_find");
}

/** Hide locally. Nothing is unliked or deleted on SoundCloud, ever. */
export function dupesHide(ids: number[]): Promise<void> {
  return invoke<void>("dupes_hide", { ids });
}

export function dupesUndo(): Promise<number> {
  return invoke<number>("dupes_undo");
}

export function dupesHidden(): Promise<number[]> {
  return invoke<number[]>("dupes_hidden");
}

// ────────────────────────────────────────────────────────────── storage ────

export function storageReport(): Promise<StorageReport> {
  return invoke<StorageReport>("storage_report");
}

export function storageErase(id: string): Promise<void> {
  return invoke<void>("storage_erase", { id });
}
