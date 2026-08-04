import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { scSearchUsers, type Track, type User } from "@/lib/tauri";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useCompact } from "@/hooks/useCompact";
import { confirmAction } from "@/stores/useConfirmStore";
import { toast } from "@/stores/useToastStore";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Direct messages.
 *
 * Two panes on a wide window, one at a time on a narrow one — a phone-width
 * inbox that showed both would give each about 150px. `selected` doubles as
 * "which pane is showing" in that mode.
 */
export function MessagesView() {
  const conversations = useMessagesStore((s) => s.conversations);
  const status = useMessagesStore((s) => s.status);
  const error = useMessagesStore((s) => s.error);
  const load = useMessagesStore((s) => s.load);
  const markRead = useMessagesStore((s) => s.markRead);
  const remove = useMessagesStore((s) => s.remove);

  const pendingThread = useNavStore((s) => s.pendingThread);
  const clearPendingThread = useNavStore((s) => s.clearPendingThread);

  const [selected, setSelected] = useState<User | null>(null);
  const [composing, setComposing] = useState(false);
  const [filter, setFilter] = useState("");
  const compact = useCompact();

  useEffect(() => {
    void load();
  }, [load]);

  // "Message" on a profile lands here with someone already chosen.
  useEffect(() => {
    if (!pendingThread) return;
    setSelected(pendingThread);
    clearPendingThread();
  }, [pendingThread, clearPendingThread]);

  // Opening a thread is what marks it read, the same as everywhere else.
  useEffect(() => {
    if (!selected) return;
    const row = useMessagesStore
      .getState()
      .conversations.find((c) => c.user.id === selected.id);
    if (row?.unread) void markRead(selected.id, true).catch(() => undefined);
  }, [selected, markRead]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? conversations.filter((c) =>
        `${c.user.username} ${c.last_message ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
    : conversations;

  const showList = !compact || !selected;
  const showThread = !compact || !!selected;

  return (
    // A fixed height rather than `h-full`: the shells put views inside a
    // scrolling `main` whose inner wrapper is `height: auto`, so `h-full`
    // resolves to nothing and both panes collapse. Sizing against the viewport
    // gives the inbox and the thread their own scrollers in every layout.
    <div className="flex h-[calc(100dvh-20rem)] min-h-72 w-full gap-4 md:h-[calc(100dvh-13rem)]">
      {showList && (
        <div
          className={cn(
            "flex min-h-0 flex-col gap-2",
            compact ? "w-full" : "w-72 shrink-0",
          )}
        >
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                placeholder={t.messages.searchPeople}
                spellCheck={false}
                className="w-full rounded-[var(--radius-control)] border border-border bg-card py-1.5 pl-8 pr-2 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => setComposing(true)}
              title={t.messages.newMessage}
              aria-label={t.messages.newMessage}
              className="shrink-0 rounded-[var(--radius-control)] border border-border p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => void load(true)}
              disabled={status === "loading"}
              title={t.messages.refresh}
              aria-label={t.messages.refresh}
              className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-4 w-4", status === "loading" && "animate-spin")}
              />
            </button>
          </div>

          {status === "loading" && conversations.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.messages.loading}</p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">
              {t.messages.error}: {error}
            </p>
          )}
          {status === "ok" && conversations.length === 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{t.messages.empty}</p>
              <p className="text-xs text-muted-foreground">{t.messages.hint}</p>
            </div>
          )}

          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {visible.map((conversation) => {
              const avatar = artwork(conversation.user.avatar_url, "t50x50");
              const active = selected?.id === conversation.user.id;
              return (
                <li key={conversation.user.id} className="group relative">
                  <button
                    onClick={() => setSelected(conversation.user)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[var(--radius-control)] p-2 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent",
                      active && "bg-accent",
                    )}
                  >
                    <Avatar url={avatar} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {conversation.user.username}
                        </span>
                        {conversation.unread && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                            aria-label={t.messages.unread}
                          />
                        )}
                      </span>
                      {conversation.last_message && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {conversation.last_message}
                        </span>
                      )}
                    </span>
                  </button>

                  <span className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100">
                    <button
                      onClick={() =>
                        void markRead(
                          conversation.user.id,
                          conversation.unread,
                        ).catch((e) => toast(String(e), "error"))
                      }
                      title={
                        conversation.unread
                          ? t.messages.markRead
                          : t.messages.markUnread
                      }
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                    >
                      {conversation.unread ? (
                        <MailOpen className="h-3.5 w-3.5" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        void confirmAction(t.messages.deleteConfirm, {
                          confirmLabel: t.common.delete,
                        }).then((ok) => {
                          if (!ok) return;
                          if (selected?.id === conversation.user.id) {
                            setSelected(null);
                          }
                          return remove(conversation.user.id)
                            .then(() => toast(t.messages.deleted, "success"))
                            .catch((e) => toast(String(e), "error"));
                        });
                      }}
                      title={t.messages.delete}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showThread &&
        (selected ? (
          <Thread
            user={selected}
            onBack={compact ? () => setSelected(null) : undefined}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{t.messages.noThread}</p>
          </div>
        ))}

      {composing && (
        <NewMessageDialog
          onClose={() => setComposing(false)}
          onPick={(user) => {
            setComposing(false);
            setSelected(user);
          }}
        />
      )}
    </div>
  );
}

function Avatar({ url, size = "md" }: { url: string | null; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  return url ? (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={cn(box, "shrink-0 rounded-full object-cover")}
    />
  ) : (
    <span
      className={cn(
        box,
        "flex shrink-0 items-center justify-center rounded-full bg-secondary",
      )}
    >
      <UserIcon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}

/**
 * One conversation, oldest message at the top.
 *
 * Which side a bubble sits on comes from `from_me`, which Rust resolved
 * against the signed-in user's id when it parsed the thread — the component
 * never has to know who "me" is.
 */
function Thread({ user, onBack }: { user: User; onBack?: () => void }) {
  const messages = useMessagesStore((s) => s.threads[user.id]);
  const loading = useMessagesStore((s) => s.loadingThread === user.id);
  const sending = useMessagesStore((s) => s.sending === user.id);
  const loadThread = useMessagesStore((s) => s.loadThread);
  const send = useMessagesStore((s) => s.send);
  const openUser = useNavStore((s) => s.openUser);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadThread(user.id);
  }, [user.id, loadThread]);

  // A chat opens at the newest message, not at the oldest.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    // Cleared up front: leaving the text in the box while the request runs
    // invites a double send, and the store restores nothing on failure anyway.
    setDraft("");
    try {
      await send(user, text);
    } catch (e) {
      setDraft(text);
      toast(`${t.messages.sendFailed}: ${e}`, "error");
    }
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <header className="flex items-center gap-2 border-b border-border pb-2">
        {onBack && (
          <button
            onClick={onBack}
            aria-label={t.nav.back}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={() => openUser(user)}
          className="flex min-w-0 items-center gap-2"
        >
          <Avatar url={artwork(user.avatar_url, "t50x50")} size="sm" />
          <span className="truncate text-sm font-semibold">{user.username}</span>
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {loading && !messages && (
          <p className="text-sm text-muted-foreground">{t.messages.loading}</p>
        )}
        {messages?.map((message, index) => (
          <Bubble
            key={message.id ?? `${index}-${message.created_at ?? ""}`}
            content={message.content}
            fromMe={message.from_me}
            createdAt={message.created_at}
            track={message.track}
          />
        ))}
        {messages?.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground">{t.messages.empty}</p>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="flex items-center gap-2 border-t border-border pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder={t.messages.placeholder}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label={t.messages.send}
          className="brand-gradient flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          {sending ? t.messages.sending : t.messages.send}
        </button>
      </form>
    </div>
  );
}

function Bubble({
  content,
  fromMe,
  createdAt,
  track,
}: {
  content: string;
  fromMe: boolean;
  createdAt: string | null;
  track: Track | null;
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const openTrack = useNavStore((s) => s.openTrack);

  return (
    <div className={cn("flex", fromMe ? "justify-end" : "justify-start")}>
      <div
        // `data-bubble` is what Apple mode hooks to turn these into iMessage
        // capsules; every other skin gets the shape below.
        data-bubble={fromMe ? "me" : "them"}
        className={cn(
          "flex max-w-[80%] flex-col gap-1.5 rounded-[var(--radius)] px-3 py-2",
          fromMe
            ? "brand-gradient text-brand-foreground"
            : "border border-border bg-card",
        )}
      >
        {track && (
          <button
            onClick={() => void playTrack(track, [track])}
            onDoubleClick={() => openTrack(track)}
            className="flex items-center gap-2 rounded-[var(--radius-control)] bg-black/20 p-1.5 text-left"
          >
            {artwork(track.artwork_url, "t50x50") ? (
              <img
                src={artwork(track.artwork_url, "t50x50") ?? undefined}
                alt=""
                className="h-8 w-8 shrink-0 rounded object-cover"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">
                {track.title}
              </span>
              {track.artist && (
                <span className="block truncate text-[11px] opacity-80">
                  {track.artist}
                </span>
              )}
            </span>
          </button>
        )}

        {content && (
          <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
        )}

        {createdAt && (
          <time className="self-end text-[10px] opacity-70">
            {new Date(createdAt).toLocaleString()}
          </time>
        )}
      </div>
    </div>
  );
}

/** Pick someone to write to. Reuses the public user search. */
function NewMessageDialog({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (user: User) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setBusy(true);
      scSearchUsers(q, 0, 20)
        .then((page) => !cancelled && setResults(page.items))
        .catch(() => undefined)
        .finally(() => !cancelled && setBusy(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="panel panel-raised pop-in flex max-h-[70vh] w-full max-w-md flex-col gap-3 rounded-[var(--radius-hero)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">{t.messages.newMessage}</h2>
          <button
            onClick={onClose}
            aria-label={t.search.clear}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t.library.searchPeople}
          spellCheck={false}
          className="w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />

        {busy && <p className="text-xs text-muted-foreground">{t.search.loading}</p>}

        <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {results.map((user) => (
            <li key={user.id}>
              <button
                onClick={() => onPick(user)}
                className="flex w-full items-center gap-2.5 rounded-[var(--radius-control)] p-2 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent"
              >
                <Avatar url={artwork(user.avatar_url, "t50x50")} size="sm" />
                <span className="truncate text-sm">{user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
