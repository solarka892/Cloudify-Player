import { create } from "zustand";
import {
  scConversations,
  scConversation,
  scDeleteConversation,
  scMarkConversation,
  scSendMessage,
  scUnreadMessages,
  type Conversation,
  type Message,
  type User,
} from "@/lib/tauri";

/**
 * The inbox.
 *
 * Threads are cached per user id and kept for the session: reopening a
 * conversation should feel like switching tabs, not like loading a page. A
 * sent message is appended locally rather than triggering a refetch — the
 * round trip is what makes chat apps feel sluggish, and SoundCloud's reply is
 * an empty body anyway.
 */

type Status = "idle" | "loading" | "ok" | "error";

interface MessagesState {
  conversations: Conversation[];
  status: Status;
  error: string | null;
  /** Unread thread count, for the nav badge. */
  unread: number;
  /** Messages per other-party user id. */
  threads: Record<number, Message[]>;
  /** Which thread is being fetched, if any. */
  loadingThread: number | null;
  /** Which thread a send is in flight for. */
  sending: number | null;

  load: (force?: boolean) => Promise<void>;
  refreshUnread: () => Promise<void>;
  loadThread: (userId: number, force?: boolean) => Promise<void>;
  send: (user: User, content: string) => Promise<void>;
  markRead: (userId: number, read: boolean) => Promise<void>;
  remove: (userId: number) => Promise<void>;
}

export const useMessagesStore = create<MessagesState>((set, get) => ({
  conversations: [],
  status: "idle",
  error: null,
  unread: 0,
  threads: {},
  loadingThread: null,
  sending: null,

  async load(force = false) {
    if (!force && (get().status === "loading" || get().status === "ok")) return;
    set({ status: "loading", error: null });
    try {
      const conversations = await scConversations();
      set({
        conversations,
        status: "ok",
        // Derived rather than fetched: the list already says which are unread,
        // and one request beats two.
        unread: conversations.filter((c) => c.unread).length,
      });
    } catch (e) {
      set({ status: "error", error: String(e) });
    }
  },

  async refreshUnread() {
    try {
      set({ unread: await scUnreadMessages() });
    } catch {
      // A badge that cannot be fetched is not worth telling anyone about.
    }
  },

  async loadThread(userId, force = false) {
    if (!force && get().threads[userId]) return;
    set({ loadingThread: userId });
    try {
      const messages = await scConversation(userId);
      set((s) => ({ threads: { ...s.threads, [userId]: messages } }));
    } catch (e) {
      set({ error: String(e) });
    } finally {
      // Only clear the flag if this is still the thread being waited on.
      if (get().loadingThread === userId) set({ loadingThread: null });
    }
  },

  async send(user, content) {
    set({ sending: user.id });
    try {
      await scSendMessage(user.id, content);

      const sent: Message = {
        id: null,
        content,
        created_at: new Date().toISOString(),
        from_me: true,
        track: null,
      };
      const existing = get().threads[user.id] ?? [];
      const conversations = get().conversations;
      const known = conversations.some((c) => c.user.id === user.id);

      set({
        threads: { ...get().threads, [user.id]: [...existing, sent] },
        // A first message to someone has to create the inbox row itself;
        // otherwise the thread exists but the list it is opened from does not.
        conversations: known
          ? conversations.map((c) =>
              c.user.id === user.id
                ? { ...c, last_message: content, last_at: sent.created_at, unread: false }
                : c,
            )
          : [
              { user, last_message: content, last_at: sent.created_at, unread: false },
              ...conversations,
            ],
      });
    } finally {
      set({ sending: null });
    }
  },

  async markRead(userId, read) {
    const before = get().conversations;
    set({
      conversations: before.map((c) =>
        c.user.id === userId ? { ...c, unread: !read } : c,
      ),
      unread: before.filter((c) =>
        c.user.id === userId ? !read : c.unread,
      ).length,
    });
    try {
      await scMarkConversation(userId, read);
    } catch (e) {
      set({ conversations: before, unread: before.filter((c) => c.unread).length });
      throw e;
    }
  },

  async remove(userId) {
    const before = get().conversations;
    const threads = { ...get().threads };
    delete threads[userId];
    set({
      conversations: before.filter((c) => c.user.id !== userId),
      threads,
    });
    try {
      await scDeleteConversation(userId);
    } catch (e) {
      set({ conversations: before });
      throw e;
    }
  },
}));
