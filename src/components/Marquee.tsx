import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A line that scrolls itself when it is too long for its box.
 *
 * What a phone does with a now-playing title, and for the same reason: the
 * alternative is an ellipsis, and an ellipsis on the one line that says what is
 * playing answers the question with "you cannot know". Truncation is right for
 * a list, where the next row is a keystroke away and every row is a candidate;
 * it is wrong for the row the app has already chosen.
 *
 * Only when it has to. A title that fits is left alone — text that moves for no
 * reason is the kind of motion that has to be looked at before it can be
 * ignored, and most titles fit.
 *
 * The travel is measured rather than guessed, so the line stops exactly at its
 * own end instead of scrolling a fixed distance and leaving a gap or cutting a
 * word. Both ends hold for a moment (the keyframes, not a delay — a delay only
 * pauses the first pass), which is what makes it readable rather than a ticker.
 */
export function Marquee({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  /** How far past its box the text runs, in px. `0` means it fits. */
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    function measure() {
      if (!box || !text) return;
      const over = text.scrollWidth - box.clientWidth;
      // A pixel or two is rounding, not an overflow worth animating.
      setShift(over > 2 ? over : 0);
    }

    measure();
    // The box changes width with the window and the text changes with the
    // track; both have to re-measure, and neither fires the other's event.
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(text);
    return () => observer.disconnect();
  }, [children]);

  return (
    <span
      ref={boxRef}
      className={cn("block overflow-hidden whitespace-nowrap", className)}
    >
      <span
        ref={textRef}
        data-marquee={shift > 0 ? "1" : undefined}
        className="inline-block"
        style={
          shift > 0
            ? ({
                "--marquee-shift": `-${shift}px`,
                // Roughly 22px a second: fast enough not to be a wait, slow
                // enough to read. Floored, so a title that only just overflows
                // does not twitch.
                "--marquee-dur": `${Math.max(6, shift / 22)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}
