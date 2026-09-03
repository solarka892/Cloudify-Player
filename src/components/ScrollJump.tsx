import { useEffect, useState } from "react";
import { ChevronsDown } from "lucide-react";
import { scrollViewToBottom, scrollViewToTop } from "@/lib/scroll";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Jump to the end of a long page, then back to the top.
 *
 * The likes list is 1328 rows; reaching the end of it by wheel is a job, and
 * coming back is the same job again. One button does both, and which one it is
 * depends on where you already are: in the top half it goes down, past the
 * halfway mark it goes up. That way it never needs two buttons, and it never
 * offers the direction you just came from.
 *
 * It lives in the shell rather than on the likes screen because the app has one
 * scroll container for every view — so a single button serves the library, a
 * playlist, search results and anything long that comes later, with nothing to
 * remember when a new screen is added.
 *
 * Sticky inside that scroller rather than fixed to the window: the scrollport
 * ends where the player bar begins, so sticking to its bottom edge clears the
 * bar and the phone's bottom tabs without either of them having to publish a
 * height for this to subtract.
 */
export function ScrollJump({ scroller }: { scroller: HTMLElement | null }) {
  /** `null` while the page is too short to be worth a jump. */
  const [dir, setDir] = useState<"down" | "up" | null>(null);

  useEffect(() => {
    if (!scroller) return;

    function measure() {
      if (!scroller) return;
      const hidden = scroller.scrollHeight - scroller.clientHeight;
      // More than one screenful still to come. Below that, the wheel is
      // already the shorter way and a button is furniture.
      if (hidden <= scroller.clientHeight) {
        setDir(null);
        return;
      }
      setDir(scroller.scrollTop > hidden / 2 ? "up" : "down");
    }

    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    // The page's own height is what decides whether the button exists at all,
    // and that changes without a scroll: a tab is switched, a library finishes
    // loading, a list is filtered down to four rows.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    for (const child of scroller.children) observer.observe(child);
    window.addEventListener("resize", measure);
    return () => {
      scroller.removeEventListener("scroll", measure);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [scroller]);

  const label = dir === "up" ? t.common.toTop : t.common.toBottom;

  return (
    /* Zero height, so the button adds nothing to the page's own length, and
       `items-end` alone puts it above that line — a translate on top of that
       lifted it a whole button clear of the bar, which is where it was floating
       in the middle of nothing. `pointer-events-none` on the strip and back on
       for the button: the strip spans the width of the scrollport, and without
       this it would swallow clicks on the rows behind it. */
    <div
      className="pointer-events-none sticky bottom-3 z-20 flex h-0 items-end justify-end pr-3"
      aria-hidden={dir === null}
    >
      <button
        onClick={() => (dir === "up" ? scrollViewToTop() : scrollViewToBottom())}
        tabIndex={dir === null ? -1 : undefined}
        aria-label={label}
        title={label}
        className={cn(
          // Fades and rises in rather than appearing: it arrives while the user
          // is scrolling, and a button that materialises under a moving pointer
          // is the kind of thing that gets clicked by accident.
          "press panel panel-raised pointer-events-auto flex h-10 w-10 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-[opacity,translate,color] duration-[var(--motion-slow)] hover:text-foreground",
          dir === null && "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        {/* One glyph that turns over, not two that swap: the arrows are the
            same shape and the turn is what says the button changed its mind.
            The press animation is the glyph's too, so the button itself never
            moves under the pointer — see `.press-glyph`. */}
        <ChevronsDown
          className={cn(
            "press-glyph h-4 w-4 transition-transform duration-[var(--motion-slow)]",
            dir === "up" && "rotate-180",
          )}
        />
      </button>
    </div>
  );
}
