import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * What stands in for a cover that does not exist.
 *
 * SoundCloud tracks without artwork are common — a third of a big likes page —
 * and the same grey square with the same note glyph, forty times down a list, is
 * the emptiest a library can look. So each missing cover gets one geometric mark
 * instead: a hairline grid, a diagonal, a band along the bottom. Six of them,
 * chosen by the track's id, so the same track always looks the same and a screen
 * full of them reads as a set rather than as a repeat.
 *
 * Marks and glyph are both rendered; CSS decides which is shown, keyed on the
 * active skin (see `globals.css`). A skin that wants the glyph keeps it — this is
 * an Obsidian idea and it would be a change to the other three, not an
 * improvement to them. Nothing here branches on the skin in JS.
 *
 * Entirely CSS gradients over token colours: no images, no canvas, no request,
 * and it inherits the palette, so it is dark marks on light in a light theme.
 */

/** How many gestures exist. Must match `.art-gesture-*` in `globals.css`. */
const GESTURES = 6;

/**
 * Pick a gesture from a seed.
 *
 * A numeric id takes the cheap route: SoundCloud ids are sequential per upload
 * and adjacent rows in a list are rarely adjacent uploads, so a modulo already
 * scatters them. Anything else is hashed, because the strings that land here are
 * titles and station names, and their first characters are far from uniform —
 * a modulo of the length would put half the library on one gesture.
 */
function gestureFor(seed: string | number | null | undefined): number {
  if (seed == null) return 0;
  const n = typeof seed === "number" ? seed : Number(seed);
  if (Number.isFinite(n)) return Math.abs(Math.trunc(n)) % GESTURES;
  let h = 2166136261;
  for (const ch of String(seed)) h = (h ^ ch.codePointAt(0)!) * 16777619;
  return Math.abs(h) % GESTURES;
}

export function ArtFallback({
  seed,
  className,
  /** The glyph, for the skins that show one. A playlist is not a track. */
  Glyph = Music,
  glyphClassName = "h-4 w-4",
}: {
  /** Track or playlist id — same seed, same mark, every time. */
  seed: string | number | null | undefined;
  className?: string;
  Glyph?: typeof Music;
  glyphClassName?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "art-fallback relative flex items-center justify-center overflow-hidden bg-secondary",
        className,
      )}
    >
      <span className={`art-gesture art-gesture-${gestureFor(seed)}`} />
      <Glyph className={cn("art-fallback-glyph text-muted-foreground", glyphClassName)} />
    </div>
  );
}
