/**
 * A media query as React state.
 *
 * Seeded from the real viewport so the first paint is already correct — a
 * desktop-width first render followed by a correction is a visible jump.
 */

import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    // A rotation between mount and effect would otherwise be missed.
    setMatches(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
