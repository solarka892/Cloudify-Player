import { useEffect } from "react";
import {
  Bell,
  Heart,
  MessageSquare,
  Music,
  RefreshCw,
  Repeat2,
  UserPlus,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import type { Activity } from "@/lib/tauri";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatTime } from "@/features/player/time";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";
import { ViewHead } from "@/components/ViewHead";

/**
 * What happened to your things: likes, comments, follows, reposts.
 *
 * SoundCloud's `type` strings are passed through from Rust rather than mapped
 * to an app-side enum, so a type nobody has seen before still renders as a row
 * with a name and a target instead of disappearing.
 */

/**
 * Turn SoundCloud's `type` into an icon and a verb.
 *
 * Matched by substring rather than by equality. The feed carries more type
 * strings than the handful the docs imply — `like`, `favoriting`,
 * `track-like`, `playlist-repost`, `affiliation` and others all turn up — and
 * an exact-match switch sent every one it had not been told about to a
 * catch-all that read "did something with", followed by nothing, because those
 * rows have no target either. Substrings cover the family instead of the
 * instance.
 *
 * The remaining unknowns get no invented verb at all: the row degrades to the
 * name and the timestamp, which is honest, and the raw type goes in the
 * `title` so an unhandled one can be identified and mapped.
 */
function describe(activity: Activity): {
  Icon: LucideIcon;
  verb: string | null;
  /**
   * What the sentence ends with when the feed gave no track or playlist to
   * name. A verb on its own is not a sentence: "templ liked" — liked *what*?
   * SoundCloud does drop the target on some rows, so the wording has to stand
   * without one instead of trailing off.
   */
  noTarget: string | null;
} {
  const kind = activity.kind.toLowerCase();
  const has = (needle: string) => kind.includes(needle);
  const unknown = t.notifications.targetUnknown;

  if (has("comment")) {
    return {
      Icon: MessageSquare,
      verb: t.notifications.commented,
      noTarget: unknown,
    };
  }
  if (has("repost")) {
    return {
      Icon: Repeat2,
      verb: activity.playlist
        ? t.notifications.repostedPlaylist
        : t.notifications.repostedTrack,
      noTarget: unknown,
    };
  }
  if (has("like") || has("favorit")) {
    return { Icon: Heart, verb: t.notifications.liked, noTarget: unknown };
  }
  // Nothing follows "started following you", so it needs no ending.
  if (has("follow") || has("affiliation")) {
    return { Icon: UserPlus, verb: t.notifications.followed, noTarget: null };
  }
  if (has("track") || has("playlist") || has("upload") || has("post")) {
    return {
      Icon: Music,
      verb: t.notifications.uploaded,
      noTarget: t.notifications.targetUnknownUpload,
    };
  }
  return { Icon: Bell, verb: null, noTarget: null };
}

export function NotificationsView() {
  const items = useNotificationsStore((s) => s.items);
  const status = useNotificationsStore((s) => s.status);
  const error = useNotificationsStore((s) => s.error);
  const load = useNotificationsStore((s) => s.load);
  const markSeen = useNotificationsStore((s) => s.markSeen);

  const openUser = useNavStore((s) => s.openUser);
  const openTrack = useNavStore((s) => s.openTrack);
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    void load();
  }, [load]);

  // Looking at the list is what marks it seen; run it after the fetch lands.
  useEffect(() => {
    if (status === "ok") markSeen();
  }, [status, items, markSeen]);

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <ViewHead title={t.nav.notifications} sub={t.notifications.title} />
      <div className="flex items-center gap-2">
        <span className="mr-auto" />
        <button
          onClick={() => void load(true)}
          disabled={status === "loading"}
          aria-label={t.notifications.refresh}
          title={t.notifications.refresh}
          className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", status === "loading" && "animate-spin")}
          />
        </button>
      </div>

      {status === "loading" && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.notifications.loading}</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">
          {t.notifications.error}: {error}
        </p>
      )}
      {status === "ok" && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.notifications.empty}</p>
      )}

      <ul className="flex flex-col divide-y divide-border">
        {items.map((activity, index) => {
          const { Icon, verb, noTarget } = describe(activity);
          const avatar = artwork(activity.user?.avatar_url ?? null, "t50x50");
          const target = activity.track ?? activity.playlist;
          const cover = artwork(
            activity.track?.artwork_url ?? activity.playlist?.artwork_url ?? null,
            "t50x50",
          );

          return (
            <li
              key={`${activity.kind}-${activity.created_at ?? index}-${target?.id ?? index}`}
              // The raw type, for the rows this app has no wording for yet.
              title={activity.kind}
              className="flex items-center gap-3 py-2.5"
            >
              <span className="relative shrink-0">
                <button
                  onClick={() => activity.user && openUser(activity.user)}
                  aria-label={activity.user?.username ?? ""}
                >
                  {avatar ? (
                    <span className="art-frame block h-9 w-9 rounded-[var(--radius-round)]">
                      <img
                        src={avatar}
                        alt=""
                        loading="lazy"
                        className="artwork h-9 w-9 object-cover"
                      />
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-round)] bg-secondary">
                      <UserIcon className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                </button>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-[var(--radius-round)] bg-card ring-1 ring-border">
                  <Icon className="h-2.5 w-2.5 text-brand" />
                </span>
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  <button
                    onClick={() => activity.user && openUser(activity.user)}
                    className="font-medium transition-colors duration-[var(--motion-fast)] hover:text-brand"
                  >
                    {activity.user?.username ?? "—"}
                  </button>{" "}
                  {verb && (
                    <span className="text-muted-foreground">{verb} </span>
                  )}
                  {activity.track && (
                    <button
                      onClick={() => openTrack(activity.track!)}
                      className="font-medium transition-colors duration-[var(--motion-fast)] hover:text-brand"
                    >
                      {activity.track.title}
                    </button>
                  )}
                  {!activity.track && activity.playlist && (
                    <button
                      onClick={() => openPlaylist(activity.playlist!)}
                      className="font-medium transition-colors duration-[var(--motion-fast)] hover:text-brand"
                    >
                      {activity.playlist.title}
                    </button>
                  )}
                  {verb && noTarget && !target && (
                    <span className="text-muted-foreground">{noTarget}</span>
                  )}
                </p>

                {activity.comment && (
                  <p className="truncate text-xs text-muted-foreground">
                    {activity.comment_timestamp != null && (
                      <span className="font-mono tabular-nums">
                        {formatTime(activity.comment_timestamp / 1000)}{" "}
                      </span>
                    )}
                    {activity.comment}
                  </p>
                )}

                {activity.created_at && (
                  <time className="text-[11px] text-muted-foreground">
                    {new Date(activity.created_at).toLocaleString()}
                  </time>
                )}
              </div>

              {cover && activity.track && (
                <button
                  onClick={() => void playTrack(activity.track!, [activity.track!])}
                  className="shrink-0"
                  aria-label={t.player.play}
                >
                  <span className="art-frame block h-9 w-9 rounded-[var(--radius-control)]">
                    <img
                      src={cover}
                      alt=""
                      loading="lazy"
                      className="artwork h-9 w-9 object-cover"
                    />
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
