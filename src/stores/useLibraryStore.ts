import { create } from "zustand";
import {
  scGetFollowings,
  scGetLikedPlaylists,
  scGetLikes,
  scGetPlaylists,
  type Playlist,
  type Track,
  type User,
} from "@/lib/tauri";

/**
 * The user's library, cached for the lifetime of the session.
 *
 * Each section walks every page of its endpoint and takes seconds on a large
 * account, so it must not re-run whenever a view is mounted (switching tabs
 * used to refetch the whole likes list). Sections load once per user; only an
 * explicit refresh re-fetches.
 *
 * A future SQLite-backed cache (`src-tauri/src/cache/`) would make this survive
 * restarts too — this store is the seam it would plug into.
 */

type Status = "idle" | "loading" | "ok" | "error";

export interface Section<T> {
  items: T[];
  status: Status;
  error: string | null;
}

const emptySection = <T>(): Section<T> => ({
  items: [],
  status: "idle",
  error: null,
});

interface LibraryState {
  /** Whose library is cached; a different user invalidates everything. */
  userId: number | null;
  likes: Section<Track>;
  /** Playlists the user created. */
  ownPlaylists: Section<Playlist>;
  likedPlaylists: Section<Playlist>;
  followings: Section<User>;

  /** Fetch unless already loaded (or loading) for this user. */
  loadLikes: (userId: number) => Promise<void>;
  loadPlaylists: (userId: number) => Promise<void>;
  loadFollowings: (userId: number) => Promise<void>;
  /** Re-fetch, discarding what's cached. */
  refreshLikes: (userId: number) => Promise<void>;
  refreshPlaylists: (userId: number) => Promise<void>;
  refreshFollowings: (userId: number) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  /** Drop every cached section when the logged-in user changes. */
  function ensureUser(userId: number) {
    if (get().userId === userId) return;
    set({
      userId,
      likes: emptySection(),
      ownPlaylists: emptySection(),
      likedPlaylists: emptySection(),
      followings: emptySection(),
    });
  }

  /** True when the section already holds (or is fetching) this user's data. */
  function isFresh(section: Section<unknown>, userId: number): boolean {
    return (
      get().userId === userId &&
      (section.status === "ok" || section.status === "loading")
    );
  }

  /**
   * Run `fetcher` into one or more sections. Late responses are dropped if the
   * user changed while the request was in flight.
   */
  async function fetchInto<T extends Partial<LibraryState>>(
    userId: number,
    keys: (keyof LibraryState)[],
    fetcher: () => Promise<T>,
  ): Promise<void> {
    ensureUser(userId);
    const loading = Object.fromEntries(
      keys.map((k) => [
        k,
        { ...(get()[k] as Section<unknown>), status: "loading", error: null },
      ]),
    );
    set(loading as Partial<LibraryState>);

    try {
      const result = await fetcher();
      if (get().userId !== userId) return;
      set(result);
    } catch (e) {
      if (get().userId !== userId) return;
      const failed = Object.fromEntries(
        keys.map((k) => [
          k,
          { items: [], status: "error", error: String(e) } as Section<unknown>,
        ]),
      );
      set(failed as Partial<LibraryState>);
    }
  }

  const loadLikesFor = (userId: number) =>
    fetchInto(userId, ["likes"], async () => ({
      likes: {
        items: await scGetLikes(userId),
        status: "ok" as const,
        error: null,
      },
    }));

  const loadPlaylistsFor = (userId: number) =>
    fetchInto(userId, ["ownPlaylists", "likedPlaylists"], async () => {
      const [own, liked] = await Promise.all([
        scGetPlaylists(userId),
        scGetLikedPlaylists(userId),
      ]);
      return {
        ownPlaylists: { items: own, status: "ok" as const, error: null },
        likedPlaylists: { items: liked, status: "ok" as const, error: null },
      };
    });

  const loadFollowingsFor = (userId: number) =>
    fetchInto(userId, ["followings"], async () => ({
      followings: {
        items: await scGetFollowings(userId),
        status: "ok" as const,
        error: null,
      },
    }));

  return {
    userId: null,
    likes: emptySection(),
    ownPlaylists: emptySection(),
    likedPlaylists: emptySection(),
    followings: emptySection(),

    async loadLikes(userId) {
      if (isFresh(get().likes, userId)) return;
      await loadLikesFor(userId);
    },
    async loadPlaylists(userId) {
      if (isFresh(get().ownPlaylists, userId)) return;
      await loadPlaylistsFor(userId);
    },
    async loadFollowings(userId) {
      if (isFresh(get().followings, userId)) return;
      await loadFollowingsFor(userId);
    },

    async refreshLikes(userId) {
      if (get().likes.status === "loading") return;
      await loadLikesFor(userId);
    },
    async refreshPlaylists(userId) {
      if (get().ownPlaylists.status === "loading") return;
      await loadPlaylistsFor(userId);
    },
    async refreshFollowings(userId) {
      if (get().followings.status === "loading") return;
      await loadFollowingsFor(userId);
    },
  };
});
