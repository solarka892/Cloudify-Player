import { memo, useState } from "react";
import { Download, ListPlus, MoreVertical, Pause, Play } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { useNitStore } from "@/stores/useNitStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { TrackContextMenu, type MenuTarget } from "./TrackContextMenu";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { LikeButton } from "./LikeButton";
import { RepostButton } from "./RepostButton";
import { ShareButton } from "./ShareButton";
import { useRepostStore } from "@/stores/useRepostStore";
import { useVirtual } from "@/hooks/useVirtual";
import { useCompact } from "@/hooks/useCompact";
import { bandForDuration } from "@/lib/band";
import { cn } from "@/lib/utils";
import { useArtwork } from "@/hooks/useArtwork";
import { t } from "@/i18n";
import { ArtFallback } from "./ArtFallback";

/**
 * Row height in px. One number, because the language states it.
 *
 * 40, against 64 before, and the number is the redesign's whole argument about
 * density in one place: eighteen rows on a 900px sheet where eleven used to fit.
 * A map is dense — that is the point of one — and a list that shows eleven things
 * is a list you scroll rather than read.
 *
 * It has to be a number rather than CSS because the virtualiser positions rows by
 * it, and it must match the rendered height exactly or the scrollbar drifts.
 */
const ROW_HEIGHT = 40;

/** Format milliseconds as m:ss. */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A list of tracks: the densest thing on the sheet, and the element the language
 * is most visible in.
 *
 * Every row carries a band from the ramp on its left edge, encoding how long the
 * track is (`lib/band.ts`), which the legend in the corner declares. That is the
 * signature: a library you can read as terrain rather than search line by line.
 *
 * What has not changed: a click plays the track and the whole list becomes the
 * queue, right-click opens the actions, and only the visible slice is in the DOM,
 * so a likes list of several thousand costs what one of thirty costs.
 *
 * What has: no rule under each row and no card around the list. Forty hairlines
 * draw a table nobody asked for, and forty covers are already structure enough.
 * Rows are separated by a fill under the pointer and by the bands.
 */
