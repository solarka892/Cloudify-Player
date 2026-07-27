import { create } from "zustand";
import {
  scAddToPlaylist,
  scCreatePlaylist,
  scFollowUser,
  scGetFollowings,
  scLikeTrack,
  scGetLikedPlaylists,
  scGetLikes,
  scGetPlaylists,
  scPlayHistory,
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
  /** Recently played, newest first. */
  history: Section<Track>;
  /** Track ids the user has liked — the source of truth for every heart. */
  likedIds: Set<number>;
  /** User ids the user follows. */
  followingIds: Set<number>;

  /** Fetch unless already loaded (or loading) for this user. */
  loadLikes: (userId: number) => Promise<void>;
  loadPlaylists: (userId: number) => Promise<void>;
  loadFollowings: (userId: number) => Promise<void>;
  loadHistory: (userId: number) => Promise<void>;
  /** Re-fetch, discarding what's cached. */
  refreshLikes: (userId: number) => Promise<void>;
  refreshPlaylists: (userId: number) => Promise<void>;
  refreshFollowings: (userId: number) => Promise<void>;
  refreshHistory: (userId: number) => Promise<void>;

  /** Like or unlike, updating the UI first and reverting if the call fails. */
  toggleLike: (track: Track) => Promise<void>;
  /** Follow or unfollow, same optimistic treatment. */
  toggleFollow: (user: User) => Promise<void>;
  /** Add a track to an existing playlist and reflect it in the cached list. */
  addToPlaylist: (playlistId: number, track: Track) => Promise<void>;
  /** Create a playlist, seeded with `track` when given one. */
  createPlaylist: (title: string, track?: Track) => Promise<void>;
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
      history: emptySection(),
      likedIds: new Set(),
      followingIds: new Set(),
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
    fetchInto(userId, ["likes"], async () => {
      const items = await scGetLikes(userId);
      return {
        likes: { items, status: "ok" as const, error: null },
        likedIds: new Set(items.map((t) => t.id)),
      };
    });

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

  const loadHistoryFor = (userId: number) =>
    fetchInto(userId, ["history"], async () => ({
      history: {
        items: await scPlayHistory(),
        status: "ok" as const,
        error: null,
      },
    }));

  const loadFollowingsFor = (userId: number) =>
    fetchInto(userId, ["followings"], async () => {
      const items = await scGetFollowings(userId);
      return {
        followings: { items, status: "ok" as const, error: null },
        followingIds: new Set(items.map((u) => u.id)),
      };
    });

  return {
    userId: null,
    likes: emptySection(),
    ownPlaylists: emptySection(),
    likedPlaylists: emptySection(),
    followings: emptySection(),
    history: emptySection(),
    likedIds: new Set(),
    followingIds: new Set(),

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
    async loadHistory(userId) {
      if (isFresh(get().history, userId)) return;
      await loadHistoryFor(userId);
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
    async refreshHistory(userId) {
      if (get().history.status === "loading") return;
      await loadHistoryFor(userId);
    },

    async toggleLike(track) {
      const on = !get().likedIds.has(track.id);
      const ids = new Set(get().likedIds);
      const before = get().likes.items;

      // Optimistic: a heart that waits on a round trip feels broken.
      if (on) ids.add(track.id);
      else ids.delete(track.id);
      set({
        likedIds: ids,
        likes: {
          ...get().likes,
          items: on
            ? [track, ...before.filter((t) => t.id !== track.id)]
            : before.filter((t) => t.id !== track.id),
        },
      });

      try {
        await scLikeTrack(track.id, on);
      } catch (e) {
        const reverted = new Set(get().likedIds);
        if (on) reverted.delete(track.id);
        else reverted.add(track.id);
        set({
          likedIds: reverted,
          likes: { ...get().likes, items: before },
        });
        throw e;
      }
    },

    async toggleFollow(user) {
      const on = !get().followingIds.has(user.id);
      const ids = new Set(get().followingIds);
      const before = get().followings.items;

      if (on) ids.add(user.id);
      else ids.delete(user.id);
      set({
        followingIds: ids,
        followings: {
          ...get().followings,
          items: on
            ? [user, ...before.filter((u) => u.id !== user.id)]
            : before.filter((u) => u.id !== user.id),
        },
      });

      try {
        await scFollowUser(user.id, on);
      } catch (e) {
        const reverted = new Set(get().followingIds);
        if (on) reverted.delete(user.id);
        else reverted.add(user.id);
        set({
          followingIds: reverted,
          followings: { ...get().followings, items: before },
        });
        throw e;
      }
    },

    async addToPlaylist(playlistId, track) {
      await scAddToPlaylist(playlistId, track.id);
      // Keep the cached count honest without refetching the whole section.
      set({
        ownPlaylists: {
          ...get().ownPlaylists,
          items: get().ownPlaylists.items.map((p) =>
            p.id === playlistId ? { ...p, track_count: p.track_count + 1 } : p,
          ),
        },
      });
    },

    async createPlaylist(title, track) {
      const id = await scCreatePlaylist(title, track ? [track.id] : []);
      const userId = get().userId;
      set({
        ownPlaylists: {
          ...get().ownPlaylists,
          status: "ok",
          items: [
            {
              id,
              title,
              track_count: track ? 1 : 0,
              artwork_url: track?.artwork_url ?? null,
              permalink_url: null,
              owner: null,
              is_album: false,
            },
            ...get().ownPlaylists.items,
          ],
        },
      });
      // The server fills in artwork and the permalink; pick those up quietly.
      if (userId != null) void loadPlaylistsFor(userId);
    },
  };
});
