import { useEffect, useRef, useState } from "react";

/**
 * Windowed rendering for a long, fixed-row-height list.
 *
 * Chunked rendering (render 60, add 60 on scroll) still ends up with the whole
 * list in the DOM and pays a layout spike per chunk — which is what "scrolls
 * slowly, then suddenly speeds up" feels like. This keeps the node count
 * constant no matter how long the list is: only the visible slice plus a
 * little overscan exists at any moment.
 *
 * The list is not its own scroll container here (the app scrolls one `<main>`),
 * so the visible range is derived from the list's position inside whichever
 * ancestor actually scrolls.
 */

/** Nearest ancestor that scrolls, or `null` when the window does. */
function scrollParent(node: HTMLElement): HTMLElement | null {
  let current = node.parentElement;
  while (current) {
    const overflow = getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

export interface VirtualRange {
  start: number;
  end: number;
}

export function useVirtual(
  count: number,
  rowHeight: number,
  overscan = 10,
): { ref: React.RefObject<HTMLDivElement | null>; start: number; end: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<VirtualRange>({
    start: 0,
    // A sane first paint before any measurement happens.
    end: Math.min(count, 30),
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const scroller = scrollParent(node);
    let frame = 0;

    function measure() {
      frame = 0;
      const list = ref.current;
      if (!list) return;

      const listTop = list.getBoundingClientRect().top;
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewHeight = scroller ? scroller.clientHeight : window.innerHeight;

      // How much of the list has scrolled above the viewport.
      const scrolledPast = viewTop - listTop;
      const start = Math.max(0, Math.floor(scrolledPast / rowHeight) - overscan);
      const end = Math.min(
        count,
        Math.ceil((scrolledPast + viewHeight) / rowHeight) + overscan,
      );

      setRange((previous) =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      );
    }

    /** Coalesce to one measurement per frame; scroll fires far more often. */
    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    measure();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [count, rowHeight, overscan]);

  return { ref, start: range.start, end: range.end };
}