export function TrackList({ tracks }: { tracks: Track[] }) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);
  const { ref, start, end } = useVirtual(tracks.length, ROW_HEIGHT);
  // One subscription for the whole list rather than one per row.
  const compact = useCompact();

  const visible = tracks.slice(start, end);

  return (
    <>
      <div
        ref={ref}
        className="relative"
        // The full height is reserved up front so the scrollbar is honest.
        style={{ height: tracks.length * ROW_HEIGHT }}
      >
        {visible.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            queue={tracks}
            compact={compact}
            top={(start + index) * ROW_HEIGHT}
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
  compact,
  top,
  onContextMenu,
  onMenu,
}: {
  track: Track;
  queue: Track[];
  /** Touch-sized layout: no hover, so the row's actions need a real button. */
  compact: boolean;
  top: number;
  onContextMenu: (e: React.MouseEvent) => void;
  onMenu: (x: number, y: number, align?: MenuTarget["align"]) => void;
}) {
  const art = useArtwork(track);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addNext = usePlayerStore((s) => s.addNext);
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isDownloaded = useDownloadsStore((s) => s.ids.has(track.id));
  const reposted = useRepostStore((s) => s.trackIds.has(track.id));
  // What this app knows about the row that SoundCloud does not: how many marks
  // are on it, and whether the upload is gone. One subscription per row into a
  // map the store already holds, so no request and no per-row effect.
  const marks = useNitStore((s) => s.rowMarks[track.id] ?? 0);
  const goneAt = useNitStore((s) => s.rowGone[track.id]);
  const band = bandForDuration(track.duration);

  return (
    <div
      onContextMenu={onContextMenu}
      style={{ top, height: ROW_HEIGHT }}
      className="absolute inset-x-0"
    >
      <button
        onClick={() => void playTrack(track, queue)}
        data-current={isCurrent || undefined}
        className={cn(
          "group flex h-[calc(100%-2px)] w-full items-center gap-3 rounded-[var(--radius)] pr-2 text-left transition-colors duration-[var(--t-state)] hover:bg-accent",
          isCurrent && "bg-accent",
        )}
      >
        {/* The band. First thing on the row and the only coloured thing on it,
            because it is the only thing on it that is a measurement. */}
        <span
          className={cn("h-[calc(100%-8px)] shrink-0", `band band-${band}`)}
          aria-hidden
        />

        <div className="relative h-8 w-8 shrink-0">
          {art ? (
            <span className="art-frame block h-8 w-8">
              <img
                src={art}
                alt=""
                loading="lazy"
                decoding="async"
                width={32}
                height={32}
                className="artwork"
              />
            </span>
          ) : (
            <ArtFallback seed={track.id} className="h-8 w-8" />
          )}
          <span className="art-overlay absolute inset-0 flex items-center justify-center rounded-[var(--radius)] opacity-0 transition-opacity duration-[var(--t-state)] group-hover:opacity-100">
            {isCurrent && isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5 translate-x-[1px]" />
            )}
          </span>
        </div>

        {/* Title and artist on one line, separated by the ink rather than by a
            second row of type. At 40px there is one line, and a title is what
            the row is for — the artist follows it in the lighter ink. */}
        <span className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className={cn("truncate", isCurrent && "text-brand")}>
            {track.title}
          </span>
          {track.artist && (
            <span className="truncate text-xs text-muted-foreground">
              {track.artist}
            </span>
          )}
        </span>

        {/* What is true about this row beyond its name. Contours, never fills: a
            filled tag would be a second landmark competing with the play mark. */}
        {(goneAt || marks > 0) && (
          <span className="flex shrink-0 items-center gap-1.5">
            {goneAt && <span className="chip">{t.gone.badge}</span>}
            {marks > 0 && (
              <span className="chip">
                {t.marks.count.replace("{n}", String(marks))}
              </span>
            )}
          </span>
        )}

        <span className="flex shrink-0 items-center gap-1">
          {isDownloaded && (
            <Download
              className="h-3.5 w-3.5 text-brand"
              aria-label={t.player.downloaded}
            />
          )}
          {/* Always on screen: hiding the heart until hover meant an unliked
              track showed nothing at all, so "not liked" and "no button here"
              looked the same until the pointer moved. */}
          <LikeButton track={track} />

          {compact ? (
            /* A touch screen has no hover, so hover-revealed actions are
               unreachable on a phone. One overflow button opens the same menu
               the right click does. */
            <button
              onClick={(e) => {
                e.stopPropagation();
                const box = e.currentTarget.getBoundingClientRect();
                onMenu(box.right, box.top, "beside");
              }}
              aria-label={t.track.more}
              className="rounded-[var(--radius)] p-1 text-muted-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          ) : (
            <>
              <button
                onClick={(e) => {
                  // The whole row is a play button; this must not trigger it.
                  e.stopPropagation();
                  addNext(track);
                  toast(t.track.queuedNext, "info");
                }}
                title={t.track.playNext}
                aria-label={t.track.playNext}
                className="rounded-[var(--radius)] p-1 text-muted-foreground opacity-0 transition-[opacity,color] duration-[var(--t-state)] hover:text-foreground group-hover:opacity-100"
              >
                <ListPlus className="h-4 w-4" />
              </button>
              <RepostButton
                track={track}
                className={cn(
                  "transition-opacity duration-[var(--t-state)] group-hover:opacity-100",
                  reposted ? "opacity-100" : "opacity-0",
                )}
              />
              <ShareButton
                url={track.permalink_url}
                className="opacity-0 transition-opacity duration-[var(--t-state)] group-hover:opacity-100"
              />
            </>
          )}
          {/* A reading, in the instrument face, tabular so the column lines up. */}
          <span className="readout text-muted-foreground">
            {formatDuration(track.duration)}
          </span>
        </span>
      </button>
    </div>
  );
});
