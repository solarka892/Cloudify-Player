import { useEffect, type RefObject } from "react";

/**
 * Inertial wheel scrolling.
 *
 * WebKitGTK gives a wheel notch no momentum at all, and `scroll-behavior:
 * smooth` — which it *does* apply to wheel input, unlike Chrome — animates each
 * notch on a curve we cannot shape, which reads as "crawls, then lurches". So
 * the glide is done here instead: accumulate notches into a target and chase it
 * with an exponential ease-out, which is what makes a long list feel like it
 * carries weight.
 *
 * Precise devices (touchpads, Apple mice) already send their own momentum as a
 * stream of small deltas. Those are left completely alone — hijacking them
 * would replace good inertia with worse inertia.
 */

/** Below this, a delta is a momentum stream rather than a discrete notch. */
const NOTCH_THRESHOLD = 30;
/** Fraction of the remaining distance covered per frame. */
const CHASE = 0.18;
/** Stop chasing once this close, to avoid a sub-pixel tail. */
const SETTLED = 0.5;

export function useGlideScroll(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    let target = el.scrollTop;
    let gliding = false;
    let frame = 0;

    function limit(): number {
      return Math.max(0, el!.scrollHeight - el!.clientHeight);
    }

    function tick() {
      const current = el!.scrollTop;
      const remaining = target - current;
      if (Math.abs(remaining) < SETTLED) {
        el!.scrollTop = target;
        gliding = false;
        return;
      }
      el!.scrollTop = current + remaining * CHASE;
      frame = requestAnimationFrame(tick);
    }

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey) return; // zoom gesture, not a scroll
      if (Math.abs(e.deltaY) < NOTCH_THRESHOLD) return; // has its own momentum

      e.preventDefault();
      // deltaMode 1 is lines, 2 is pages; normalise both to pixels.
      const pixels =
        e.deltaMode === 1
          ? e.deltaY * 16
          : e.deltaMode === 2
            ? e.deltaY * el!.clientHeight
            : e.deltaY;

      // Re-anchor to reality if the element moved without us.
      if (!gliding) target = el!.scrollTop;
      target = Math.min(limit(), Math.max(0, target + pixels));

      if (!gliding) {
        gliding = true;
        frame = requestAnimationFrame(tick);
      }
    }

    // Keyboard, scrollbar drags and anchor jumps bypass us entirely; adopt
    // wherever they left off so the next notch doesn't snap back.
    function onScroll() {
      if (!gliding) target = el!.scrollTop;
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref, enabled]);
}
