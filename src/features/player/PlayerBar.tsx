import { useState } from "react";
import {
  ListMusic,
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

/** Format seconds as m:ss. */
function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}


export function PlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const queueLength = usePlayerStore((s) => s.queue.length);
  const index = usePlayerStore((s) => s.index);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const seek = usePlayerStore((s) => s.seek);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const [showQueue, setShowQueue] = useState(false);

  if (!current) return null;

  const art = artwork(current.artwork_url);
  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || current.duration / 1000;
  const hasNext = index >= 0 && index + 1 < queueLength;

  return (
    <div className="relative w-full shrink-0">
      {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}

      <footer className="flex h-20 w-full items-center gap-4 border-t border-border bg-card px-4">
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
            <span className="truncate text-sm font-medium">
              {current.title}
            </span>
            {current.artist && (
              <span className="truncate text-xs text-muted-foreground">
                {current.artist}
              </span>
            )}
          </div>
        </div>

        {/* Transport */}
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={prev}
            aria-label={t.player.prev}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? t.player.pause : t.player.play}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-[1px]" />
            )}
          </button>

          <button
            onClick={next}
            disabled={!hasNext}
            aria-label={t.player.next}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

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
            className="h-1 flex-1 cursor-pointer accent-brand"
          />
          <span className="w-10 font-mono text-xs text-muted-foreground">
            {formatTime(total)}
          </span>
        </div>

        {/* Queue toggle */}
        <button
          onClick={() => setShowQueue((v) => !v)}
          aria-label={t.player.queue}
          className={cn(
            "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent",
            showQueue ? "text-brand" : "text-muted-foreground",
          )}
        >
          <ListMusic className="h-4 w-4" />
        </button>

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
            className="h-1 flex-1 cursor-pointer accent-brand"
          />
        </div>
      </footer>
    </div>
  );
}

/** Upcoming tracks, anchored above the bar. Click any row to jump to it. */
function QueuePanel({ onClose }: { onClose: () => void }) {
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const playAt = usePlayerStore((s) => s.playAt);

  return (
    <div className="absolute bottom-full right-4 mb-2 flex max-h-80 w-80 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">{t.player.queue}</span>
        <span className="text-xs text-muted-foreground">
          {index + 1}/{queue.length}
        </span>
      </div>

      <ul className="flex flex-col overflow-y-auto">
        {queue.map((track, i) => (
          <li key={`${track.id}-${i}`}>
            <button
              onClick={() => {
                playAt(i);
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent",
                i === index && "bg-accent",
                i < index && "opacity-50",
              )}
            >
              <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col">
                <span
                  className={cn(
                    "truncate text-xs font-medium",
                    i === index && "text-brand",
                  )}
                >
                  {track.title}
                </span>
                {track.artist && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {track.artist}
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
