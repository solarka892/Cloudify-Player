import { useState } from "react";
import { ListMusic, MoreVertical, Music, Pause, Play } from "lucide-react";
import type { Playlist, Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useNavStore } from "@/stores/useNavStore";
import { AddToPlaylistDialog } from "./AddToPlaylistDialog";
import { TrackContextMenu, type MenuTarget } from "./TrackContextMenu";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

/**
 * Square artwork tile used by every grid in the app.
 *
 * Hovering lifts the tile and reveals the play button; the whole surface is
 * one button so the hit target matches what the user sees.
 */

function Shell({
  art,
  title,
  subtitle,
  rounded,
  onClick,
  active,
  playing,
  Fallback,
  index,
  onMenu,
}: {
  art: string | null;
  title: string;
  subtitle: string | null;
  rounded: "square" | "circle";
  onClick: () => void;
  active: boolean;
  playing: boolean;
  Fallback: typeof Music;
  /**
   * Position in its row or grid, for the entry stagger. Omitted means no
   * stagger — a tile that appears on its own has nothing to be staggered
   * against.
   */
  index?: number;
  /**
   * Opens the track menu at the given viewport point. Omitted for tiles with
   * nothing to act on, like a playlist.
   */
  onMenu?: (x: number, y: number) => void;
}) {
  return (
    // The wrapper exists so the overflow button can be a sibling of the tile
    // rather than a button inside a button.
    <div
      className={cn(
        "group/tile relative min-w-0",
        index !== undefined && "rise-in",
      )}
      // Capped: past a dozen items the delay is longer than anyone waits to see
      // a grid appear.
      style={
        index === undefined
          ? undefined
          : ({ "--i": Math.min(index, 12) } as React.CSSProperties)
      }
      onContextMenu={
        onMenu &&
        ((e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY);
        })
      }
    >
      <button
        onClick={onClick}
        className={cn(
          // `items-stretch` and `min-w-0` are load-bearing, not tidying.
          // Chromium's UA stylesheet gives a <button> `align-items: flex-start`,
          // and in a column flex container the cross axis is the width — so the
          // title block took its max-content width, which `truncate`'s `nowrap`
          // makes the whole untruncated string. On a two-column phone grid the
          // titles overlapped the next tile. WebKitGTK has no such rule, so the
          // desktop never showed it.
          "flex w-full min-w-0 flex-col items-stretch gap-2 rounded-[var(--radius)] p-2 text-left transition-[background-color,translate,scale] duration-[var(--motion-fast)] hover:-translate-y-0.5 hover:bg-accent/60 active:scale-[0.98]",
        )}
      >
      <div className="relative aspect-square w-full">
        {art ? (
          <img
            src={art}
            alt=""
            loading="lazy"
            className={cn(
              "h-full w-full object-cover shadow-[var(--shadow-1)]",
              rounded === "circle"
                ? "rounded-[var(--radius-round)]"
                : "rounded-[var(--radius-control)]",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-secondary",
              rounded === "circle"
                ? "rounded-[var(--radius-round)]"
                : "rounded-[var(--radius-control)]",
            )}
          >
            <Fallback className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        <span
          className={cn(
            "brand-gradient absolute bottom-2 right-2 flex h-10 w-10 translate-y-1 items-center justify-center rounded-[var(--radius-round)] text-brand-foreground opacity-0 shadow-[var(--shadow-2)] transition-all duration-[var(--motion-fast)] group-hover/tile:translate-y-0 group-hover/tile:opacity-100",
            active && "translate-y-0 opacity-100",
          )}
        >
          {active && playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-[1px]" />
          )}
        </span>
      </div>

        <div className="min-w-0 px-0.5">
          <div
            className={cn(
              "truncate text-sm font-medium",
              active && "text-brand",
            )}
          >
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>
      </button>

      {onMenu && (
        // Always on screen below `md`, hover-revealed above it — the same split
        // the track rows make. A touch screen has no hover, so a grid of tiles
        // offered play and nothing else on a phone: no queueing, no repost, no
        // "go to track". Done in CSS rather than with `useCompact` because a
        // grid mounts dozens of these and one media-query subscription each is
        // a lot for a layout question CSS can answer.
        <button
          onClick={(e) => {
            e.stopPropagation();
            const box = e.currentTarget.getBoundingClientRect();
            onMenu(box.right, box.bottom);
          }}
          aria-label={t.track.more}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[var(--radius-round)] bg-background/70 text-foreground backdrop-blur-sm transition-[opacity,background-color] duration-[var(--motion-fast)] hover:bg-background md:opacity-0 md:focus-visible:opacity-100 md:group-hover/tile:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function TrackTile({
  track,
  queue,
  index,
}: {
  track: Track;
  queue?: Track[];
  /** Position in the grid, for the entry stagger. */
  index?: number;
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const active = usePlayerStore((s) => s.current?.id === track.id);
  const playing = usePlayerStore((s) => s.isPlaying);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [addTo, setAddTo] = useState<Track | null>(null);

  return (
    <>
      <Shell
        art={artwork(track.artwork_url, "t300x300")}
        title={track.title}
        subtitle={track.artist}
        rounded="square"
        active={active}
        playing={playing}
        Fallback={Music}
        index={index}
        onClick={() => void playTrack(track, queue)}
        onMenu={(x, y) => setMenu({ track, x, y })}
      />

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

export function PlaylistTile({
  playlist,
  index,
}: {
  playlist: Playlist;
  /** Position in the grid, for the entry stagger. */
  index?: number;
}) {
  const openPlaylist = useNavStore((s) => s.openPlaylist);

  return (
    <Shell
      art={artwork(playlist.artwork_url, "t300x300")}
      title={playlist.title}
      subtitle={playlist.owner}
      rounded="square"
      active={false}
      playing={false}
      Fallback={ListMusic}
      index={index}
      onClick={() => openPlaylist(playlist)}
    />
  );
}

/** Responsive grid the tiles live in. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-[calc(0.5rem*var(--density))] sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {children}
    </div>
  );
}

/** Section heading with an optional "see all" affordance. */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2
        className="label text-xl font-bold tracking-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {title}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          className="label shrink-0 text-xs font-semibold text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
