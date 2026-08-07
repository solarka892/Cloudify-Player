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

import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";

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
 * Resolves to null on any platform without the plugin — the caller has nothing
 * to clean up and nothing to special-case.
 */
export async function onNativeBack(
  handler: () => void,
): Promise<PluginListener | null> {
  if (!isAndroid) return null;
  return addPluginListener("cloudify", "navBack", () => handler());
}
