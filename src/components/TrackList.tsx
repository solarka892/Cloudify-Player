import { useState } from "react";
import { Download, Music, Pause, Play } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { TrackContextMenu, type MenuTarget } from "./TrackContextMenu";
import { artwork, cn } from "@/lib/utils";
import { t } from "@/i18n";

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
 * Right-clicking a row opens the same actions the player bar offers.
 */
export function TrackList({ tracks }: { tracks: Track[] }) {
  const [menu, setMenu] = useState<MenuTarget | null>(null);

  return (
    <>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
        {tracks.map((track) => (
          <TrackRow
            key={track.id}
            track={track}
            queue={tracks}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ track, x: e.clientX, y: e.clientY });
            }}
          />
        ))}
      </ul>

      {menu && <TrackContextMenu target={menu} onClose={() => setMenu(null)} />}
    </>
  );
}

function TrackRow({
  track,
  queue,
  onContextMenu,
}: {
  track: Track;
  queue: Track[];
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const art = artwork(track.artwork_url);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isDownloaded = useDownloadsStore((s) => s.ids.has(track.id));

  return (
    <li onContextMenu={onContextMenu}>
      <button
        onClick={() => void playTrack(track, queue)}
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent",
          isCurrent ? "bg-accent" : "bg-card",
        )}
      >
        <div className="relative h-10 w-10 shrink-0">
          {art ? (
            <img
              src={art}
              alt=""
              loading="lazy"
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

        {isDownloaded && (
          <Download
            className="ml-auto h-3.5 w-3.5 shrink-0 text-brand"
            aria-label={t.player.downloaded}
          />
        )}

        <span
          className={cn(
            "shrink-0 font-mono text-xs tabular-nums text-muted-foreground",
            !isDownloaded && "ml-auto",
          )}
        >
          {formatDuration(track.duration)}
        </span>
      </button>
    </li>
  );
}
