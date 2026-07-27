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
  /** Whether the full-screen player is up. Lives here so a hotkey can toggle it. */
  nowPlaying: boolean;
  /** Bumped to ask the search view to focus its input. */
  searchFocusToken: number;
  openPlaylist: (playlist: Playlist) => void;
  openUser: (user: User) => void;
  back: () => void;
  setNowPlaying: (open: boolean) => void;
  requestSearchFocus: () => void;
}

export const useNavStore = create<NavState>((set) => ({
  detail: null,
  nowPlaying: false,
  searchFocusToken: 0,

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
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  requestSearchFocus: () =>
    set((state) => ({ searchFocusToken: state.searchFocusToken + 1 })),
}));
