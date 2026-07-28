import { useEffect } from "react";

/**
 * Shorten the distance one wheel notch scrolls.
 *
 * WebKitGTK's own wheel animation is off (see `platform::tame_wheel_scrolling`),
 * which fixed the crawl-then-lurch curve but left each notch covering a lot of
 * ground. This scales the step down — and *only* the step:
 *
 *   - one `scrollTop` write per input event, never per frame. The earlier
 *     inertia hook chased a target with `requestAnimationFrame`, and a scroll
 *     write inside every frame is a repaint inside every frame, which is what
 *     made scrolling expensive. Nothing here animates.
 *   - precise devices are left completely alone. A touchpad already sends a
 *     stream of small deltas with its own momentum, and scaling those would
 *     make two-finger scrolling feel sluggish rather than controlled.
 */

/** Fraction of the platform's step to actually travel. */
const STEP = 0.65;
/** Below this, a delta is a momentum stream rather than a discrete notch. */
const NOTCH_THRESHOLD = 30;

/**
 * Whether something between `target` and `root` is itself scrollable and can
 * still move in this direction.
 *
 * The listener sits on the outer scroller, so a wheel over the queue or the
 * lyrics panel bubbles up to it. Claiming those events would scroll the page
 * behind the panel the user is pointing at, so they are handed back to the
 * platform untouched.
 */
function overNestedScroller(
  target: EventTarget | null,
  root: HTMLElement,
  deltaY: number,
): boolean {
  let node = target instanceof Element ? target : null;

  while (node && node !== root) {
    if (node instanceof HTMLElement && node.scrollHeight > node.clientHeight) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        const atTop = node.scrollTop <= 0;
        const atBottom =
          node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
        if ((deltaY < 0 && !atTop) || (deltaY > 0 && !atBottom)) return true;
      }
    }
    node = node.parentElement;
  }

  return false;
}

export function useWheelStep(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el) return;
    const scroller = el;

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // zoom gesture, not a scroll
      if (Math.abs(e.deltaY) < NOTCH_THRESHOLD) return; // has its own momentum
      if (overNestedScroller(e.target, scroller, e.deltaY)) return;

      // deltaMode 1 is lines, 2 is pages; normalise both to pixels.
      const pixels =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * scroller.clientHeight
            : e.deltaY;

      const limit = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      const next = Math.min(
        limit,
        Math.max(0, scroller.scrollTop + pixels * STEP),
      );
      // Nothing to do at either end — leaving the event alone lets the platform
      // show its overscroll feedback.
      if (next === scroller.scrollTop) return;

      e.preventDefault();
      scroller.scrollTop = next;
    }

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [el]);
}
