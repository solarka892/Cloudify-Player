import { isAndroid } from "./platform";

/**
 * The window itself: decorations, dragging, the three buttons, the resize edges.
 *
 * A thin layer over `@tauri-apps/api/window` for one reason — none of it exists
 * on Android, and half of it does not exist in a browser tab (`vitest`, `vite
 * preview`). Everything here resolves to a no-op rather than throwing, so the
 * title bar can call these unconditionally and no caller needs to ask which
 * platform it is on.
 *
 * Each function imports the API lazily. A static import would pull the window
 * plugin into the Android bundle for code that can never run there.
 */

/** Whether this build draws its own title bar at all. */
export const hasWindowChrome = !isAndroid;

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

export async function minimizeWindow(): Promise<void> {
  await (await win())?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  await (await win())?.toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  await (await win())?.close();
}

export async function isWindowMaximized(): Promise<boolean> {
  return (await (await win())?.isMaximized()) ?? false;
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

/**
 * Turn the system title bar and frame on or off, live.
 *
 * The window launches undecorated (`tauri.conf.json`), so this is only ever
 * called to put the frame *back* — the escape hatch for a compositor where the
 * app's own chrome does not work. See `nativeFrame` in `useSettingsStore`.
 */
export async function setNativeDecorations(on: boolean): Promise<void> {
  await (await win())?.setDecorations(on);
}

/**
 * Run `fn` whenever the window is resized, and once immediately.
 *
 * Used for one thing: the maximise button's glyph, which has to become a
 * "restore" glyph when the window is maximised — including when it was maximised
 * by a double-click on the bar, by Win+Up, or by dragging to the top of the
 * screen, none of which go through our button.
 */
export async function onWindowResized(
  fn: () => void,
): Promise<() => void> {
  const w = await win();
  if (!w) return () => {};
  fn();
  try {
    return await w.onResized(fn);
  } catch {
    return () => {};
  }
}
