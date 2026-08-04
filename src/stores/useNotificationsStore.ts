import { create } from "zustand";
import { scNotifications, type Activity } from "@/lib/tauri";

/**
 * The notifications feed.
 *
 * SoundCloud has no "mark as seen" endpoint that survived probing, so "new
 * since last look" is tracked locally: the newest `created_at` the user has
 * actually seen is remembered, and anything after it counts as unread. That is
 * enough for a badge, and it is honest about being a local notion.
 */

const SEEN_KEY = "cloudify.notifications.seenAt";

type Status = "idle" | "loading" | "ok" | "error";

function loadSeenAt(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

interface NotificationsState {
  items: Activity[];
  status: Status;
  error: string | null;
  /** ISO timestamp of the newest entry the user has looked at. */
  seenAt: string | null;

  load: (force?: boolean) => Promise<void>;
  /** Called when the view is opened: everything currently listed is now seen. */
  markSeen: () => void;
  unreadCount: () => number;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  items: [],
  status: "idle",
  error: null,
  seenAt: loadSeenAt(),

  async load(force = false) {
    if (!force && (get().status === "loading" || get().status === "ok")) return;
    set({ status: "loading", error: null });
    try {
      set({ items: await scNotifications(), status: "ok" });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  markSeen() {
    const newest = get().items[0]?.created_at;
    if (!newest) return;
    set({ seenAt: newest });
    try {
      localStorage.setItem(SEEN_KEY, newest);
    } catch {
      // A full quota costs the badge, nothing else.
    }
  },

  unreadCount() {
    const { items, seenAt } = get();
    if (!seenAt) return items.length;
    return items.filter((a) => (a.created_at ?? "") > seenAt).length;
  },
}));
