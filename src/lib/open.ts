import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";

/**
 * Open a link in the user's real browser.
 *
 * Never `window.open`, and never `<a target="_blank">`. Both work on the
 * desktop webview and do **nothing at all** in Android's, which refuses to
 * spawn a second window unless the host has opted into multi-window support
 * and implemented `onCreateWindow` — so on a phone every "buy", "download the
 * original" and "open on SoundCloud" was a button that visibly did nothing.
 *
 * The opener plugin hands the URL to the OS instead, which is also the right
 * behaviour on the desktop: these are soundcloud.com pages and shop links, and
 * they belong in a browser rather than inside a music player.
 */
export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    // A webview without the plugin (or a denied scope) still has the old path,
    // which is better than swallowing the click entirely.
    window.open(url, "_blank", "noopener,noreferrer");
    toast(t.track.openOnSc, "info");
  }
}
