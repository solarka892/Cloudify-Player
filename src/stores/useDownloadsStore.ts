import { create } from "zustand";
import {
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

  load: () => Promise<void>;
  start: (track: Track) => Promise<void>;
  remove: (trackId: number) => Promise<void>;
  /** Local asset URL for a track, or `null` when it isn't downloaded. */
  localUrl: (trackId: number) => string | null;
}

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

    localUrl(trackId) {
      const hit = get().items.find((i) => i.id === trackId);
      return hit ? localFileUrl(hit.path) : null;
    },
  };
});
