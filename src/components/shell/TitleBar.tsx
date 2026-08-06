import { useEffect, useState } from "react";
import { useNavStore } from "@/stores/useNavStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { NAV_ITEMS } from "./nav-items";
import {
  closeWindow,
  hasWindowChrome,
  isWindowMaximized,
  minimizeWindow,
  onWindowResized,
  startWindowResize,
  toggleMaximizeWindow,
  type ResizeEdge,
} from "@/lib/window";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The window's own title bar.
 *
 * The system one is a rectangle with rounded corners, a gradient and a set of
 * round buttons, drawn by the desktop rather than by the app — which is fine
 * under three of the four skins and fatal under the one whose entire signature
 * is that nothing has a corner radius. Every other pixel of Obsidian breaks
 * against a frame it does not control, so the app draws its own.
 *
 * Not gated on the skin. A title bar is a property of the *window*, not of the
 * look: `tauri.conf.json` launches undecorated, so if this did not render there
 * would be no way to close the app. It is built from tokens and reads correctly
 * in all four skins, and the way back to the system frame is the `nativeFrame`
 * setting — which is a compositor escape hatch, not a style choice.
 *
 * Nothing renders on Android, where there is no window to frame; see
 * `hasWindowChrome`.
 */

/** Height of the bar, and the strip along each edge that resizes the window. */
const EDGES: { edge: ResizeEdge; className: string }[] = [
  // Corners first: they are listed later in the DOM than the sides they overlap,
  // so they win the hit test. A window whose corners resize one axis only is the
  // single most-noticed thing missing from a hand-rolled frame.
  { edge: "North", className: "left-2 right-2 top-0 h-1 cursor-ns-resize" },
  { edge: "South", className: "bottom-0 left-2 right-2 h-1 cursor-ns-resize" },
  { edge: "West", className: "bottom-2 left-0 top-2 w-1 cursor-ew-resize" },
  { edge: "East", className: "bottom-2 right-0 top-2 w-1 cursor-ew-resize" },
  { edge: "NorthWest", className: "left-0 top-0 h-2 w-2 cursor-nwse-resize" },
  { edge: "NorthEast", className: "right-0 top-0 h-2 w-2 cursor-nesw-resize" },
  { edge: "SouthWest", className: "bottom-0 left-0 h-2 w-2 cursor-nesw-resize" },
  { edge: "SouthEast", className: "bottom-0 right-0 h-2 w-2 cursor-nwse-resize" },
];

/**
 * The eight invisible strips that resize the window.
 *
 * An undecorated window loses the compositor's invisible resize border along
 * with the visible frame, so without these the window can only be resized by a
 * keyboard shortcut. 4px, which is what a decorated border gives; the corners are
 * 8px because a 4px corner is not a target anyone hits.
 *
 * What is *not* lost is snapping: Win+arrow and dragging to a screen edge act on
 * the window rather than on its frame, and `startResizeDragging` is the same
 * request a real border makes. See `docs/window-chrome.md`.
 */
function WindowEdges() {
  return (
    <>
      {EDGES.map(({ edge, className }) => (
        <div
          key={edge}
          aria-hidden
          onPointerDown={(e) => {
            // Left button only: a right-click on the frame belongs to the WM.
            if (e.button !== 0) return;
            void startWindowResize(edge);
          }}
          className={cn("fixed z-[100]", className)}
        />
      ))}
    </>
  );
}

/** Minimise: one rule, centred. */
function GlyphMinimize() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
      <rect y="4.5" width="10" height="1" fill="currentColor" />
    </svg>
  );
}

/** Maximise: the outline of a square. */
function GlyphMaximize() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
      <rect
        x="0.5"
        y="0.5"
        width="9"
        height="9"
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Restore: two squares, offset, the way every desktop draws it. */
function GlyphRestore() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" aria-hidden>
      <path d="M2.5 2.5V0.5H9.5V7.5H7.5" fill="none" stroke="currentColor" />
      <rect
        x="0.5"
        y="2.5"
        width="7"
        height="7"
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}

