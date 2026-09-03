import { memo, useEffect, useRef, useState } from "react";
import { Download, ListPlus, MoreVertical, Pause, Play } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { TrackContextMenu, type MenuTarget } from "./TrackContextMenu";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { DownloadRing } from "./DownloadRing";
import { LikeButton } from "./LikeButton";
import { RepostButton } from "./RepostButton";
import { ShareButton } from "./ShareButton";
import { useRepostStore } from "@/stores/useRepostStore";
import { useVirtual } from "@/hooks/useVirtual";
import { useCompact } from "@/hooks/useCompact";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { Density } from "@/theme/apply";
import { cn } from "@/lib/utils";
import { useArtwork } from "@/hooks/useArtwork";
import { t } from "@/i18n";
import { ArtFallback } from "./ArtFallback";

/**
 * Row height in px, per density setting.
 *
 * A number rather than CSS because the virtualiser positions rows by it, and it
 * must match the rendered height exactly or the scrollbar drifts. This is what
 * makes the density control mean something on the screen where it counts —
 * `.stack` gaps alone were invisible.
 */
const ROW_HEIGHT: Record<Density, number> = {
  compact: 52,
  cozy: 64,
  spacious: 76,
};

/** Format milliseconds as m:ss. */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Clickable list of tracks; a click plays the track (or toggles it). The whole
 * list becomes the player queue, so next/prev and autoplay walk it.
 *
 * Only the visible slice is in the DOM — a likes list of several thousand
 * costs the same as one of thirty. Right-clicking a row opens the same actions
 * the player bar offers.
 */
/**
 * How long a row that has left the list stays on screen, in ms.
 *
 * Must match `--row-leave` in `globals.css`: the class runs the fade, this
 * number decides when the row is dropped from the markup. Too short and the
 * row disappears mid-fade; too long and the list holds a hole where it was.
 */
const ROW_LEAVE_MS = 240;

export function TrackList({ tracks }: { tracks: Track[] }) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);
  const rowHeight = ROW_HEIGHT[useSettingsStore((s) => s.theme.density)];
  const { ref, start, end } = useVirtual(tracks.length, rowHeight);
  // One subscription for the whole list rather than one per row.
  const compact = useCompact();

  /**
   * Rows the list no longer has, still on screen while they fade.
   *
   * Unliking a track is the one moment a list is worth animating: the user did
   * something and the list is answering. Without this the row vanished between
   * two frames and everything under it jumped up by its height, which reads as
   * a glitch rather than as a track leaving. Held with the position it had, so
   * it fades where it stood rather than where its index would now put it.
   */
  const [leaving, setLeaving] = useState<{ track: Track; top: number }[]>([]);
  /** The list as it was last render, to see what changed. */
  const previous = useRef<Track[]>(tracks);
  /** Ids that have just arrived, so they can fade in rather than appear. */
  const [entered, setEntered] = useState<Set<number>>(new Set());

  useEffect(() => {
    const before = previous.current;
    previous.current = tracks;
    if (before === tracks) return;

    const now = new Set(tracks.map((track) => track.id));
    const gone = before
      .map((track, index) => ({ track, top: index * rowHeight }))
      .filter(({ track }) => !now.has(track.id));

    const had = new Set(before.map((track) => track.id));
    const fresh = new Set(
      tracks.filter((track) => !had.has(track.id)).map((track) => track.id),
    );

    // A whole list arriving is not a list changing: opening a tab, a search
    // answering, a filter narrowing. Animating those would fade in forty rows
    // at once, which is a screen flickering rather than a row appearing.
    const swapped = gone.length > 3 || fresh.size > 3;
    if (swapped || (!gone.length && !fresh.size)) {
      setLeaving([]);
      setEntered(new Set());
      return;
    }

    setLeaving(gone);
    setEntered(fresh);
    const timer = setTimeout(() => {
      setLeaving([]);
      setEntered(new Set());
    }, ROW_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [tracks, rowHeight]);

  const visible = tracks.slice(start, end);

  return (
    <>
      <div
        ref={ref}
        // Not `list-card`, which is a framed one. That frame belongs to a card
        // whose rows are flush and divided by rules — the two in Nit. Here every
        // row is a rounded surface of its own with air around it, so the frame
        // had nothing to enclose: its top and bottom scrolled out of sight and
        // what was left were two vertical lines hugging the list.
        className="relative overflow-hidden"
        // The full height is reserved up front so the scrollbar is honest.
        style={{ height: tracks.length * rowHeight }}
      >
        {leaving.map(({ track, top }) => (
          <TrackRow
            key={`leaving-${track.id}`}
            track={track}
            queue={tracks}
            index={0}
            compact={compact}
            top={top}
            height={rowHeight}
            leaving
            onContextMenu={(e) => e.preventDefault()}
            onMenu={() => {}}
          />
        ))}

        {visible.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            queue={tracks}
            index={start + index + 1}
            compact={compact}
            top={(start + index) * rowHeight}
            height={rowHeight}
            entering={entered.has(track.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ track, x: e.clientX, y: e.clientY });
            }}
            onMenu={(x, y, align) => setMenu({ track, x, y, align })}
          />
        ))}
      </div>

      {menu && (
        <TrackContextMenu
          target={menu}
          onClose={() => setMenu(null)}
          onAddToPlaylist={setAddTo}
        />
      )}

      {addTo && (
        <AddToPlaylistDialog track={addTo} onClose={() => setAddTo(null)} />
      )}
    </>
  );
}

