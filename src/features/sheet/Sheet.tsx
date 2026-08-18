import { useCallback, useEffect, useState } from "react";
import { t } from "@/i18n";
import { useCompact } from "@/hooks/useCompact";
import { setViewScroller, scrollViewToTop } from "@/lib/scroll";
import { useWheelStep } from "@/hooks/useWheelStep";
import { useNavStore } from "@/stores/useNavStore";
import { WindowControls } from "@/components/shell/WindowControls";
import { Index } from "./Index";
import { Legend } from "./Legend";

/**
 * The sheet: the frame the whole app is drawn on.
 *
 * ```
 * ┌──────────────────────────────────────────────┐
 * │  cloudify · LIBRARY        home library …    │  the margin: title + index
 * ├──────────────────────────────────────────────┤
 * │                                              │
 * │   the body: one scroll, full bleed           │
 * │                                              │
 * │  ┌───────────────┐                           │
 * │  │ LEGEND        │                           │  the legend = the player
 * │  └───────────────┘                           │
 * └──────────────────────────────────────────────┘
 * ```
 *
 * A map sheet has a margin carrying the title and the index, and a body carrying
 * the terrain. This is that, and it is deliberately none of the three shapes this
 * app has already worn: no rail down the left, no list in a panel in the middle,
 * no transport bar across the bottom.
 *
 * The body is one scroll with no panel, no card and no inner frame around it. The
 * previous shell put every screen inside a rounded surface, so the window held a
 * panel holding a panel holding a list; a frame around *everything* frames
 * nothing.
 *
 * On a narrow window the legend cannot keep a corner — 19rem of block beside a
 * 360px sheet is most of the sheet — so it goes to the end of the body instead.
 * A printed legend moves for the same reason.
 */
export function Sheet({ children }: { children: React.ReactNode }) {
  const compact = useCompact();
  const view = useNavStore((s) => s.view);
  const detail = useNavStore((s) => s.detail);

  // The body scrolls, and it is not the views' own element — so whoever changes
  // what is on screen needs a way to put the offset back. See `lib/scroll`.
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const scroller = useCallback((el: HTMLElement | null) => {
    setScrollerEl(el);
    setViewScroller(el);
  }, []);

  useWheelStep(scrollerEl);

  // A new sheet always starts at its top. Without this the offset from the
  // previous one survives, and anything shorter than that offset reads as blank.
  useEffect(() => {
    scrollViewToTop();
  }, [view, detail]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-sheet">
      {/* The top margin. Also the window's drag handle: the strip is already the
          one part of the sheet that is not content. */}
      <header
        data-tauri-drag-region
        className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-2 border-b-[1.5px] border-contour px-[var(--margin)] py-3"
      >
        <span className="font-semibold">
          cloudify
        </span>
        <Index />
      </header>

      <div className="relative min-h-0 flex-1">
        {/* The body. `min-w-0` because a long track title in a grid child will
            otherwise push the whole sheet sideways.

            The bottom padding is the legend's room. It is padding rather than a
            column because the legend lies *on* the sheet, the way a printed one
            does — a reserved 19rem column would leave the terrain squeezed into
            three quarters of the paper and the top of that column empty. */}
        <main
          ref={scroller}
          className="h-full min-w-0 overflow-y-auto px-[var(--margin)] py-[var(--margin)]"
        >
          <div
            className="mx-auto flex max-w-[75rem] flex-col gap-[var(--feature-gap)]"
            style={{ paddingBottom: compact ? undefined : "15rem" }}
          >
            {children}
            {compact && <Legend />}
          </div>
        </main>

        {/* The corner of the sheet. */}
        {!compact && (
          <div className="pointer-events-none absolute bottom-0 left-0 p-[var(--margin)]">
            <div className="pointer-events-auto">
              <Legend />
            </div>
          </div>
        )}
      </div>

      {/* What is left of the window frame: eight invisible strips that resize an
          undecorated window. Not a view — window plumbing, and the reason it
          survived the redesign untouched. */}
      <WindowControls />
      <span className="sr-only">{t.app.name}</span>
    </div>
  );
}
