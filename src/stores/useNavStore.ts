import { create } from "zustand";
import type { Playlist, User } from "@/lib/tauri";

/**
 * One level of drill-down on top of the main tabs.
 *
 * Playlists and users can be opened from several places (library, search
 * results), so "what is open" lives in a store rather than being threaded
 * through every list component.
 */
export type Detail =
  | { kind: "playlist"; id: number; title: string; subtitle: string | null }
  | { kind: "user"; id: number; title: string; subtitle: string | null };

interface NavState {
  detail: Detail | null;
  openPlaylist: (playlist: Playlist) => void;
  openUser: (user: User) => void;
  back: () => void;
}

export const useNavStore = create<NavState>((set) => ({
  detail: null,

  openPlaylist: (playlist) =>
    set({
      detail: {
        kind: "playlist",
        id: playlist.id,
        title: playlist.title,
        subtitle: playlist.owner,
      },
    }),

  openUser: (user) =>
    set({
      detail: {
        kind: "user",
        id: user.id,
        title: user.username,
        subtitle: null,
      },
    }),

  back: () => set({ detail: null }),
}));
