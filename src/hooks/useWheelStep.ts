import { useEffect } from "react";

/**
 * Shorten the distance one wheel notch scrolls, and ease it rather than jump.
 *
 * WebKitGTK's own wheel animation is off (see `platform::tame_wheel_scrolling`),
 * which fixed the crawl-then-lurch curve but left each notch covering a lot of
 * ground in a single hard jump. This scales the step down and glides it:
 *
 *   - **bounded** animation, not inertia. The earlier inertia hook chased a
 *     moving target for as long as momentum lasted, so a fast scroll meant a
 *     scroll write — and therefore a repaint — in every frame for a second or
 *     more. This eases toward a fixed target and stops: a handful of frames per
 *     notch, and idle in between. That distinction is what makes it affordable
 *     with blurred surfaces on screen, where every scrolled frame re-snapshots
 *     each backdrop.
 *   - **additive** targets. A second notch during the glide extends the
 *     existing target instead of restarting from the current offset, so
 *     spinning the wheel accelerates smoothly rather than stuttering.
 *   - precise devices are left completely alone. A touchpad already sends a
 *     stream of small deltas with its own momentum, and animating those would
 *     fight it.
 */

/** Fraction of the platform's step to actually travel. */
const STEP = 0.65;
/** Below this, a delta is a momentum stream rather than a discrete notch. */
const NOTCH_THRESHOLD = 30;
/**
 * Share of the remaining distance to cover each frame. 0.65 lands a notch in
 * two or three frames — around 40ms, which is enough to soften the edge of the
 * jump and not enough to read as travel. Lower values glide, and gliding is what
 * this was tuned away from.
 */
const EASE = 0.65;
/** Closer than this and the remaining distance is not worth another frame. */
const SETTLED = 1;

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

    /** Where the glide is heading; null when it is not running. */
    let target: number | null = null;
    let frame = 0;

    function tick() {
      if (target === null) return;
      const distance = target - scroller.scrollTop;
      if (Math.abs(distance) < SETTLED) {
        scroller.scrollTop = target;
        target = null;
        frame = 0;
        return;
      }
      scroller.scrollTop += distance * EASE;
      frame = requestAnimationFrame(tick);
    }

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
      // Extend the glide in flight rather than restarting from where it happens
      // to be — otherwise a second notch mid-glide loses the distance the first
      // one had not travelled yet.
      const from = target ?? scroller.scrollTop;
      const next = Math.min(limit, Math.max(0, from + pixels * STEP));
      // Nothing to do at either end — leaving the event alone lets the platform
      // show its overscroll feedback.
      if (next === scroller.scrollTop && target === null) return;

      e.preventDefault();
      target = next;
      if (!frame) frame = requestAnimationFrame(tick);
    }

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [el]);
}
