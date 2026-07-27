import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { formatTime } from "./time";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Transport pieces shared by the player bar and the full-screen view. */

export function PlayPauseButton({ size = "md" }: { size?: "md" | "lg" }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  return (
    <button
      onClick={togglePlay}
      disabled={isLoading}
      aria-label={isPlaying ? t.player.pause : t.player.play}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,transform] duration-[var(--motion-fast)] hover:scale-105 hover:opacity-90 disabled:opacity-50",
        size === "lg" ? "h-14 w-14" : "h-10 w-10",
      )}
    >
      {isPlaying ? (
        <Pause className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
      ) : (
        <Play
          className={cn(
            "translate-x-[1px]",
            size === "lg" ? "h-6 w-6" : "h-5 w-5",
          )}
        />
      )}
    </button>
  );
}

export function PrevButton({ size = "md" }: { size?: "md" | "lg" }) {
  const prev = usePlayerStore((s) => s.prev);
  return (
    <button
      onClick={prev}
      aria-label={t.player.prev}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground active:scale-90",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <SkipBack className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

export function NextButton({ size = "md" }: { size?: "md" | "lg" }) {
  const next = usePlayerStore((s) => s.next);
  const pos = usePlayerStore((s) => s.pos);
  const total = usePlayerStore((s) => s.order.length);
  const repeat = usePlayerStore((s) => s.repeat);
  const radio = usePlayerStore((s) => s.radioLoading);

  // "Next" stays live when the queue loops or radio can extend it.
  const hasNext = pos >= 0 && (pos + 1 < total || repeat === "all" || radio);

  return (
    <button
      onClick={next}
      disabled={!hasNext}
      aria-label={t.player.next}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <SkipForward className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

export function ShuffleButton() {
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  return (
    <button
      onClick={toggleShuffle}
      aria-label={t.player.shuffle}
      title={t.player.shuffle}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)] hover:bg-accent",
        shuffle ? "text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Shuffle className="h-4 w-4" />
    </button>
  );
}

export function RepeatButton() {
  const repeat = usePlayerStore((s) => s.repeat);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);

  const label =
    repeat === "one"
      ? t.player.repeatOne
      : repeat === "all"
        ? t.player.repeatAll
        : t.player.repeatOff;

  return (
    <button
      onClick={cycleRepeat}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--motion-fast)] hover:bg-accent",
        repeat === "off"
          ? "text-muted-foreground hover:text-foreground"
          : "text-brand",
      )}
    >
      {repeat === "one" ? (
        <Repeat1 className="h-4 w-4" />
      ) : (
        <Repeat className="h-4 w-4" />
      )}
    </button>
  );
}

/** Scrubber with elapsed/remaining labels. */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const current = usePlayerStore((s) => s.current);
  const seek = usePlayerStore((s) => s.seek);

  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || (current ? current.duration / 1000 : 0);
  const progress = total > 0 ? (Math.min(position, total) / total) * 100 : 0;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(position)}
      </span>
      <div className="group/seek relative flex-1">
        {/* Painted track: the native range is kept for interaction only. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
          <div
            className="brand-gradient h-full rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={0.5}
          value={Math.min(position, total || 0)}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          aria-label={t.player.seek}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:opacity-0
            [&::-webkit-slider-thumb]:transition-opacity
            group-hover/seek:[&::-webkit-slider-thumb]:opacity-100"
        />
      </div>
      {!compact && (
        <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(total)}
        </span>
      )}
    </div>
  );
}

export function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex w-32 shrink-0 items-center gap-2">
      <button
        onClick={toggleMute}
        aria-label={t.player.mute}
        className="shrink-0 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.currentTarget.value))}
        aria-label={t.player.volume}
        className="h-1 flex-1 cursor-pointer accent-[var(--brand)]"
      />
    </div>
  );
}
