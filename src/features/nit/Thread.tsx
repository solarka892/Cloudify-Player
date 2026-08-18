import { useCallback, useMemo, useRef, useState } from "react";
import { clock } from "@/hooks/useHotkeys";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useNitStore } from "@/stores/useNitStore";
import { usePlayerStore } from "@/stores/usePlayerStore";

/**
 * The thread: the playing track's own waveform, along the top edge of the
 * window, filling as it plays.
 *
 * ## Why the waveform and not a line
 *
 * It began as a 2px rule, which is what the reference draws, and on a real
 * screen it was very nearly invisible — for the app's only progress indicator
 * that is not restraint, it is a broken feature. The fix is not a thicker rule:
 * a thicker rule is just a louder version of something with nothing to say. The
 * waveform is *already fetched* for the popover and already cached per track, so
 * drawing it full width costs one array we have and makes the strip legible at a
 * glance, from across the room, without adding a single colour.
 *
 * It also earns the space it takes. A rule tells you how far through you are; a
 * waveform tells you that the quiet part is coming up, that there are ninety
 * seconds of outro, that the drop you marked is right *there*. That is the thing
 * a music player's progress bar is for and almost none of them do it.
 *
 * The bars hang from the top edge rather than standing on the strip's floor:
 * that way the baseline *is* the window's edge, the amplitude grows into the
 * app, and the loudest part of the track is the part nearest everything else on
 * the screen. Standing up, the baseline would sit in the middle of the frame
 * with a band of page colour above it belonging to nothing.
 *
 * ## Where it lives
 *
 * A row at the top of the window frame, above the title bar, rather than an
 * overlay on top of it. As an overlay it had to steal eight pixels of the drag
 * region and the top of the close button, and it could never be taller than
 * that. As a row it owns its height, nothing overlaps, and the window's own
 * chrome is untouched.
 *
 * ## What it costs per frame
 *
 * Nothing that scales with the bar count. The bars are built once per track and
 * memoised; the played portion is the *same* set of bars in the accent colour,
 * clipped by a single `clip-path` that is the only thing that changes as the
 * playhead moves. So a tick is one style property on one element, whatever the
 * window's width.
 */

/** How many bars the strip is drawn with. */
const BARS = 200;

