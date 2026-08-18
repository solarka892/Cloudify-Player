import { useState } from "react";
import { t } from "@/i18n";
import { clock } from "@/hooks/useHotkeys";
import { usePlayerStore } from "@/stores/usePlayerStore";

/**
 * How far through, and a way to move.
 *
 * A 3px contour that fills with the water, plus the reading in the instrument
 * face beside it. Two decisions worth naming:
 *
 *   - **the buffered extent is drawn, the loading state is not animated.** A
 *     stripe that crawls is the one moving thing this language would have, and
 *     the sheet does not move. What is buffered is a quantity, so it is a fill.
 *   - **the reading is `position / duration`, in tabular figures.** A clock set
 *     in a proportional face reflows on every tick; that is the entire reason
 *     there is a monospaced face in the app at all.
 */
export function Scrub() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const buffered = usePlayerStore((s) => s.buffered);
  const seek = usePlayerStore((s) => s.seek);
  /** While dragging, the bar follows the pointer rather than the clock. */
  const [dragging, setDragging] = useState<number | null>(null);

  const shown = dragging ?? position;
  const through = duration > 0 ? Math.min(1, shown / duration) : 0;
  const ready = duration > 0 ? Math.min(1, buffered / duration) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-[3px]">
        {/* The track, what has been fetched, and what has been played — three
            fills, back to front. */}
        <span className="absolute inset-0 rounded-[1px] bg-surface" />
        <span
          className="absolute inset-y-0 left-0 rounded-[1px] bg-contour"
          style={{ width: `${ready * 100}%` }}
        />
        <span
          className="absolute inset-y-0 left-0 rounded-[1px] bg-water"
          style={{ width: `${through * 100}%` }}
        />
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={shown}
          onChange={(e) => setDragging(Number(e.currentTarget.value))}
          onPointerUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging !== null) seek(dragging);
            setDragging(null);
          }}
          aria-label={t.player.seek}
          // The input itself is the hit area, invisible over the fills. Taller
          // than the bar it drives, because a 3px target is not a target.
          className="absolute -inset-y-2 left-0 w-full cursor-pointer opacity-0"
        />
      </div>
      <div className="readout flex justify-between text-ink-soft">
        <span>{clock(shown * 1000)}</span>
        <span>{clock(duration * 1000)}</span>
      </div>
    </div>
  );
}
