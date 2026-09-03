import { useContext, useEffect, useRef, useState } from "react";
import {
  Repeat,
  Repeat1,
  Shuffle,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { el } from "@/audio/engine";
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
  /**
   * The glyph follows *intent*, not the element.
   *
   * It used to follow `isPlaying`, which is only true once audio is actually
   * coming out — so on any track that took a moment to resolve, the button
   * stayed on "play" after being pressed and the press read as ignored. Pressing
   * it again then paused a track that had not started. Intent flips
   * synchronously, and the ring below says the sound is still on its way.
   */
  const wantsPlay = usePlayerStore((s) => s.wantsPlay);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const { Play: PlayGlyph, Pause: PauseGlyph } = useContext(TransportIcons);
  const plain = variant === "plain";
  const glyph = size === "lg" || plain ? "h-6 w-6" : "h-5 w-5";

  return (
    <button
      onClick={togglePlay}
      // Never disabled. A control that goes dead exactly when the app is slow is
      // the one that gets pressed hardest, and every one of those presses used
      // to be swallowed — including the one that meant "stop waiting".
      data-transport="play"
      data-busy={isLoading ? "1" : undefined}
      aria-label={wantsPlay ? t.player.pause : t.player.play}
      aria-busy={isLoading}
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-[var(--radius-round)] transition-[opacity,transform,background-color] duration-[var(--motion-fast)] hover:opacity-90",
        // The press lives on the glyph, so the button cannot shrink out from
        // under the pointer and lose the click — see `.press-glyph`.
        plain
          ? "press h-11 w-11 text-foreground hover:bg-accent"
          : "bg-primary text-primary-foreground hover:scale-105",
        !plain && (size === "lg" ? "h-14 w-14" : "h-10 w-10"),
      )}
    >
      {/* Buffering, drawn around the button rather than replacing the glyph:
          the control has to stay legible as a transport while it waits, and a
          spinner in place of the icon loses which way it is about to go. */}
      {isLoading && <span className="transport-busy" aria-hidden />}
      {/* Keyed on the state, so React replaces the glyph rather than swapping
          its `d` attribute — a remount is what lets the new one animate in.
          Without it the most-pressed control in the app is the only one that
          changes without moving. */}
      <span
        key={wantsPlay ? "pause" : "play"}
        className={cn("pop-in flex", plain && "press-glyph")}
      >
        {wantsPlay ? (
          <PauseGlyph className={glyph} />
        ) : (
          <PlayGlyph className={cn("translate-x-[1px]", glyph)} />
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
        "press flex shrink-0 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <PrevGlyph
        className={cn("press-glyph", size === "lg" ? "h-5 w-5" : "h-4 w-4")}
      />
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
        "press flex shrink-0 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-[color,background-color] duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
        size === "lg" ? "h-10 w-10" : "h-8 w-8",
      )}
    >
      <NextGlyph
        className={cn("press-glyph", size === "lg" ? "h-5 w-5" : "h-4 w-4")}
      />
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

