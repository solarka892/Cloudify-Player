import { create } from "zustand";
import type { Playlist, Track, User } from "@/lib/tauri";
import type { ViewId } from "@/components/shell/nav-items";

/**
 * Where the app is: which tab, and what is drilled into on top of it.
 *
 * The current tab lives here rather than in `App`'s state because navigation
 * is no longer something only the nav bar does — a notification opens a track,
 * a profile opens a conversation, a pasted link opens whatever it resolves to.
 * Threading a callback down to each of those was the alternative.
 */
interface Opened {
  id: number;
  title: string;
  subtitle: string | null;
  /** soundcloud.com page for it, for the share button. */
  url: string | null;
}

export type Detail =
  | ({ kind: "playlist" } & Opened)
  | ({ kind: "user" } & Opened)
  | ({ kind: "track" } & Opened);

interface NavState {
  view: ViewId;
  detail: Detail | null;
  /** Whether the full-screen player is up. Lives here so a hotkey can toggle it. */
  nowPlaying: boolean;
  /** Bumped to ask the search view to focus its input. */
  searchFocusToken: number;
  /**
   * A conversation the messages view should open when it mounts. Set by the
   * "Message" button on a profile, cleared once the view has honoured it.
   */
  pendingThread: User | null;
  /**
   * A query the search view should run when it mounts. Set by tag chips and
   * by "find more like this" affordances elsewhere in the app.
   */
  pendingQuery: string | null;

  setView: (view: ViewId) => void;
  openSearch: (query: string) => void;
  openPlaylist: (playlist: Playlist) => void;
  openUser: (user: User) => void;
  openTrack: (track: Track) => void;
  openThread: (user: User) => void;
  clearPendingThread: () => void;
  clearPendingQuery: () => void;
  back: () => void;
  setNowPlaying: (open: boolean) => void;
  requestSearchFocus: () => void;
}

export const useNavStore = create<NavState>((set) => {
  /**
   * Go somewhere, dismissing the full-screen player on the way.
   *
   * It is an overlay, not a view, and on a phone the tab bar stays reachable
   * underneath it — so tapping a tab used to change the view behind a player
   * that stayed put, which reads as the app being stuck on it. Every route in
   * here is a reason to close it, including the artist and track links inside
   * the player itself: they would otherwise navigate somewhere invisible.
   */
  const go = (patch: Partial<NavState>) => set({ nowPlaying: false, ...patch });

  return {
    view: "home",
    detail: null,
    nowPlaying: false,
    searchFocusToken: 0,
    pendingThread: null,
    pendingQuery: null,

    // Leaving a tab abandons whatever was drilled into on it.
    setView: (view) => go({ view, detail: null }),

    openSearch: (query) =>
      go({ view: "search", detail: null, pendingQuery: query }),

    openPlaylist: (playlist) =>
      go({
        detail: {
          kind: "playlist",
          id: playlist.id,
          title: playlist.title,
          subtitle: playlist.owner,
          url: playlist.permalink_url,
        },
      }),

    openUser: (user) =>
      go({
        detail: {
          kind: "user",
          id: user.id,
          title: user.username,
          subtitle: null,
          url: user.permalink_url,
        },
      }),

    openTrack: (track) =>
      go({
        detail: {
          kind: "track",
          id: track.id,
          title: track.title,
          subtitle: track.artist,
          url: track.permalink_url,
        },
      }),

    openThread: (user) =>
      go({ view: "messages", detail: null, pendingThread: user }),
    clearPendingThread: () => set({ pendingThread: null }),
    clearPendingQuery: () => set({ pendingQuery: null }),

    back: () => set({ detail: null }),
    setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    requestSearchFocus: () =>
      set((state) => ({ searchFocusToken: state.searchFocusToken + 1 })),
  };
});
