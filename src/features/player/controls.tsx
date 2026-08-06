import { useContext, useState } from "react";
import {
  Repeat,
  Repeat1,
  Shuffle,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { TransportIcons } from "./transport-icons";
import { formatTime } from "./time";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Transport pieces shared by the player bar and the full-screen view.
 *
 * Each button carries `data-transport`, naming what it does. Nothing reads it
 * at runtime; it is a styling hook, because a transport that has to be
 * restyled as a set (Apple mode strips the fill off the play button and fills
 * the glyphs instead) cannot be reached through the class each button happens
 * to have.
 *
 * The four transport glyphs come from `transport-icons`, so a skin can supply
 * its own drawing of them without a second copy of the transport's behaviour —
 * which is what Apple mode does, to trade lucide's play triangle for SF's.
 */

export function PlayPauseButton({
  size = "md",
  /**
   * `plain` drops the filled disc for a bare glyph.
   *
   * For the phone's mini bar, where a solid light circle beside a 44px cover was
   * the heaviest thing on a screen it is meant to sit quietly at the bottom of —
   * and where the disc's 40px was under the size a thumb wants anyway.
   */
  variant = "solid",
}: {
  size?: "md" | "lg";
  variant?: "solid" | "plain";
}) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const { Play: PlayGlyph, Pause: PauseGlyph } = useContext(TransportIcons);
  const plain = variant === "plain";

  return (
    <button
      onClick={togglePlay}
      disabled={isLoading}
      data-transport="play"
      aria-label={isPlaying ? t.player.pause : t.player.play}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-round)] transition-[opacity,transform,background-color] duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50",
        plain
          ? "h-11 w-11 text-foreground hover:bg-accent active:scale-90"
          : "bg-primary text-primary-foreground hover:scale-105",
        !plain && (size === "lg" ? "h-14 w-14" : "h-10 w-10"),
      )}
    >
      {/* Keyed on the state, so React replaces the glyph rather than swapping
          its `d` attribute — a remount is what lets the new one animate in.
          Without it the most-pressed control in the app is the only one that
          changes without moving. */}
      <span key={isPlaying ? "pause" : "play"} className="pop-in flex">
        {isPlaying ? (
          <PauseGlyph
            className={size === "lg" || plain ? "h-6 w-6" : "h-5 w-5"}
          />
        ) : (
          <PlayGlyph
            className={cn(
              "translate-x-[1px]",
              size === "lg" || plain ? "h-6 w-6" : "h-5 w-5",
            )}
          />
        )}
      </span>
    </button>
  );
}

export function PrevButton({ size = "md" }: { size?: "md" | "lg" }) {
  const prev = usePlayerStore((s) => s.prev);
  const { Prev: PrevGlyph } = useContext(TransportIcons);
  return (
    <button
      onClick={prev}
      data-transport="prev"
      aria-label={t.player.prev}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground active:scale-90",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <PrevGlyph className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

export function NextButton({ size = "md" }: { size?: "md" | "lg" }) {
  const next = usePlayerStore((s) => s.next);
  const pos = usePlayerStore((s) => s.pos);
  const total = usePlayerStore((s) => s.order.length);
  const repeat = usePlayerStore((s) => s.repeat);
  const radio = usePlayerStore((s) => s.radioLoading);
  const { Next: NextGlyph } = useContext(TransportIcons);

  // "Next" stays live when the queue loops or radio can extend it.
  const hasNext = pos >= 0 && (pos + 1 < total || repeat === "all" || radio);

  return (
    <button
      onClick={next}
      disabled={!hasNext}
      data-transport="next"
      aria-label={t.player.next}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-[color,background-color,transform] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <NextGlyph className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </button>
  );
}

export function ShuffleButton() {
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);

  return (
    <button
      onClick={toggleShuffle}
      data-transport="shuffle"
      aria-label={t.player.shuffle}
      title={t.player.shuffle}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-round)] transition-colors duration-[var(--motion-fast)] hover:bg-accent",
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
      data-transport="repeat"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-round)] transition-colors duration-[var(--motion-fast)] hover:bg-accent",
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
  /**
   * True between pressing and releasing the scrubber.
   *
   * `.seek-fill` carries a 220ms width transition so that the once-a-tick
   * advance during playback does not visibly step. Dragging feeds it a new
   * width many times a second, and the fill spends the whole drag chasing the
   * thumb from 220ms behind — the thumb tracks the pointer, the bar trails it
   * by a third of the track. So the transition is switched off while scrubbing
   * and restored on release, where it is doing useful work again.
   */
  const [scrubbing, setScrubbing] = useState(false);

  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || (current ? current.duration / 1000 : 0);
  const progress = total > 0 ? (Math.min(position, total) / total) * 100 : 0;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(position)}
      </span>
      <div className="group/seek relative flex-1">
        {/* Painted track: the native range is kept for interaction only. The
            two class names are styling hooks — Apple mode thickens the track
            on hover and repaints the fill, neither of which it could reach
            through the utilities. */}
        <div className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-secondary">
          <div
            className="seek-fill brand-gradient h-full rounded-[var(--radius-round)]"
            style={{
              width: `${progress}%`,
              transitionDuration: scrubbing ? "0ms" : undefined,
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={0.5}
          value={Math.min(position, total || 0)}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          onPointerDown={() => setScrubbing(true)}
          // `pointercancel` too: a drag that leaves the window never gets an up.
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          onKeyDown={() => setScrubbing(true)}
          onKeyUp={() => setScrubbing(false)}
          aria-label={t.player.seek}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[var(--radius-round)]
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
    <div className="flex w-36 shrink-0 items-center gap-2 pr-2">
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
        // The level, published as a custom property. Obsidian draws the volume as
        // twelve rectangular segments rather than a slider, and a range input
        // cannot show its own fill — but a background can, given the number.
        style={{ "--level": muted ? 0 : volume } as React.CSSProperties}
        className="volume-slider h-1 flex-1 cursor-pointer accent-[var(--brand)]"
      />
    </div>
  );
}
