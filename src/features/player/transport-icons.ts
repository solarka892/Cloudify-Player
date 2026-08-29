import { createContext } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

/**
 * Which glyphs the transport draws.
 *
 * A context rather than props, so a skin can replace all four at once without
 * threading them through every button — and in its own module rather than in
 * `controls.tsx`, because a file that exports both components and a context
 * cannot be hot-reloaded.
 *
 * One set draws them now: lucide's, the default below. The context outlived
 * the Apple shell that was the other set, and is kept because replacing all
 * four at once is exactly what a skin would want — and only the *drawing*
 * would change. The behaviour, the labels and the hooks stay in `controls.tsx`.
 */

/** A stand-in for either a lucide icon or a hand-drawn one. */
type Glyph = React.ComponentType<{ className?: string }>;

export interface TransportGlyphs {
  Play: Glyph;
  Pause: Glyph;
  Prev: Glyph;
  Next: Glyph;
}

const LUCIDE_TRANSPORT: TransportGlyphs = {
  Play,
  Pause,
  Prev: SkipBack,
  Next: SkipForward,
};

export const TransportIcons = createContext<TransportGlyphs>(LUCIDE_TRANSPORT);
