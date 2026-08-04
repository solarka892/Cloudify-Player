import { useCallback, useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useNavStore } from "@/stores/useNavStore";
import { setViewScroller, scrollViewToTop } from "@/lib/scroll";
import { useWheelStep } from "@/hooks/useWheelStep";
import { useCompact } from "@/hooks/useCompact";
import { Ambient } from "@/components/Ambient";
import type { ViewId } from "@/components/shell/nav-items";
import {
  AppleDock,
  AppleRail,
  AppleSidebar,
  AppleTopBar,
} from "./AppleNav";

/**
 * The application frame, iOS 26 / Tahoe.
 *
 * Same contract as `AppShell` — it owns the backdrop, the navigation and the
 * player slot, and views render into `children` — but a different structure,
 * and the difference is the point of the mode:
 *
 *   - Chrome floats. The sidebar and the dock are objects lying inside the
 *     window with the wallpaper visible all the way around them, not strips
 *     welded to its edges. There is no hairline anywhere, because nothing
 *     touches anything.
 *   - On a wide window the content is its own rounded pane beside or below the
 *     chrome, which is what Tahoe does; on a narrow one it runs full-bleed and
 *     scrolls *behind* the floating dock and player, which is what iOS 26 does.
 *     The reserved padding at the bottom is what keeps the last row reachable.
 *   - All three `layout` settings work, each in this mode's own idiom: the
 *     sidebar and the rail are the two states of an iPadOS sidebar, and the top
 *     arrangement is a Tahoe toolbar. A phone-width window still gets the dock
 *     regardless, the same way the other shell falls back to tabs.
 */
export function AppleShell({
  view,
  onNavigate,
  children,
  player,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  children: React.ReactNode;
  player?: React.ReactNode;
}) {
  const compact = useCompact();
  const layout = useSettingsStore((s) => s.layout);
  // A full-screen blur costs the same whether or not it has an image behind
  // it, so the element simply isn't mounted when it has nothing to do.
  const showBackdrop = useSettingsStore((s) => s.backdrop.mode !== "none");
  const detail = useNavStore((s) => s.detail);

  // The scroller belongs to the shell but is scrolled by whoever swaps the
  // content, so it is published rather than passed down. Held in state as well,
  // so hooks that attach to the element re-attach when the layout replaces it.
  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const scroller = useCallback((el: HTMLElement | null) => {
    setScrollerEl(el);
    setViewScroller(el);
  }, []);

  useWheelStep(scrollerEl);

  useEffect(() => {
    scrollViewToTop();
  }, [view, detail]);

  // The content pane is the same in all three wide arrangements — only what
  // floats beside or above it changes — so it is built once.
  const pane = (
    <div className="lg-pane relative min-h-0 flex-1 overflow-hidden">
      <main ref={scroller} className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-7 py-7">{children}</div>
      </main>
    </div>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {showBackdrop && <div className="app-backdrop" aria-hidden />}
      <Ambient className="fixed z-[1]" />

      {compact ? (
        <>
          <main
            ref={scroller}
            className="relative z-10 min-h-0 flex-1 overflow-y-auto"
          >
            {/* The bottom padding reserves the floating chrome's height plus
                its gaps. Content scrolls under the glass, which is the whole
                effect; without the reserve the last row would sit under it
                permanently instead of passing behind it. */}
            <div
              className="mx-auto w-full max-w-3xl px-4 pt-4"
              style={{
                paddingBottom: `calc(${player ? "10.5rem" : "6.5rem"} + env(safe-area-inset-bottom, 0px))`,
              }}
            >
              {children}
            </div>
          </main>

          {/* One stack, so the player and the dock keep a single gap between
              them and a single inset from the window. The inset and the gesture
              bar are added together rather than set as two `padding-bottom`
              declarations, one of which would simply win over the other. */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-3"
            style={{
              paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            }}
          >
            {player && <div className="pointer-events-auto">{player}</div>}
            <div className="pointer-events-auto">
              <AppleDock view={view} onNavigate={onNavigate} />
            </div>
          </div>
        </>
      ) : layout === "top" ? (
        <>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3 pb-0">
            <AppleTopBar view={view} onNavigate={onNavigate} />
            {pane}
          </div>

          {player && <div className="relative z-20 shrink-0 p-3">{player}</div>}
        </>
      ) : (
        <>
          <div className="relative z-10 flex min-h-0 flex-1 gap-3 p-3 pb-0">
            {layout === "rail" ? (
              <AppleRail view={view} onNavigate={onNavigate} />
            ) : (
              <AppleSidebar view={view} onNavigate={onNavigate} />
            )}
            {pane}
          </div>

          {player && <div className="relative z-20 shrink-0 p-3">{player}</div>}
        </>
      )}
    </div>
  );
}
