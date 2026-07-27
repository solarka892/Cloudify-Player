import { useEffect, useMemo, useRef, useState } from "react";
import { getLyrics, type Lyrics as LyricsData, type Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Lyrics, synced to playback when the source has timings.
 *
 * Most SoundCloud uploads are remixes, sets and edits with no lyrics anywhere,
 * so "nothing found" is the expected outcome and gets a quiet empty state
 * rather than an error.
 */

interface Line {
  /** Seconds from the start of the track. */
  time: number;
  text: string;
}

/** Parse LRC (`[mm:ss.xx] text`), tolerating several stamps on one line. */
function parseLrc(lrc: string): Line[] {
  const stamp = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const lines: Line[] = [];

  for (const raw of lrc.split("\n")) {
    stamp.lastIndex = 0;
    const times: number[] = [];
    let match: RegExpExecArray | null;
    while ((match = stamp.exec(raw)) !== null) {
      const min = Number(match[1]);
      const sec = Number(match[2]);
      // Two digits mean centiseconds, three mean milliseconds.
      const frac = match[3] ? Number(match[3]) / (match[3].length === 3 ? 1000 : 100) : 0;
      times.push(min * 60 + sec + frac);
    }
    if (times.length === 0) continue;

    const text = raw.replace(stamp, "").trim();
    for (const time of times) lines.push({ time, text });
  }

  return lines.sort((a, b) => a.time - b.time);
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: LyricsData }
  | { status: "none" }
  | { status: "error" };

export function LyricsPanel({ track }: { track: Track }) {
  const [state, setState] = useState<State>({ status: "idle" });
  const position = usePlayerStore((s) => s.position);
  const seek = usePlayerStore((s) => s.seek);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getLyrics(track.title, track.artist, track.duration)
      .then((data) => {
        if (cancelled) return;
        setState(data ? { status: "ok", data } : { status: "none" });
      })
      .catch(() => !cancelled && setState({ status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [track.id, track.title, track.artist, track.duration]);

  const lines = useMemo(
    () =>
      state.status === "ok" && state.data.synced
        ? parseLrc(state.data.synced)
        : [],
    [state],
  );

  // Last line whose timestamp has passed.
  const activeIndex = useMemo(() => {
    if (lines.length === 0) return -1;
    let lo = 0;
    let hi = lines.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid]!.time <= position) {
        found = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return found;
  }, [lines, position]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (state.status === "loading") {
    return <Empty>{t.lyrics.loading}</Empty>;
  }
  if (state.status === "none" || state.status === "error") {
    return <Empty>{t.lyrics.none}</Empty>;
  }
  if (state.status !== "ok") return null;

  // Synced: a scrolling, clickable transcript.
  if (lines.length > 0) {
    return (
      <div className="flex flex-col gap-1 py-[35vh] text-center">
        {lines.map((line, i) => (
          <button
            key={`${line.time}-${i}`}
            ref={i === activeIndex ? activeRef : undefined}
            onClick={() => seek(line.time)}
            className={cn(
              "mx-auto max-w-2xl rounded-[var(--radius-control)] px-3 py-1.5 text-balance text-xl font-semibold leading-snug transition-all duration-[var(--motion-slow)]",
              i === activeIndex
                ? "scale-[1.02] text-foreground"
                : "text-muted-foreground/50 hover:text-muted-foreground",
            )}
          >
            {line.text || "♪"}
          </button>
        ))}
      </div>
    );
  }

  // Plain text: no timings, so just render it.
  return (
    <div className="mx-auto max-w-2xl whitespace-pre-wrap py-8 text-center text-lg leading-relaxed text-muted-foreground">
      {state.data.plain}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
