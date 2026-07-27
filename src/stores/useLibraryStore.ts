import { create } from "zustand";
import { scGetLikes, type Track } from "@/lib/tauri";

/**
 * The user's library, cached for the lifetime of the session.
 *
 * Fetching likes walks every page of `/users/{id}/likes` and takes seconds on a
 * large account, so it must not re-run every time the view is mounted (e.g. on
 * every switch between the Library and Search tabs). The store keeps the result
 * in memory; `refreshLikes()` is the only way to re-fetch.
 *
 * A future SQLite-backed cache (`src-tauri/src/cache/`) would make this survive
 * restarts too — this store is the seam it would plug into.
 */

type LikesStatus = "idle" | "loading" | "ok" | "error";

interface LibraryState {
  /** Whose likes `tracks` holds; a different user invalidates the cache. */
  userId: number | null;
  tracks: Track[];
  status: LikesStatus;
  error: string | null;

  /** Fetch likes unless they're already loaded (or loading) for this user. */
  loadLikes: (userId: number) => Promise<void>;
  /** Re-fetch, discarding the cached list. */
  refreshLikes: (userId: number) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => {
  async function fetchLikes(userId: number): Promise<void> {
    set({ userId, status: "loading", error: null });
    try {
      const tracks = await scGetLikes(userId);
      // A logout/login as someone else while we were waiting wins.
      if (get().userId !== userId) return;
      set({ tracks, status: "ok" });
    } catch (e) {
      if (get().userId !== userId) return;
      set({ status: "error", error: String(e), tracks: [] });
    }
  }

  return {
    userId: null,
    tracks: [],
    status: "idle",
    error: null,

    async loadLikes(userId) {
      const { userId: cached, status } = get();
      const fresh = cached === userId && (status === "ok" || status === "loading");
      if (fresh) return;
      await fetchLikes(userId);
    },

    async refreshLikes(userId) {
      if (get().status === "loading") return;
      await fetchLikes(userId);
    },
  };
});
