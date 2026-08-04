import { useState } from "react";
import { Clock, MessageSquare, Trash2, User as UserIcon } from "lucide-react";
import {
  scDeleteComment,
  scPostComment,
  type Comment,
  type Track,
} from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { toast } from "@/stores/useToastStore";
import { formatTime } from "@/features/player/time";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * A track's comments, and the box to add one.
 *
 * The timestamp is the point: a comment posted while the track is playing is
 * pinned to where it is, which is what makes the waveform markers appear. The
 * pin can be switched off for a comment about the track as a whole.
 */
export function Comments({
  track,
  meId,
  comments,
  onChange,
  onSeek,
}: {
  track: Track;
  /** The signed-in user, so their own comments can offer a delete. */
  meId: number;
  comments: Comment[];
  /** Called with the new list after a post or a delete. */
  onChange: (comments: Comment[]) => void;
  onSeek: (seconds: number) => void;
}) {
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(true);
  const [posting, setPosting] = useState(false);
  const openUser = useNavStore((s) => s.openUser);

  // Read at submit time, not at render: pinning to where the track was when
  // the box was first drawn would put the comment minutes off.
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const position = usePlayerStore((s) => s.position);
  const pinAt = isCurrent && pinned ? Math.floor(position * 1000) : null;

  async function submit() {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      const posted = await scPostComment(track.id, text, pinAt);
      onChange([posted, ...comments]);
      setBody("");
    } catch (e) {
      toast(`${t.trackPage.commentFailed}: ${e}`, "error");
    } finally {
      setPosting(false);
    }
  }

  async function remove(comment: Comment) {
    const before = comments;
    onChange(comments.filter((c) => c.id !== comment.id));
    try {
      await scDeleteComment(comment.id);
      toast(t.trackPage.commentDeleted, "success");
    } catch (e) {
      onChange(before);
      toast(String(e), "error");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        {t.trackPage.comments}
        {comments.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {comments.length}
          </span>
        )}
      </h3>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.currentTarget.value)}
            placeholder={
              pinAt != null
                ? t.trackPage.commentAtPlaceholder.replace(
                    "{time}",
                    formatTime(pinAt / 1000),
                  )
                : t.trackPage.commentPlaceholder
            }
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm outline-none transition-[box-shadow] duration-[var(--motion-fast)] focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="brand-gradient shrink-0 rounded-[var(--radius-control)] px-3 py-2 text-sm font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50"
          >
            {posting ? t.trackPage.posting : t.trackPage.post}
          </button>
        </div>

        {/* Only offered while this track is the one playing — there is no
            position to pin to otherwise. */}
        {isCurrent && (
          <button
            type="button"
            onClick={() => setPinned((v) => !v)}
            className={cn(
              "flex w-fit items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-xs transition-colors duration-[var(--motion-fast)]",
              pinned
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            {pinned
              ? `${t.trackPage.pinComment} · ${formatTime(position)}`
              : t.trackPage.untimed}
          </button>
        )}
      </form>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.trackPage.noComments}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {comments.map((comment) => {
            const avatar = artwork(comment.user?.avatar_url ?? null, "t50x50");
            return (
              <li key={comment.id} className="group flex items-start gap-2.5 py-2">
                <button
                  onClick={() => comment.user && openUser(comment.user)}
                  className="shrink-0"
                  aria-label={comment.user?.username ?? ""}
                >
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      loading="lazy"
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary">
                      <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  )}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => comment.user && openUser(comment.user)}
                      className="truncate text-xs font-medium transition-colors duration-[var(--motion-fast)] hover:text-brand"
                    >
                      {comment.user?.username ?? "—"}
                    </button>
                    {comment.timestamp != null && (
                      <button
                        onClick={() => onSeek((comment.timestamp ?? 0) / 1000)}
                        className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-brand"
                      >
                        {formatTime((comment.timestamp ?? 0) / 1000)}
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {comment.body}
                  </p>
                </div>

                {comment.user?.id === meId && (
                  <button
                    onClick={() => void remove(comment)}
                    aria-label={t.trackPage.deleteComment}
                    title={t.trackPage.deleteComment}
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-[opacity,color] duration-[var(--motion-fast)] hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
