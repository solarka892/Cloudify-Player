import { Music, Pause, Play, Volume2 } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";

/** Format seconds as m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function artwork(url: string | null): string | null {
  return url ? url.replace("-large", "-t120x120") : null;
}

export function PlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);

  if (!current) return null;

  const art = artwork(current.artwork_url);
  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || current.duration / 1000;

  return (
    <footer className="flex h-20 w-full shrink-0 items-center gap-4 border-t border-border bg-card px-4">
      {/* Track info */}
      <div className="flex w-56 min-w-0 items-center gap-3">
        {art ? (
          <img src={art} alt="" className="h-12 w-12 rounded object-cover" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-secondary">
            <Music className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{current.title}</span>
          {current.artist && (
            <span className="truncate text-xs text-muted-foreground">
              {current.artist}
            </span>
          )}
        </div>
      </div>

      {/* Play/pause */}
      <button
        onClick={togglePlay}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause" : "Play"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPlaying ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5 translate-x-[1px]" />
        )}
      </button>

      {/* Seek */}
      <div className="flex flex-1 items-center gap-2">
        <span className="w-10 text-right font-mono text-xs text-muted-foreground">
          {formatTime(position)}
        </span>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={1}
          value={Math.min(position, total || 0)}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          className="h-1 flex-1 cursor-pointer accent-orange-500"
        />
        <span className="w-10 font-mono text-xs text-muted-foreground">
          {formatTime(total)}
        </span>
      </div>

      {/* Volume */}
      <div className="flex w-32 items-center gap-2">
        <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(Number(e.currentTarget.value))}
          className="h-1 flex-1 cursor-pointer accent-orange-500"
        />
      </div>
    </footer>
  );
}
