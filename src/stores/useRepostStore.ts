import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  scGetReposts,
  scRepostPlaylist,
  scRepostTrack,
  type Playlist,
  type Track,
} from "@/lib/tauri";

/**
 * What the signed-in user has reposted.
 *
 * SoundCloud has no "am I reposting this?" query, only a feed of everything
 * you have reposted — so the answer is a set, seeded once from that feed and
 * kept in step optimistically thereafter. It is persisted for the same reason
 * the likes list is: a restart should not blank every repost button until a
 * multi-page walk finishes.
 */

interface RepostState {
  /** Whose reposts these are; a different user invalidates them. */
  userId: number | null;
  trackIds: Set<number>;
  playlistIds: Set<number>;
  status: "idle" | "loading" | "ok" | "error";

  load: (userId: number, force?: boolean) => Promise<void>;
  toggleTrack: (track: Track) => Promise<void>;
  togglePlaylist: (playlist: Playlist) => Promise<void>;
}

export const useRepostStore = create<RepostState>()(
  persist(
    (set, get) => ({
      userId: null,
      trackIds: new Set<number>(),
      playlistIds: new Set<number>(),
      status: "idle",

      async load(userId, force = false) {
        const changedUser = get().userId !== userId;
        if (!force && !changedUser && get().status !== "idle") return;
        set({ status: "loading" });
        try {
          const mixed = await scGetReposts(userId);
          set({
            userId,
            trackIds: new Set(mixed.tracks.map((t) => t.id)),
            playlistIds: new Set(mixed.playlists.map((p) => p.id)),
            status: "ok",
          });
        } catch {
          // Leave whatever was persisted in place: a stale set is a better
          // guess than an empty one, and the buttons still work either way.
          set({ status: "error" });
        }
      },

      async toggleTrack(track) {
        const on = !get().trackIds.has(track.id);
        const next = new Set(get().trackIds);
        if (on) next.add(track.id);
        else next.delete(track.id);
        set({ trackIds: next });

        try {
          await scRepostTrack(track.id, on);
        } catch (e) {
          const reverted = new Set(get().trackIds);
          if (on) reverted.delete(track.id);
          else reverted.add(track.id);
          set({ trackIds: reverted });
          throw e;
        }
      },

      async togglePlaylist(playlist) {
        const on = !get().playlistIds.has(playlist.id);
        const next = new Set(get().playlistIds);
        if (on) next.add(playlist.id);
        else next.delete(playlist.id);
        set({ playlistIds: next });

        try {
          await scRepostPlaylist(playlist.id, on);
        } catch (e) {
          const reverted = new Set(get().playlistIds);
          if (on) reverted.delete(playlist.id);
          else reverted.add(playlist.id);
          set({ playlistIds: reverted });
          throw e;
        }
      },
    }),
    {
      name: "cloudify.reposts",
      version: 1,
      // Sets don't survive JSON; store ids as arrays and rebuild on load.
      partialize: (s) => ({
        userId: s.userId,
        trackIds: [...s.trackIds],
        playlistIds: [...s.playlistIds],
      }),
      merge: (persisted, current) => {
        const saved = persisted as {
          userId?: number | null;
          trackIds?: number[];
          playlistIds?: number[];
        };
        return {
          ...current,
          userId: saved?.userId ?? null,
          trackIds: new Set(saved?.trackIds ?? []),
          playlistIds: new Set(saved?.playlistIds ?? []),
        };
      },
    },
  ),
);
