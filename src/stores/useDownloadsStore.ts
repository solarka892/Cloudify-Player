import { create } from "zustand";
import {
  clearDownloads,
  deleteDownload,
  downloadTrack,
  listDownloads,
  localFileUrl,
  onDownloadProgress,
  type DownloadedTrack,
  type Track,
} from "@/lib/tauri";

/**
 * The offline library.
 *
 * Files and their index live in Rust; this store mirrors them for the UI and
 * tracks in-flight downloads. The player asks it for a local URL before every
 * play, which is what makes offline playback work with no other changes.
 */

export interface ActiveDownload {
  trackId: number;
  title: string;
  received: number;
  total: number | null;
  /** Set when the download failed; the row stays so the user sees why. */
  error: string | null;
}

interface DownloadsState {
  items: DownloadedTrack[];
  /** Fast membership test for the download button on every row. */
  ids: Set<number>;
  active: Record<number, ActiveDownload>;
  status: "idle" | "loading" | "ok" | "error";
  error: string | null;

  /** True while a bulk download is walking a list. */
  bulkRunning: boolean;
  /** Set when the user asks a bulk download to stop. */
  cancelled: boolean;

  load: () => Promise<void>;
  start: (track: Track) => Promise<void>;
  remove: (trackId: number) => Promise<void>;
  /** Delete every downloaded file. Resolves with how many went. */
  clearAll: () => Promise<number>;
  /** Download a whole list, paced and interruptible. */
  startBulk: (tracks: Track[]) => Promise<{ done: number; failed: number }>;
  /** Ask the running bulk download to stop after the current track. */
  stopBulk: () => void;
  /** Forget a failed row so the list stops showing it. */
  dismiss: (trackId: number) => void;
  /** Local asset URL for a track, or `null` when it isn't downloaded. */
  localUrl: (trackId: number) => string | null;
}

/** Breathing room between tracks in a bulk download. */
const BULK_GAP_MS = 350;
const BULK_MAX_BACKOFF_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const useDownloadsStore = create<DownloadsState>((set, get) => {
  // One subscription for the whole app; Rust emits per-chunk progress.
  void onDownloadProgress(({ track_id, received, total }) => {
    const active = get().active[track_id];
    if (!active) return;
    set({
      active: { ...get().active, [track_id]: { ...active, received, total } },
    });
  });

  return {
    items: [],
    ids: new Set(),
    active: {},
    status: "idle",
    error: null,
    bulkRunning: false,
    cancelled: false,

    async load() {
      set({ status: "loading", error: null });
      try {
        const items = await listDownloads();
        set({
          items,
          ids: new Set(items.map((i) => i.id)),
          status: "ok",
        });
      } catch (e) {
        set({ status: "error", error: String(e) });
      }
    },

    async start(track) {
      if (get().ids.has(track.id) || get().active[track.id]) return;
      set({
        active: {
          ...get().active,
          [track.id]: {
            trackId: track.id,
            title: track.title,
            received: 0,
            total: null,
            error: null,
          },
        },
      });

      try {
        const done = await downloadTrack(track);
        const items = [done, ...get().items.filter((i) => i.id !== done.id)];
        const active = { ...get().active };
        delete active[track.id];
        set({ items, ids: new Set(items.map((i) => i.id)), active });
      } catch (e) {
        const current = get().active[track.id];
        if (!current) return;
        // Keep the row with its error rather than failing silently.
        set({
          active: {
            ...get().active,
            [track.id]: { ...current, error: String(e) },
          },
        });
      }
    },

    async remove(trackId) {
      await deleteDownload(trackId);
      const items = get().items.filter((i) => i.id !== trackId);
      const active = { ...get().active };
      delete active[trackId];
      set({ items, ids: new Set(items.map((i) => i.id)), active });
    },

    async clearAll() {
      const count = await clearDownloads();
      set({ items: [], ids: new Set(), active: {} });
      return count;
    },

    dismiss(trackId) {
      const active = { ...get().active };
      delete active[trackId];
      set({ active });
    },

    stopBulk() {
      set({ cancelled: true });
    },

    async startBulk(tracks) {
      if (get().bulkRunning) return { done: 0, failed: 0 };
      set({ bulkRunning: true, cancelled: false });

      let done = 0;
      let failed = 0;
      let consecutiveFailures = 0;

      for (const track of tracks) {
        if (get().cancelled) break;
        if (get().ids.has(track.id)) continue;

        await get().start(track);
        if (get().active[track.id]?.error) {
          failed += 1;
          consecutiveFailures += 1;
        } else {
          done += 1;
          consecutiveFailures = 0;
        }

        // SoundCloud throttles a client_id that fires hundreds of signing
        // requests back to back — which is how a bulk download takes playback
        // down with it. Pace normally, back off hard once failures stack up.
        const pause =
          consecutiveFailures === 0
            ? BULK_GAP_MS
            : Math.min(
                BULK_GAP_MS * 2 ** consecutiveFailures,
                BULK_MAX_BACKOFF_MS,
              );
        await sleep(pause);

        // Five refusals in a row is a wall, not bad luck.
        if (consecutiveFailures >= 5) break;
      }

      set({ bulkRunning: false, cancelled: false });
      return { done, failed };
    },

    localUrl(trackId) {
      const hit = get().items.find((i) => i.id === trackId);
      return hit ? localFileUrl(hit.path) : null;
    },
  };
});