/**
 * Scrubber with elapsed/remaining labels.
 *
 * ## Why the fill is not driven by React state
 *
 * It used to be: the store's `position` (fed by `timeupdate`, coalesced to about
 * four times a second) set the width, and a 220ms CSS transition smoothed the
 * steps out. That transition is also what made seeking feel broken — a drag
 * released at the far end left the bar sliding there for a fifth of a second
 * after the audio had already jumped, and a tap somewhere new *animated* to it,
 * so the one interaction that should feel instant was the slowest thing in the
 * player.
 *
 * Reading the element per frame and writing the width straight onto the node
 * fixes both ends at once: continuous during playback with no transition to lag
 * behind, and exactly where you put it the moment you put it there. It costs one
 * property read and one style write per frame, and none of it re-renders React.
 */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const duration = usePlayerStore((s) => s.duration);
  const current = usePlayerStore((s) => s.current);
  const seek = usePlayerStore((s) => s.seek);
  const buffered = usePlayerStore((s) => s.buffered);

  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || (current ? current.duration / 1000 : 0);

  const fillRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  /** True between pressing and releasing the scrubber — the thumb wins then. */
  const scrubbing = useRef(false);
  const [displayTotal, setDisplayTotal] = useState(total);

  useEffect(() => setDisplayTotal(total), [total]);

  useEffect(() => {
    // Nothing loaded is nothing to animate; a frame loop that runs on an idle
    // player keeps the whole app awake for a bar that cannot move.
    if (!current) return;

    let frame = 0;
    let lastText = "";

    function tick() {
      frame = requestAnimationFrame(tick);
      if (scrubbing.current) return;

      const a = el();
      const length = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : total;
      if (length <= 0) return;
      const at = Math.min(a.currentTime, length);

      const fill = fillRef.current;
      if (fill) fill.style.width = `${(at / length) * 100}%`;
      // The range input is uncontrolled here for the same reason: a `value` prop
      // would re-render this component sixty times a second to move a thumb the
      // browser can move itself.
      if (inputRef.current) inputRef.current.value = String(at);

      // The clock only changes once a second, so it is compared before it is
      // written — a text node rewritten every frame is a layout every frame.
      const text = formatTime(at);
      if (text !== lastText && elapsedRef.current) {
        lastText = text;
        elapsedRef.current.textContent = text;
      }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [total, current]);

  const bufferedPercent =
    displayTotal > 0
      ? Math.min(100, (Math.min(buffered, displayTotal) / displayTotal) * 100)
      : 0;

  return (
    <div className="flex w-full items-center gap-2">
      <span
        ref={elapsedRef}
        className="w-10 shrink-0 text-right readout text-xs text-muted-foreground"
      >
        {formatTime(0)}
      </span>
      <div className="group/seek relative flex-1">
        {/* Painted track: the native range is kept for interaction only. The
            class names are styling hooks — Apple mode thickens the track on
            hover and repaints the fill, neither of which it could reach
            through the utilities. */}
        <div className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-secondary">
          {/* How much of the track is actually here. SoundCloud streams
              progressively, so seeking past this edge is the difference
              between an instant jump and a wait — worth being able to see. */}
          <div
            className="seek-buffer absolute inset-y-0 left-0 rounded-[var(--radius-round)]"
            style={{ width: `${bufferedPercent}%` }}
            aria-hidden
          />
          <div
            ref={fillRef}
            className="seek-fill brand-gradient relative h-full rounded-[var(--radius-round)]"
            style={{ width: "0%" }}
          />
        </div>
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={displayTotal || 0}
          step={0.25}
          defaultValue={0}
          onChange={(e) => {
            const to = Number(e.currentTarget.value);
            // Paint the drag immediately: the frame loop is standing down while
            // scrubbing, so nothing else is going to move the fill.
            if (fillRef.current && displayTotal > 0) {
              fillRef.current.style.width = `${(to / displayTotal) * 100}%`;
            }
            if (elapsedRef.current) elapsedRef.current.textContent = formatTime(to);
            seek(to);
          }}
          onPointerDown={() => (scrubbing.current = true)}
          // `pointercancel` too: a drag that leaves the window never gets an up.
          onPointerUp={() => (scrubbing.current = false)}
          onPointerCancel={() => (scrubbing.current = false)}
          onKeyDown={() => (scrubbing.current = true)}
          onKeyUp={() => (scrubbing.current = false)}
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
        <span className="w-10 shrink-0 readout text-xs text-muted-foreground">
          {formatTime(displayTotal)}
        </span>
      )}
    </div>
  );
}

export function VolumeControl({ className }: { className?: string } = {}) {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    // The right padding is twice the bar's own, and deliberately so: the slider
    // is a thin horizontal line aimed at the window's edge, and a line reads as
    // reaching further than a solid thing sitting at the same distance. Matched
    // to the artwork's 16px on the left it looked like it was running out of the
    // panel. This is an optical correction, not a measured one.
    <div className={cn("flex w-32 shrink-0 items-center gap-2 pr-4", className)}>
      <button
        onClick={toggleMute}
        aria-label={t.player.mute}
        className="shrink-0 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>
      {/* Built like the seek bar rather than left native, and for the reason
          the seek bar was: `accent-color` paints a track WebKit decides the
          height of, and it decides thicker than anything else in the bar. Two
          sliders side by side drawn to different weights is the sort of thing
          that reads as unfinished without being nameable. The painted track is
          the same pair of classes, so a skin styles both at once. */}
      <div className="group/vol relative flex-1">
        <div className="volume-track seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-secondary">
          <div
            className="seek-fill brand-gradient h-full rounded-[var(--radius-round)]"
            style={{ width: `${(muted ? 0 : volume) * 100}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={(e) => setVolume(Number(e.currentTarget.value))}
          aria-label={t.player.volume}
          // The level, published as a custom property. Obsidian draws the volume
          // as twelve rectangular segments rather than a slider, painted onto
          // this input — a range cannot show its own fill, but a background can,
          // given the number. That skin hides the track above; see `globals.css`.
          style={{ "--level": muted ? 0 : volume } as React.CSSProperties}
          className="volume-slider relative h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[var(--radius-round)]
            [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:opacity-0
            [&::-webkit-slider-thumb]:transition-opacity
            group-hover/vol:[&::-webkit-slider-thumb]:opacity-100"
        />
      </div>
    </div>
  );
}
