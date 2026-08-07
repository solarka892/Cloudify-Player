/**
 * The platform's own "back".
 *
 * On Android the back gesture belongs to the system, and the system decides
 * whether it leaves the app — so the app has to say, in advance, whether it has
 * anywhere to go. That is the whole of this module: one bit pushed to Kotlin
 * whenever the navigation stack changes, and one event coming back when the
 * gesture happens and Kotlin has decided it is ours.
 *
 * Asking JS *at the moment of the press* is not an option: `evaluateJavascript`
 * is asynchronous and `OnBackPressedCallback` has to answer synchronously, so
 * the flag has to already be there. See `MainActivity.kt`.
 *
 * Everything here is a no-op off Android, where the same job is done by a mouse
 * button and Alt+← in `hooks/useBackGesture`.
 */

import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";

/**
 * A subscription that can be undone. Mirrors what `addPluginListener` returned,
 * so call sites did not have to change when the transport did.
 */
export interface NativeListener {
  unregister: () => void;
}

/** Tell the host whether the app has somewhere to go back to. */
export async function setCanGoBack(value: boolean): Promise<void> {
  if (!isAndroid) return;
  // Failures are not worth surfacing: the worst case is the back gesture
  // closing the app one screen early, and a toast about it would be noise.
  try {
    await invoke("nav_set_can_go_back", { value });
  } catch {
    // ignored
  }
}

/**
 * Listen for the system back gesture.
 *
 * A plain DOM event, not `addPluginListener`. The latter is the obvious route
 * and is a dead end here: registering a plugin listener goes through Tauri's
 * ACL, and this plugin — built inline with `tauri::plugin::Builder` rather than
 * as a crate — has no ACL manifest at all, so there is no permission that could
 * be granted. Every registration failed with "cloudify.registerListener not
 * allowed. Plugin not found", in a promise nobody was awaiting, which is why the
 * back gesture did nothing and looked like a bug in the navigation instead.
 *
 * Kotlin dispatches it with `evaluateJavascript` — the same mechanism that
 * already delivers the window insets. See `MainActivity.dispatchToWeb`.
 *
 * Resolves to null off Android — the caller has nothing to clean up.
 */
export async function onNativeBack(
  handler: () => void,
): Promise<NativeListener | null> {
  if (!isAndroid) return null;
  const listener = () => handler();
  window.addEventListener(BACK_EVENT, listener);
  return { unregister: () => window.removeEventListener(BACK_EVENT, listener) };
}

/** Must match `CloudifyPlugin.emitBack`. */
const BACK_EVENT = "cloudify:back";