export function Thread() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const current = usePlayerStore((s) => s.current);
  const seek = usePlayerStore((s) => s.seek);
  const marks = useNitStore((s) => s.marks);
  const waveform = useNitStore((s) => s.waveform);
  const synthetic = useNitStore((s) => s.waveformSynthetic);

  const strip = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  /** Set by a long press; a phone has no hover to open the popover with. */
  const held = useRef<number | null>(null);

  const fraction = duration > 0 ? Math.min(1, position / duration) : 0;

  const fractionAt = useCallback((clientX: number) => {
    const box = strip.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }, []);

  /** The mark nearest the pointer, if one is close enough to have been meant. */
  const nearest = useMemo(() => {
    if (hover === null || duration <= 0 || marks.length === 0) return null;
    const at = hover * duration * 1000;
    let best = marks[0]!;
    for (const mark of marks) {
      if (Math.abs(mark.position_ms - at) < Math.abs(best.position_ms - at)) {
        best = mark;
      }
    }
    // Within 2% of the track, which at any window width is about a fingertip.
    return Math.abs(best.position_ms - at) <= duration * 1000 * 0.02 ? best : null;
  }, [hover, duration, marks]);

  /** The track's shape, resampled to the number of bars the strip draws. */
  const heights = useMemo(() => {
    const samples = waveform?.samples ?? [];
    if (samples.length === 0) return [];
    const height = waveform?.height || 100;
    const step = samples.length / BARS;
    return Array.from({ length: BARS }, (_, i) => {
      // The mean of the samples this bar covers, not the first of them: picking
      // one sample out of twenty makes a waveform that changes shape with the
      // window's width, which reads as a rendering bug.
      const from = Math.floor(i * step);
      const to = Math.max(from + 1, Math.floor((i + 1) * step));
      let sum = 0;
      for (let s = from; s < to; s++) sum += samples[s] ?? 0;
      const mean = sum / (to - from) / height;
      // Never zero: a silent passage is still part of the track, and a gap in
      // the strip reads as missing data rather than as quiet.
      return Math.max(0.08, Math.min(1, mean));
    });
  }, [waveform]);

  /**
   * The bars, as elements.
   *
   * Memoised on the heights alone, so the four-times-a-second position update
   * re-renders this component but React bails out of both bar sets — they are
   * the same element references it saw last time.
   */
  const bars = useMemo(
    () =>
      heights.map((height, i) => (
        <span key={i} style={{ height: `${(height * 100).toFixed(1)}%` }} />
      )),
    [heights],
  );

  const playedClip = `inset(0 ${((1 - fraction) * 100).toFixed(3)}% 0 0)`;

  return (
    <div
      ref={strip}
      role="slider"
      tabIndex={-1}
      aria-label={t.thread.title}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(position)}
      data-playing={current ? "" : undefined}
      className="thread"
      onMouseMove={(e) => setHover(fractionAt(e.clientX))}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => duration > 0 && seek(fractionAt(e.clientX) * duration)}
      onTouchStart={(e) => {
        const x = e.touches[0]?.clientX ?? 0;
        held.current = window.setTimeout(() => setHover(fractionAt(x)), 400);
      }}
      onTouchEnd={() => {
        if (held.current) window.clearTimeout(held.current);
        setHover(null);
      }}
    >
      {/* Nothing playing: a rule, so the strip is still a place rather than a
          gap that appears when music starts and shifts the window down. */}
      {!current || bars.length === 0 ? (
        <div className="thread-empty" />
      ) : (
        <>
          <div className="thread-wave">{bars}</div>
          {/* The same shape again, in the accent, clipped to the playhead. One
              property changes per tick, whatever the bar count. */}
          <div
            className="thread-wave thread-wave-played"
            style={{ clipPath: playedClip }}
            aria-hidden
          >
            {bars}
          </div>
          <span className="thread-head" style={{ left: `${fraction * 100}%` }} />
        </>
      )}

      {/* Marks: a full-height rule in the second ink, straight through the
          waveform. On the shape rather than beside it, because what a mark says
          is "this part of *this*". */}
      {duration > 0 &&
        marks.map((mark) => (
          <span
            key={mark.id}
            className={cn(
              "thread-notch",
              nearest?.id === mark.id && "thread-notch-near",
            )}
            style={{
              left: `${Math.min(100, (mark.position_ms / (duration * 1000)) * 100)}%`,
            }}
          />
        ))}

      {hover !== null && duration > 0 && current && (
        <ThreadTip
          fraction={hover}
          seconds={hover * duration}
          note={nearest?.note ?? null}
          noteAt={nearest?.position_ms ?? null}
          synthetic={synthetic}
        />
      )}
    </div>
  );
}

/**
 * What is under the pointer: the time, the nearest mark's note, and whether the
 * shape being pointed at is SoundCloud's or ours.
 *
 * No second waveform in it any more — the strip it hangs from *is* the waveform
 * now, and a magnified copy of the thing you are already looking at is a
 * decoration rather than an answer.
 *
 * Positioned by percentage and clamped away from both edges, because a popover
 * that hangs off the window cannot be read at 0:00 or at the end of any track.
 */
function ThreadTip({
  fraction,
  seconds,
  note,
  noteAt,
  synthetic,
}: {
  fraction: number;
  seconds: number;
  note: string | null;
  noteAt: number | null;
  synthetic: boolean;
}) {
  return (
    <div
      className="thread-tip panel"
      style={{
        left: `clamp(0px, calc(${fraction * 100}% - 6rem), calc(100% - 12rem))`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="readout text-xs">{clock(seconds * 1000)}</span>
        {noteAt !== null && (
          <span className="readout text-xs text-brand-2">{clock(noteAt)}</span>
        )}
      </div>
      {note && <p className="mt-1 text-xs leading-snug">{note}</p>}
      {synthetic && (
        <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">
          {t.thread.noWaveform}
        </p>
      )}
    </div>
  );
}
