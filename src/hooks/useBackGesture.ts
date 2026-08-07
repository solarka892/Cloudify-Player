import { useEffect } from "react";
import { canGoBack, useNavStore } from "@/stores/useNavStore";
import { setCanGoBack, onNativeBack } from "@/lib/nativeNav";

/**
 * Every way of going back that is not a button we drew.
 *
 * The app had exactly one route backwards — the "Back" link a detail view
 * happens to render — so on a phone the system gesture quit the app instead of
 * leaving the track, and on a desktop the mouse's back button did nothing. All
 * four inputs below mean the same thing and all four end at `useNavStore.back`:
 *
 *   - **Android's back gesture / button.** Kotlin owns whether it belongs to us
 *     at all, so `canGoBack` is published across the bridge on every change; see
 *     `lib/nativeNav.ts`. When the stack is empty the callback is disabled and
 *     the platform's own "leave the app" behaviour runs, which is right.
 *   - **Mouse buttons 4 and 5.** The two extra buttons on any mouse that has
 *     them, mapped as every other application maps them.
 *   - **Alt + ← / →.** The keyboard equivalent, and the one a desktop user
 *     reaches for first. Deliberately not plain Backspace: this app has search
 *     fields, and a stray Backspace navigating away from a half-typed query is
 *     the single most-hated shortcut in browser history.
 *   - **A swipe from the left edge.** Touch only, and only from the outer
 *     `EDGE_PX`, so it cannot be confused with a horizontal scroll inside a row
 *     of covers.
 *
 * Mounted once, in `App`.
 */

/** How far in from the left edge a swipe may start and still mean "back". */
const EDGE_PX = 28;
/** How far it has to travel before it counts. */
const TRAVEL_PX = 64;
/**
 * How much vertical drift is tolerated on the way.
 *
 * A back swipe and a scroll start identically; the difference is that one keeps
 * going sideways. Bailing out on any real vertical movement is what stops a
 * flick down the edge of a list from leaving the page.
 */
const SLOP_PX = 40;

export function useBackGesture(): void {
  useEffect(() => {
    const back = () => useNavStore.getState().back();
    const forward = () => useNavStore.getState().forward();

    // ── mouse ──────────────────────────────────────────────────────────────
    // `auxclick` rather than `mouseup`: it is the event the platform defines for
    // the non-primary buttons, and it does not fire for a drag that happens to
    // end here. `pointerdown` is cancelled as well because WebKit will otherwise
    // treat button 3 as a text-selection start.
    function onAux(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        back();
      } else if (e.button === 4) {
        e.preventDefault();
        forward();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (e.button === 3 || e.button === 4) e.preventDefault();
    }

    // ── keyboard ───────────────────────────────────────────────────────────
    function onKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        forward();
      }
    }

    // ── touch ──────────────────────────────────────────────────────────────
    let startX = 0;
    let startY = 0;
    let tracking = false;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      // Multi-touch is a pinch or a two-finger scroll; neither is this.
      tracking = e.touches.length === 1 && !!touch && touch.clientX <= EDGE_PX;
      startX = touch?.clientX ?? 0;
      startY = touch?.clientY ?? 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (!tracking) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (Math.abs(touch.clientY - startY) > SLOP_PX) {
        tracking = false;
        return;
      }
      if (touch.clientX - startX < TRAVEL_PX) return;
      tracking = false;
      back();
    }

    function stopTracking() {
      tracking = false;
    }

    window.addEventListener("auxclick", onAux);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", stopTracking, { passive: true });
    window.addEventListener("touchcancel", stopTracking, { passive: true });

    return () => {
      window.removeEventListener("auxclick", onAux);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", stopTracking);
      window.removeEventListener("touchcancel", stopTracking);
    };
  }, []);

  // ── the platform's own back ──────────────────────────────────────────────
  useEffect(() => {
    const listener = onNativeBack(() => useNavStore.getState().back());

    // Kotlin cannot read the store, so the one bit it needs is pushed to it.
    // Published on every change and once now, because the app may already be
    // several screens deep when this mounts (a restored session, a reload).
    let last: boolean | null = null;
    const publish = (state: ReturnType<typeof useNavStore.getState>) => {
      const value = canGoBack(state);
      if (value === last) return;
      last = value;
      void setCanGoBack(value);
    };
    publish(useNavStore.getState());
    const unsubscribe = useNavStore.subscribe(publish);

    return () => {
      unsubscribe();
      // Registration can still be in flight on a fast remount (StrictMode), so
      // the unregister chains onto it rather than racing it.
      void listener.then((handle) => handle?.unregister());
    };
  }, []);
}
