import { create } from "zustand";
import type { Playlist, Track, User } from "@/lib/tauri";
/**
 * The app's top-level sheets.
 *
 * Declared here rather than beside the navigation that draws them: which sheets
 * exist is a fact about where the app can be, and the store is what holds that.
 * The old list lived next to an icon set in the shell, which meant deleting the
 * shell deleted the vocabulary every route was written in.
 */
export type ViewId =
  | "home"
  | "search"
  | "library"
  | "nit"
  | "messages"
  | "notifications"
  | "profile"
  | "settings";

/**
 * Where the app is: which tab, what is drilled into on top of it, and how you
 * got there.
 *
 * The current tab lives here rather than in `App`'s state because navigation
 * is no longer something only the nav bar does — a notification opens a track,
 * a profile opens a conversation, a pasted link opens whatever it resolves to.
 * Threading a callback down to each of those was the alternative.
 *
 * ## History
 *
 * `back` used to mean "clear the detail", which made the app's only route
 * backwards the one button that happened to be on screen: open a track from a
 * profile from a search result and the way out was three deliberate taps
 * forward. Every platform already has a gesture for this — the Android back
 * swipe, a mouse's fourth button, Alt+←, a swipe from the left edge — and all of
 * them want the same thing, so they all end up here (`hooks/useBackGesture`).
 *
 * The stack holds *where you were*, not where you are, and every route through
 * `go` pushes onto it. `forward` exists because a mouse that has a back button
 * has a forward one beside it and nothing else in the app would answer it.
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

/** One place the app has been: everything `back` has to put back. */
interface Entry {
  view: ViewId;
  detail: Detail | null;
}

/**
 * How many steps back the app remembers.
 *
 * Deep enough that nobody reaches the end of it in a session, small enough that
 * the list is never worth thinking about. Entries are tiny — a string and a
 * four-field object.
 */
const HISTORY_LIMIT = 100;

interface NavState {
  view: ViewId;
  detail: Detail | null;
  /** Where we have been, oldest first. The current place is *not* in here. */
  past: Entry[];
  /** Places stepped back out of, most recent first. Cleared by any new route. */
  future: Entry[];
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
  /**
   * A tab the Nit view should open on. Set by anything elsewhere in the app
   * that has said "there is something here" and needs to be able to show it —
   * the library's duplicates strip is the first.
   */
  pendingNitTab: string | null;

  setView: (view: ViewId) => void;
  /** Go to Nit, on a named tab. */
  openNit: (tab: string) => void;
  openSearch: (query: string) => void;
  openPlaylist: (playlist: Playlist) => void;
  openUser: (user: User) => void;
  openTrack: (track: Track) => void;
  openThread: (user: User) => void;
  clearPendingThread: () => void;
  clearPendingQuery: () => void;
  clearPendingNitTab: () => void;
  /**
   * Go back one step. Returns false when there was nowhere to go — which is what
   * tells Android's back gesture it may leave the app.
   */
  back: () => boolean;
  forward: () => boolean;
  setNowPlaying: (open: boolean) => void;
  requestSearchFocus: () => void;
}

/** Whether two places are the same place, so back never repeats itself. */
function same(a: Entry, b: Entry): boolean {
  return (
    a.view === b.view &&
    a.detail?.kind === b.detail?.kind &&
    a.detail?.id === b.detail?.id
  );
}

export const useNavStore = create<NavState>((set, get) => {
  /**
   * Go somewhere, remembering where we were and dismissing the full-screen
   * player on the way.
   *
   * It is an overlay, not a view, and on a phone the tab bar stays reachable
   * underneath it — so tapping a tab used to change the view behind a player
   * that stayed put, which reads as the app being stuck on it. Every route in
   * here is a reason to close it, including the artist and track links inside
   * the player itself: they would otherwise navigate somewhere invisible.
   */
  const go = (patch: Partial<NavState>) => {
    const { view, detail, past } = get();
    const from: Entry = { view, detail };
    const to: Entry = { view: patch.view ?? view, detail: patch.detail ?? null };

    set({
      nowPlaying: false,
      // Landing where you already are is not a step, and recording it would
      // make back a no-op that looks like a stuck button.
      past: same(from, to) ? past : [...past, from].slice(-HISTORY_LIMIT),
      // Branching off abandons whatever you had stepped back out of, exactly as
      // a browser does.
      future: same(from, to) ? get().future : [],
      ...patch,
    });
  };

  return {
    view: "home",
    detail: null,
    past: [],
    future: [],
    nowPlaying: false,
    searchFocusToken: 0,
    pendingThread: null,
    pendingQuery: null,
    pendingNitTab: null,

    // Leaving a tab abandons whatever was drilled into on it.
    setView: (view) => go({ view, detail: null }),

    openNit: (tab) => go({ view: "nit", detail: null, pendingNitTab: tab }),

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
    clearPendingNitTab: () => set({ pendingNitTab: null }),

    back() {
      // The full-screen player is the topmost thing on screen and the one every
      // user expects back to close first — it is a sheet over the app, not a
      // place in it, so it is not on the stack.
      if (get().nowPlaying) {
        set({ nowPlaying: false });
        return true;
      }

      const { past, future, view, detail } = get();
      const previous = past[past.length - 1];
      if (!previous) return false;

      set({
        view: previous.view,
        detail: previous.detail,
        past: past.slice(0, -1),
        future: [{ view, detail }, ...future].slice(0, HISTORY_LIMIT),
      });
      return true;
    },

    forward() {
      const { past, future, view, detail } = get();
      const next = future[0];
      if (!next) return false;

      set({
        view: next.view,
        detail: next.detail,
        past: [...past, { view, detail }].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        nowPlaying: false,
      });
      return true;
    },

    setNowPlaying: (nowPlaying) => set({ nowPlaying }),
    requestSearchFocus: () =>
      set((state) => ({ searchFocusToken: state.searchFocusToken + 1 })),
  };
});

/** Whether `back` would do anything. Read by the Android back gesture. */
export function canGoBack(state: NavState): boolean {
  return state.nowPlaying || state.past.length > 0;
}