function GlyphClose() {
  return (
    <svg
      viewBox="0 0 10 10"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path d="M.5.5l9 9M9.5.5l-9 9" />
    </svg>
  );
}

export function TitleBar() {
  const nativeFrame = useSettingsStore((s) => s.nativeFrame);
  const view = useNavStore((s) => s.view);
  const detail = useNavStore((s) => s.detail);
  const [maximized, setMaximized] = useState(false);

  // The glyph has to follow the window, not the button: it is also maximised by
  // a double-click on the bar, by Win+Up and by dragging to the top of the
  // screen, none of which pass through here.
  useEffect(() => {
    if (nativeFrame || !hasWindowChrome) return;
    let alive = true;
    const refresh = () => {
      void isWindowMaximized().then((v) => {
        if (alive) setMaximized(v);
      });
    };
    let stop: (() => void) | undefined;
    void onWindowResized(refresh).then((fn) => {
      if (alive) stop = fn;
      else fn();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, [nativeFrame]);

  // With the system frame back on, the system draws all of this.
  if (!hasWindowChrome || nativeFrame) return null;

  // Built out of strings the app already has: the section the nav is on, or the
  // name of whatever is drilled into on top of it.
  const context =
    detail?.title ?? NAV_ITEMS.find((item) => item.id === view)?.label ?? "";

  return (
    <>
      <div
        // Tauri's own handler owns this attribute: it starts the drag on
        // pointer-down and toggles maximise on double-click, which is exactly the
        // pair we want and which cannot be done by hand — `startDragging`
        // swallows the events a double-click detector would need to see. The
        // buttons below are outside the region, so a click on one is a click.
        data-tauri-drag-region
        className="relative z-30 grid h-[var(--chrome-height)] shrink-0 select-none grid-cols-[1fr_auto_1fr] items-center border-b border-border pl-3"
        style={{
          background: `color-mix(in srgb, var(--foreground) var(--chrome-alpha), transparent)`,
        }}
      >
        {/* The mark: a hairline square, which is the app icon at 7px. */}
        <div className="label flex items-center gap-2 text-[length:var(--label-size)] font-semibold text-muted-foreground">
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 border border-muted-foreground"
          />
          <span className="truncate">{t.app.name}</span>
        </div>

        {/* Where you are. Centred and quiet — it is a label, not a heading, and
            the screen below it already says the same thing loudly. */}
        <div className="label min-w-0 justify-self-center truncate px-2 text-[length:var(--label-size)] font-semibold text-muted-foreground">
          {context}
        </div>

        {/* 44px wide, full height, square. Not the desktop's round buttons —
            those are the one control the app cannot restyle, which is most of
            why the frame is ours in the first place. */}
        <div className="flex h-full justify-self-end">
          <WindowButton label={t.window.minimize} onClick={minimizeWindow}>
            <GlyphMinimize />
          </WindowButton>
          <WindowButton
            label={maximized ? t.window.restore : t.window.maximize}
            onClick={toggleMaximizeWindow}
          >
            {maximized ? <GlyphRestore /> : <GlyphMaximize />}
          </WindowButton>
          {/* The only inverting hover in the app, and it is the one button whose
              consequence cannot be undone. */}
          <WindowButton label={t.window.close} onClick={closeWindow} danger>
            <GlyphClose />
          </WindowButton>
        </div>
      </div>

      <WindowEdges />
    </>
  );
}

function WindowButton({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => Promise<void>;
  /** Close. Inverts on hover rather than lifting by 7% like the other two. */
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Opts out of the app-wide press scale: a full-height square button that
      // shrinks under the pointer reads as a bug on a window frame, where every
      // other desktop's buttons only change colour.
      data-window-button
      onClick={() => void onClick()}
      className={cn(
        "grid w-11 place-items-center text-muted-foreground transition-colors duration-[var(--motion-fast)]",
        // Two whole strings rather than one plus an override: both are `hover:`
        // utilities of the same specificity, so which one wins would come down to
        // the order Tailwind happened to emit them in.
        danger
          ? "hover:bg-foreground hover:text-background"
          : "hover:bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
