/**
 * Whether the window is phone-shaped.
 *
 * Deliberately a viewport question rather than a platform one: a narrow desktop
 * window wants the same treatment, and a tablet in landscape does not want it on
 * Android. The breakpoint matches Tailwind's `md`, so the CSS and the components
 * always agree about which side of the line they are on.
 */

import { useEffect, useState } from "react";
import { COMPACT_BREAKPOINT } from "@/lib/platform";

const QUERY = `(max-width: ${COMPACT_BREAKPOINT - 1}px)`;

export function useCompact(): boolean {
  // Seeded from the real viewport so the first paint is already correct — a
  // desktop-width first render followed by a correction is a visible jump.
  const [compact, setCompact] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setCompact(event.matches);
    media.addEventListener("change", onChange);
    // A rotation between mount and effect would otherwise be missed.
    setCompact(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return compact;
}
