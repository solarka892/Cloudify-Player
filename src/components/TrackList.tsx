import { memo, useState } from "react";
import { Download, ListPlus, Music, Pause, Play } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { TrackContextMenu, type MenuTarget } from "./TrackContextMenu";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";
import { useVirtual } from "@/hooks/useVirtual";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { Density } from "@/theme/apply";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";

/**
 * Row height in px, per density setting.
 *
 * A number rather than CSS because the virtualiser positions rows by it, and it
 * must match the rendered height exactly or the scrollbar drifts. This is what
 * makes the density control mean something on the screen where it counts —
 * `.stack` gaps alone were invisible.
 */
const ROW_HEIGHT: Record<Density, number> = {
  compact: 46,
  cozy: 56,
  spacious: 68,
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
export function TrackList({ tracks }: { tracks: Track[] }) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);
  const rowHeight = ROW_HEIGHT[useSettingsStore((s) => s.theme.density)];
  const { ref, start, end } = useVirtual(tracks.length, rowHeight);

  const visible = tracks.slice(start, end);

  return (
    <>
      <div
        ref={ref}
        className="list-card relative"
        // The full height is reserved up front so the scrollbar is honest.
        style={{ height: tracks.length * rowHeight }}
      >
        {visible.map((track, index) => (
          <TrackRow
            key={track.id}
            track={track}
            queue={tracks}
            top={(start + index) * rowHeight}
            height={rowHeight}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ track, x: e.clientX, y: e.clientY });
            }}
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
  top,
  height,
  onContextMenu,
}: {
  track: Track;
  queue: Track[];
  top: number;
  height: number;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const art = artwork(track.artwork_url);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const addNext = usePlayerStore((s) => s.addNext);
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isDownloaded = useDownloadsStore((s) => s.ids.has(track.id));
  const liked = useLibraryStore((s) => s.likedIds.has(track.id));

  return (
    <div
      onContextMenu={onContextMenu}
      style={{ top, height }}
      className="absolute inset-x-0"
    >
      <button
        onClick={() => void playTrack(track, queue)}
        className={cn(
          // `bg-row` stays on regardless: the current row's `bg-accent` only
          // sets a background *colour*, so it wins over the row fill without
          // taking the class — and the class is what a stylesheet has to grab
          // hold of to restyle rows as a set.
          "group bg-row flex h-full w-full items-center gap-3 border-b border-border px-3 text-left transition-[background-color] duration-[var(--motion-fast)] hover:bg-accent",
          isCurrent && "bg-accent",
        )}
      >
        <div className="relative h-10 w-10 shrink-0">
          {art ? (
            <img
              src={art}
              alt=""
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="h-10 w-10 rounded-[var(--radius-control)] object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-control)] bg-secondary">
              <Music className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-control)] bg-black/40 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100">
            {isCurrent && isPlaying ? (
              <Pause className="h-4 w-4 text-white" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px] text-white" />
            )}
          </span>
        </div>

        <div className="flex min-w-0 flex-col">
          <span
            className={cn(
              "truncate text-sm font-medium",
              isCurrent && "text-brand",
            )}
          >
            {track.title}
          </span>
          {track.artist && (
            <span className="truncate text-xs text-muted-foreground">
              {track.artist}
            </span>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {isDownloaded && (
            <Download
              className="h-3.5 w-3.5 text-brand"
              aria-label={t.player.downloaded}
            />
          )}
          {/* Queue this track right after the current one. Hidden until hover
              for the same reason the heart is: a long list stays calm. */}
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
          {/* Dimmed until hover so a long list stays calm; a liked track keeps
              its heart at full strength. */}
          <LikeButton
            track={track}
            className={cn(
              "transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100",
              liked ? "opacity-100" : "opacity-0",
            )}
          />
          <ShareButton
            url={track.permalink_url}
            className="opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover:opacity-100"
          />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(track.duration)}
          </span>
        </div>
      </button>
    </div>
  );
});
