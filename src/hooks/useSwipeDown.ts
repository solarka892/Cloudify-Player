import { useRef, type TouchEvent } from "react";

/**
 * Pull a sheet down to close it.
 *
 * The full-screen player is the one surface in the app that covers everything
 * else, and on a phone its only exit was a 36px chevron in the corner the thumb
 * reaches last. Dragging it away is what every music app on the platform does,
 * and it is the gesture people try first.
 *
 * Returns handlers to spread onto the sheet's root. Deliberately not a live
 * drag: following the finger means the sheet has to be transformed every frame,
 * and a full-screen blurred cover is the most expensive thing in the app to
 * re-composite. The threshold is generous instead, so the gesture is forgiving
 * even though it is not animated.
 */

/** How far down the finger has to travel to mean "close". */
const TRAVEL_PX = 90;
/** How far sideways it may wander first. */
const SLOP_PX = 60;

export function useSwipeDown(onDismiss: () => void): {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
} {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart(e) {
      const touch = e.touches[0];
      // Only from the top of the sheet, and only with one finger: lower down
      // there are scrollable lyrics and a queue, and pulling those *is* a
      // vertical drag that must not close the view.
      if (e.touches.length !== 1 || !touch) {
        start.current = null;
        return;
      }
      const bounds = e.currentTarget.getBoundingClientRect();
      start.current =
        touch.clientY - bounds.top < 160
          ? { x: touch.clientX, y: touch.clientY }
          : null;
    },

    onTouchMove(e) {
      const from = start.current;
      const touch = e.touches[0];
      if (!from || !touch) return;
      if (Math.abs(touch.clientX - from.x) > SLOP_PX) {
        start.current = null;
        return;
      }
      if (touch.clientY - from.y < TRAVEL_PX) return;
      start.current = null;
      onDismiss();
    },

    onTouchEnd() {
      start.current = null;
    },
  };
}
