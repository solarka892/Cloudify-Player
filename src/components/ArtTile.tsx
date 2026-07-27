import { ListMusic, Music, Pause, Play } from "lucide-react";
import type { Playlist, Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useNavStore } from "@/stores/useNavStore";
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
}: {
  art: string | null;
  title: string;
  subtitle: string | null;
  rounded: "square" | "circle";
  onClick: () => void;
  active: boolean;
  playing: boolean;
  Fallback: typeof Music;
}) {
  return (
    <button
      onClick={onClick}
      className="group/tile flex w-full flex-col gap-2 rounded-[var(--radius)] p-2 text-left transition-[background-color,transform] duration-[var(--motion-fast)] hover:-translate-y-0.5 hover:bg-accent/60"
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
                ? "rounded-full"
                : "rounded-[var(--radius-control)]",
            )}
          />
        ) : (
          <div
            className={cn(
              "flex h-full w-full items-center justify-center bg-secondary",
              rounded === "circle"
                ? "rounded-full"
                : "rounded-[var(--radius-control)]",
            )}
          >
            <Fallback className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        <span
          className={cn(
            "brand-gradient absolute bottom-2 right-2 flex h-10 w-10 translate-y-1 items-center justify-center rounded-full text-white opacity-0 shadow-[var(--shadow-2)] transition-all duration-[var(--motion-fast)] group-hover/tile:translate-y-0 group-hover/tile:opacity-100",
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
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>
    </button>
  );
}

export function TrackTile({
  track,
  queue,
}: {
  track: Track;
  queue?: Track[];
}) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const active = usePlayerStore((s) => s.current?.id === track.id);
  const playing = usePlayerStore((s) => s.isPlaying);

  return (
    <Shell
      art={artwork(track.artwork_url, "t300x300")}
      title={track.title}
      subtitle={track.artist}
      rounded="square"
      active={active}
      playing={playing}
      Fallback={Music}
      onClick={() => void playTrack(track, queue)}
    />
  );
}

export function PlaylistTile({ playlist }: { playlist: Playlist }) {
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
      onClick={() => openPlaylist(playlist)}
    />
  );
}

/** Responsive grid the tiles live in. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
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
