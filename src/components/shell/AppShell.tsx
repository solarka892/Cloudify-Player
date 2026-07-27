import { useRef } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useGlideScroll } from "@/hooks/useGlideScroll";
import { NavRail, NavSidebar, NavTop, type ViewId } from "./nav";

/**
 * The application frame.
 *
 * Owns the backdrop layer, the navigation and the player slot, and arranges
 * them per the `layout` setting. Views render into `children` and must not
 * assume a width — the same view is shown beside a 56px rail and a 240px
 * sidebar.
 */
export function AppShell({
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
  const layout = useSettingsStore((s) => s.layout);
  // A full-screen 40px blur costs the same whether or not it has an image
  // behind it, so the element simply isn't mounted when it has nothing to do.
  const showBackdrop = useSettingsStore((s) => s.backdrop.mode !== "none");
  const scroller = useRef<HTMLElement | null>(null);
  useGlideScroll(scroller, useSettingsStore((s) => s.glideScroll));

  const main = (
    <main ref={scroller} className="relative z-10 min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">{children}</div>
    </main>
  );

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground">
      {showBackdrop && <div className="app-backdrop" aria-hidden />}

      {layout === "top" ? (
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <NavTop view={view} onNavigate={onNavigate} />
          {main}
        </div>
      ) : (
        <div className="relative z-10 flex min-h-0 flex-1">
          {layout === "sidebar" ? (
            <NavSidebar view={view} onNavigate={onNavigate} />
          ) : (
            <NavRail view={view} onNavigate={onNavigate} />
          )}
          {main}
        </div>
      )}

      {player && <div className="relative z-20 shrink-0">{player}</div>}
    </div>
  );
}
