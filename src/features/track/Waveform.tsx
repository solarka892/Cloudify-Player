import { useMemo, useRef, useState } from "react";
import type { Comment, Waveform as WaveformData } from "@/lib/tauri";
import { artwork, cn } from "@/lib/utils";

/**
 * SoundCloud's waveform, as a seek bar.
 *
 * Drawn with elements rather than a canvas on purpose: the bars take their
 * colour from `--brand` and `--muted-foreground`, so every palette, skin and
 * Apple-mode override themes it for free — a canvas would mean parsing those
 * custom properties into fill styles and re-reading them on every theme change.
 *
 * The played portion is a second copy of the same bars, clipped to the current
 * position. Only that wrapper's width changes as the track plays, so the ~160
 * bars themselves are memoised and never re-render on a position tick.
 */

/** Bars to draw. SoundCloud sends 1800 samples; that is far more than a few
 * hundred pixels can show, so they are averaged down to something legible. */
const BARS = 160;

/** Downsample to `BARS` buckets, as a fraction of full height. */
function buckets(data: WaveformData): number[] {
  const { samples, height } = data;
  if (samples.length === 0 || height === 0) return [];
  const size = Math.max(1, Math.floor(samples.length / BARS));
  const out: number[] = [];

  for (let i = 0; i < samples.length; i += size) {
    let sum = 0;
    let count = 0;
    for (let j = i; j < i + size && j < samples.length; j++) {
      sum += samples[j] ?? 0;
      count++;
    }
    // A floor keeps silence visible as a hairline instead of a gap.
    out.push(Math.max(0.06, count > 0 ? sum / count / height : 0));
  }
  return out;
}

function Bars({ heights, played }: { heights: number[]; played: boolean }) {
  return (
    <div className="flex h-full w-full items-center gap-px" data-wave aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          style={{ height: `${h * 100}%` }}
          className={cn(
            "min-w-px flex-1 rounded-[var(--radius-round)]",
            played ? "bg-brand" : "bg-muted-foreground/35",
          )}
        />
      ))}
    </div>
  );
}

export function Waveform({
  data,
  durationMs,
  positionMs,
  comments = [],
  onSeek,
  onCommentHover,
}: {
  data: WaveformData | null;
  durationMs: number;
  /** Current playback position, in ms. Pass 0 when this track isn't playing. */
  positionMs: number;
  comments?: Comment[];
  /** Called with a position in seconds. */
  onSeek: (seconds: number) => void;
  onCommentHover?: (comment: Comment | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);

  const heights = useMemo(() => (data ? buckets(data) : []), [data]);
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  // Untimed comments have nowhere to sit on the bar.
  const pins = useMemo(
    () =>
      comments.filter(
        (c) => c.timestamp != null && durationMs > 0 && c.timestamp <= durationMs,
      ),
    [comments, durationMs],
  );

  function fractionAt(clientX: number): number {
    const box = ref.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - box.left) / box.width));
  }

  if (heights.length === 0) {
    // No waveform (SoundCloud omits it for some tracks) still needs a seek bar.
    return (
      <div
        role="slider"
        tabIndex={0}
        aria-label="seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(positionMs / 1000)}
        onClick={(e) => onSeek((fractionAt(e.clientX) * durationMs) / 1000)}
        ref={ref}
        className="relative h-2 w-full cursor-pointer overflow-hidden rounded-[var(--radius-round)] bg-muted-foreground/25"
      >
        <div
          className="h-full rounded-[var(--radius-round)] bg-brand"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full select-none">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationMs / 1000)}
        aria-valuenow={Math.round(positionMs / 1000)}
        onClick={(e) => onSeek((fractionAt(e.clientX) * durationMs) / 1000)}
        onKeyDown={(e) => {
          const step = 5;
          if (e.key === "ArrowRight") onSeek(positionMs / 1000 + step);
          if (e.key === "ArrowLeft")
            onSeek(Math.max(0, positionMs / 1000 - step));
        }}
        onMouseMove={(e) => setHoverFraction(fractionAt(e.clientX))}
        onMouseLeave={() => setHoverFraction(null)}
        className="relative h-20 w-full cursor-pointer"
      >
        <Bars heights={heights} played={false} />

        {/* The played copy, clipped. The inner div keeps its full width so the
            bars stay put instead of squashing as the clip narrows. */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${progress * 100}%` }}
        >
          <div
            className="h-full"
            style={{ width: ref.current?.clientWidth ?? "100%" }}
          >
            <Bars heights={heights} played />
          </div>
        </div>

        {hoverFraction !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${hoverFraction * 100}%` }}
          />
        )}
      </div>

      {/* Timed comments, pinned under the bar the way soundcloud.com does it. */}
      {pins.length > 0 && (
        <div className="relative h-6 w-full">
          {pins.map((comment) => (
            <button
              key={comment.id}
              onClick={() => onSeek((comment.timestamp ?? 0) / 1000)}
              onMouseEnter={() => onCommentHover?.(comment)}
              onMouseLeave={() => onCommentHover?.(null)}
              title={`${comment.user?.username ?? ""}: ${comment.body}`}
              style={{ left: `${((comment.timestamp ?? 0) / durationMs) * 100}%` }}
              className="absolute top-1 -translate-x-1/2 transition-transform duration-[var(--motion-fast)] hover:scale-125"
            >
              {comment.user?.avatar_url ? (
                <img
                  src={artwork(comment.user.avatar_url, "t50x50") ?? undefined}
                  alt=""
                  loading="lazy"
                  className="artwork h-4 w-4 rounded-[var(--radius-round)] object-cover ring-1 ring-border"
                />
              ) : (
                <span className="block h-2 w-2 rounded-[var(--radius-round)] bg-brand" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
