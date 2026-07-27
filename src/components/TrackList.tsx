import { Music, Pause, Play } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { cn } from "@/lib/utils";

/** Format milliseconds as m:ss. */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Bump SoundCloud artwork to a crisper size. */
function artwork(url: string | null): string | null {
  return url ? url.replace("-large", "-t120x120") : null;
}

/** Clickable list of tracks; a click plays the track (or toggles it). */
export function TrackList({ tracks }: { tracks: Track[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {tracks.map((track) => (
        <TrackRow key={track.id} track={track} />
      ))}
    </ul>
  );
}

function TrackRow({ track }: { track: Track }) {
  const art = artwork(track.artwork_url);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const isCurrent = usePlayerStore((s) => s.current?.id === track.id);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  return (
    <li>
      <button
        onClick={() => void playTrack(track)}
        className={cn(
          "group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent",
          isCurrent ? "bg-accent" : "bg-card",
        )}
      >
        <div className="relative h-10 w-10 shrink-0">
          {art ? (
            <img src={art} alt="" className="h-10 w-10 rounded object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary">
              <Music className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <span className="absolute inset-0 flex items-center justify-center rounded bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
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
              isCurrent && "text-orange-400",
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
        <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
          {formatDuration(track.duration)}
        </span>
      </button>
    </li>
  );
}
