import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Let something animate on the way out.
 *
 * A conditionally-rendered overlay has an entry animation and no exit one: the
 * parent flips a flag and React removes the node in the same frame, so it
 * vanishes. The usual fix is to lift "is it closing" into the parent, which
 * spreads one animation across two components.
 *
 * This keeps it in the overlay instead. Call `dismiss` where you would have
 * called `onClose`; the overlay marks itself `leaving`, renders the exit class,
 * and calls `onClose` once the animation has had its time. Nothing above needs
 * to know.
 *
 * The duration is read from `--motion-fast` rather than hardcoded, so a skin
 * that slows its motion down does not get its overlays cut off mid-animation.
 */
export function useDismiss(onClose: () => void): {
  leaving: boolean;
  dismiss: () => void;
} {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const dismiss = useCallback(() => {
    // A second click while the exit is already running must not queue a second
    // close — the first timer is still going to fire.
    if (leaving) return;
    setLeaving(true);
    timer.current = window.setTimeout(onClose, motionFast());
  }, [leaving, onClose]);

  return { leaving, dismiss };
}

/**
 * `--motion-fast` in milliseconds.
 *
 * Falls back to 180 — the token's own default — if the property is missing or
 * expressed in a unit this does not parse. A wrong-but-plausible duration only
 * clips an animation; throwing here would take the overlay with it.
 */
function motionFast(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-fast")
    .trim();
  const ms = /^([\d.]+)ms$/.exec(raw);
  if (ms) return Number(ms[1]);
  const s = /^([\d.]+)s$/.exec(raw);
  if (s) return Number(s[1]) * 1000;
  return 180;
}
