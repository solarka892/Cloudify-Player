import { hasWindowChrome, startWindowResize, type ResizeEdge } from "@/lib/window";
import { cn } from "@/lib/utils";

/**
 * What is left of the window frame: eight invisible strips at the edges.
 *
 * The app used to draw a title bar — a 30px row with the wordmark, the current
 * section and the three window buttons, above everything else. It is gone. It
 * carried one word the screen below it already said, one mark that is also in
 * the rail, and three buttons; against a window whose top edge is now the
 * playing track's waveform, it was a strip of chrome between the app and its own
 * signature.
 *
 * The buttons outlived it for a while, floating over the content in the top
 * right corner, and then went too: over a borderless window they read as the one
 * piece of somebody else's interface left on screen. Minimise, maximise and
 * close belong to the window manager, which every desktop already offers by
 * keyboard and by window menu — `Alt+F4` and `Alt+Space` on Windows, whatever
 * the compositor is bound to on Linux. Nothing in the app calls for them.
 *
 * That last argument is a Windows and Linux argument, and it does not travel.
 * macOS has neither of those bindings: its window buttons *are* the traffic
 * lights, so an undecorated window there cannot be closed, moved or resized
 * with a mouse at all. It therefore keeps its frame, with the title bar made
 * transparent so the app still reaches the top edge, and renders none of this —
 * see `hasWindowChrome` and `tauri.macos.conf.json`.
 *
 * What could not go with them: the resize strips. An undecorated window loses
 * the compositor's invisible border along with the visible one, so without these
 * the window can only be resized from a keyboard shortcut.
 *
 * Dragging moved with the bar: `ViewHead` carries `data-tauri-drag-region`, so a
 * window is dragged by the empty space beside a screen's title. Tauri only
 * starts a drag when the *target* carries the attribute, so a click on the title
 * text or in the search field beside it is still a click.
 *
 * Renders nothing on Android, where there is no window to frame.
 */

/** The strip along each edge that resizes the window. */
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

export function WindowControls() {
  if (!hasWindowChrome) return null;

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
