import { isAndroid, isApplePlatform } from "./platform";

/**
 * The window itself: dragging it, and resizing it from its own edges.
 *
 * A thin layer over `@tauri-apps/api/window` for one reason — none of it exists
 * on Android, and half of it does not exist in a browser tab (`vitest`, `vite
 * preview`). Everything here resolves to a no-op rather than throwing, so the
 * frame can call these unconditionally and no caller needs to ask which platform
 * it is on.
 *
 * Each function imports the API lazily. A static import would pull the window
 * plugin into the Android bundle for code that can never run there.
 */

/**
 * Whether this build frames its own window at all.
 *
 * False on Android, which has no window, and false on Apple platforms, where
 * the window is decorated and the system draws the frame itself — see
 * `tauri.macos.conf.json`. macOS has no `Alt+F4` and no `Alt+Space` window
 * menu, so an undecorated window there is one a mouse cannot close, move or
 * resize; the overlay title bar gives back the traffic lights and the drag,
 * and with a real frame the compositor's resize border returns with them.
 * Drawing our own strips on top of it would only fight it for the top edge.
 */
export const hasWindowChrome = !isAndroid && !isApplePlatform;

type Win = Awaited<
  ReturnType<typeof import("@tauri-apps/api/window").getCurrentWindow>
>;

/**
 * The current window, or `null` where there is no window API.
 *
 * Failures are swallowed on purpose: every caller is a piece of chrome whose
 * correct behaviour when the window cannot be reached is to do nothing, not to
 * put an error in front of the user.
 */
async function win(): Promise<Win | null> {
  if (!hasWindowChrome) return null;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/**
 * Hand the drag to the compositor.
 *
 * `data-tauri-drag-region` on the bar covers dragging by itself, but not the
 * double-click-to-maximise that has to live on the same element — so the bar
 * handles pointer-down itself and calls this, and the attribute is left off.
 */
export async function startWindowDrag(): Promise<void> {
  await (await win())?.startDragging();
}

/** The eight directions a window can be resized in. */
export type ResizeEdge =
  | "North"
  | "South"
  | "East"
  | "West"
  | "NorthEast"
  | "NorthWest"
  | "SouthEast"
  | "SouthWest";

/**
 * Begin a resize from one of the window's own edge strips.
 *
 * Undecorated windows lose the compositor's invisible resize border along with
 * the visible frame, so the app has to provide its own. What it does *not* lose
 * is keyboard and edge snapping: those are the window manager's, they act on the
 * window rather than on its frame, and `startResizeDragging` is the same request
 * a decorated border makes — so Win+arrow and dragging to a screen edge keep
 * working. See `docs/window-chrome.md` for what was verified where.
 */
export async function startWindowResize(edge: ResizeEdge): Promise<void> {
  await (await win())?.startResizeDragging(edge);
}