const TrackRow = memo(function TrackRow({
  track,
  queue,
  index,
  compact,
  top,
  height,
  entering,
  leaving,
  onContextMenu,
  onMenu,
}: {
  track: Track;
  queue: Track[];
  /** 1-based position in the list. Only one skin shows it; see `.row-index`. */
  index: number;
  /** Touch-sized layout: no hover, so the row's actions need a real button. */
  compact: boolean;
  top: number;
  height: number;
  /** Just arrived in the list, so it fades in instead of appearing. */
  entering?: boolean;
  /** Already out of the list, on screen only until its fade finishes. */
  leaving?: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onMenu: (x: number, y: number, align?: MenuTarget["align"]) => void;
}) {
  const art = useArtwork(track);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addNext = usePlayerStore((s) => s.addNext);
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isDownloaded = useDownloadsStore((s) => s.ids.has(track.id));
  const downloading = useDownloadsStore((s) => s.active[track.id]);
  const startDownload = useDownloadsStore((s) => s.start);
  const removeDownload = useDownloadsStore((s) => s.remove);
  const setPausedDownload = useDownloadsStore((s) => s.setPaused);
  const reposted = useRepostStore((s) => s.trackIds.has(track.id));
  /**
   * Whether the press that is about to become a click began on a control.
   *
   * Asking where the *click* landed is not enough. A control that moves while
   * it is held — every one of them had `active:scale-90` — is no longer under
   * the pointer when it is released, and the browser then delivers the click to
   * the nearest common ancestor instead, which is this row, with this row as
   * the target. So the row also has to remember where the press started. See
   * `.press-glyph` in `globals.css` for the measurement.
   */
  const pressedControl = useRef(false);

  return (
    <div
      onContextMenu={onContextMenu}
      style={{ top, height }}
      className={cn(
        // `row-slot` carries the row to its new place when one above it leaves,
        // rather than letting it jump. See `globals.css`.
        "row-slot absolute inset-x-0",
        entering && "row-enter",
        leaving && "row-leave",
      )}
    >
      {/* A div that behaves like a button, rather than a `<button>`.

          The row is one big "play this" target and reads like a button, but it
          also *contains* buttons — the heart, the download, repost, share, queue
          — and a button inside a button is not allowed. It half worked for a
          long time because each inner handler stops the event from travelling
          up. What that cannot stop is WebKit, which in this case runs the outer
          button's activation as well, as its own dispatch rather than a bubbled
          one: on macOS, liking a track paused the one that was playing. Nothing
          to stop propagating, so nothing to fix from the inside.

          Role and key handling put back by hand what `<button>` was giving for
          free — that is the price of the fix, and it is cheaper than an
          arrangement where half the controls in a list cannot be touched
          without disturbing the player.

          Unnesting them was not enough on its own, though, so the handler below
          also asks where the click landed. Every inner control stops the event
          from travelling up and it kept arriving anyway; rather than keep
          guessing by what route, the row simply declines any click that started
          inside something clickable. That holds however the engine delivers it —
          bubbled, retargeted, or dispatched at the row directly — which is the
          property worth having in a list where a stray play is a track cut off
          mid-word. */}
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => {
          pressedControl.current = !!(e.target as HTMLElement).closest(
            "button, a",
          );
        }}
        onClick={(e) => {
          // The heart, the download, repost, share, queue, the overflow menu:
          // each does its own thing, and none of them means "play this".
          if (pressedControl.current) {
            pressedControl.current = false;
            return;
          }
          if ((e.target as HTMLElement).closest("button, a")) return;
          void playTrack(track, queue);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          // Space scrolls the list by default, which is the opposite of what
          // pressing a row should do.
          e.preventDefault();
          void playTrack(track, queue);
        }}
        // A hook rather than a style: Obsidian marks the playing row with a 2px
        // bar at its left edge instead of a fill, and `bg-accent` is a utility a
        // stylesheet cannot sensibly select on.
        data-current={isCurrent || undefined}
        className={cn(
          // `bg-row` stays on regardless: the current row's `bg-accent` only
          // sets a background *colour*, so it wins over the row fill without
          // taking the class — and the class is what a stylesheet has to grab
          // hold of to restyle rows as a set.
          // No rule under each row. Forty hairlines down a list draw a grid
          // nobody asked for and make the covers look like cells in a table;
          // the covers are already forty rectangles, and that is enough
          // structure. What separates rows now is the space between them and
          // the fill that appears under the pointer.
          "group bg-row flex h-[calc(100%-0.25rem)] w-full items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent",
          isCurrent && "bg-accent",
        )}
      >
        {/* The row's number. Hidden in every skin but the one that wants a
            column of readings down the left of the list. */}
        <span className="row-index readout shrink-0">
          {String(index).padStart(2, "0")}
        </span>


        <div className="relative h-12 w-12 shrink-0">
          {art ? (
            /* The frame is the duotone's box, and it holds the picture and
               nothing else — the play button below is a sibling above it, or
               the ink would recolour the glyph as well. */
            <span className="art-frame block h-12 w-12 rounded-[var(--radius-control)]">
              <img
                src={art}
                alt=""
                loading="lazy"
                decoding="async"
                width={48}
                height={48}
                className="artwork h-12 w-12 object-cover"
              />
            </span>
          ) : (
            <ArtFallback
              seed={track.id}
              className="h-12 w-12 rounded-[var(--radius-control)]"
            />
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-control)] art-overlay opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100">
            {isCurrent && isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px]" />
            )}
          </span>
        </div>

        <div className="flex min-w-0 flex-col">
          <span
            className={cn(
              "row-title type-body truncate",
              isCurrent && "text-brand",
            )}
          >
            {track.title}
          </span>
          {track.artist && (
            <span className="type-label truncate text-muted-foreground">
              {track.artist}
            </span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {compact ? (
            /* A touch screen has no hover, so hover-revealed actions are
               unreachable on a phone — a row offered play and the heart and
               nothing else. One overflow button opens the same menu the right
               click does, which is the pattern every mobile list uses. */
            <button
              onClick={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                // Beside the button, tops level.
                onMenu(box.right, box.top, "beside");
              }}
              aria-label={t.track.more}
              className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          ) : (
            <>
              {/* The rest stay hover-only, which keeps a long list calm. */}
              <button
                onClick={(e) => {
                  // The whole row is a play button; this must not trigger it.
                  e.stopPropagation();
                  addNext(track);
                  toast(t.track.queuedNext, "info");
                }}
                title={t.track.playNext}
                aria-label={t.track.playNext}
                className="rounded-[var(--radius-control)] p-1 text-muted-foreground opacity-0 transition-[opacity,color] duration-[var(--motion-fast)] hover:text-foreground group-hover:opacity-100"
              >
                <ListPlus className="h-4 w-4" />
              </button>
              <ShareButton
                url={track.permalink_url}
                className="opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
              />
              <RepostButton
                track={track}
                className={cn(
                  "transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100",
                  reposted ? "opacity-100" : "opacity-0",
                )}
              />
            </>
          )}
          {/* What this library says about the track: whether you have a copy,
              and whether you like it. Last in the row, hard against the
              duration, so they land in the same place on every line — the
              actions before them come and go with hover and with whether a
              track is reposted, and anything sharing a row with those moved
              about as the pointer travelled down the list.

              They were moved to the head of the row once, on the argument that
              the left edge holds a column better still. It does, and it was
              wrong anyway: put first, they are the first thing the eye meets on
              every line, and a library is read by its titles. Looked at and
              sent back on 2026-09-02. Leave them here.

              Both are always drawn, and the state is the colour rather than
              the presence: muted means no copy on disk and one click makes one,
              the accent means there already is one. Same rule the heart has
              always followed, and for the same reason — a row that shows
              nothing cannot be told from a row where the button does not exist,
              and finding out costs a trip with the pointer over every line.

              (Download was hover-only for a version. It reads better on a long
              list, and it was wrong: the one question worth answering at a
              glance on a library of 1300 tracks is which of them you actually
              have.) */}
          <div className="flex shrink-0 items-center gap-0.5">
            {downloading ? (
              /* While it runs, the button *is* the progress: a glyph that only
                 pulsed said work was happening but never how much, and the
                 percentage was a tooltip away. */
              <DownloadRing
                download={downloading}
                onToggle={() =>
                  void setPausedDownload(track.id, !downloading.paused)
                }
              />
            ) : (
            <button
              onClick={(e) => {
                // The whole row is a play button; this must not reach it.
                e.stopPropagation();
                // On a track that already has a copy, this is how the copy
                // goes: a list is where you notice you no longer want it, and
                // the only other way out was the row of buttons under the
                // downloads section, which cannot reach a track you are
                // looking at anywhere else.
                void (isDownloaded
                  ? removeDownload(track.id)
                  : startDownload(track));
              }}
              aria-label={isDownloaded ? t.downloads.remove : t.player.download}
              title={isDownloaded ? t.downloads.remove : t.player.download}
              className={cn(
                "rounded-[var(--radius-control)] p-1 transition-colors duration-[var(--motion-fast)]",
                // Red on the way to a copy's deletion, the way the
                // downloads section marks its own remove buttons: the glyph is
                // the same one that fetched the track, so the colour is what
                // says this press takes it away.
                isDownloaded
                  ? "text-brand hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Download className="h-4 w-4" />
            </button>
            )}
            <LikeButton track={track} />
          </div>

          <span className="readout type-caption tabular-nums text-muted-foreground">
            {formatDuration(track.duration)}
          </span>
        </div>
      </div>
    </div>
  );
});
