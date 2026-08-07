/**
 * The OS-level playback session.
 *
 * On desktop the webview's own Media Session API already reaches MPRIS and SMTC,
 * and the Rust commands below are no-ops. On Android it is load-bearing: a
 * backgrounded WebView is starved of CPU and eventually frozen, so without the
 * foreground service these calls start, audio stops the moment the screen goes
 * off. The same service owns the lock-screen controls, whose presses arrive back
 * here as [[MediaAction]]s.
 *
 * See `src-tauri/src/media/mod.rs` and, for the Kotlin, `PlaybackService.kt`.
 */

import { invoke } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";
import type { NativeListener } from "./nativeNav";

/** Mirrors `media::NowPlaying` on the Rust side. */
export interface NowPlaying {
  title: string;
  artist: string;
  artworkUrl: string | null;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  canSkipNext: boolean;
  canSkipPrevious: boolean;
}

/** A press on the lock screen, the notification, or a headset button. */
export type MediaAction =
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "stop" }
  | { kind: "seek"; positionMs: number };

/** Publish the current track and transport state. */
export async function publishNowPlaying(state: NowPlaying): Promise<void> {
  await invoke("media_session_update", { state });
}

/** Playback has stopped for good; drop the session and its notification. */
export async function clearNowPlaying(): Promise<void> {
  await invoke("media_session_stop");
}

/**
 * Kotlin sends the raw action strings from `PlaybackService`; they are mapped
 * here so nothing above this module has to know them.
 */
const ACTIONS: Record<string, MediaAction["kind"]> = {
  "com.cloudifyplayer.app.PLAY": "play",
  "com.cloudifyplayer.app.PAUSE": "pause",
  "com.cloudifyplayer.app.NEXT": "next",
  "com.cloudifyplayer.app.PREVIOUS": "previous",
  "com.cloudifyplayer.app.STOP": "stop",
  "com.cloudifyplayer.app.SEEK": "seek",
};

interface RawMediaAction {
  action: string;
  positionMs?: number;
}

/** Must match `CloudifyPlugin.emitMediaAction`. */
const ACTION_EVENT = "cloudify:media-action";

/**
 * Listen for transport commands from outside the app.
 *
 * A plain DOM event rather than `addPluginListener`, and that change is a fix
 * rather than a refactor: registering a plugin listener goes through Tauri's
 * ACL, this plugin has no ACL manifest, and every registration was failing
 * silently — so the lock screen and the notification have never actually been
 * able to drive the player, however correct the Kotlin half was. See
 * `lib/nativeNav.ts` for the full story and `MainActivity.dispatchToWeb` for the
 * route that does work.
 *
 * Resolves to null off Android — the caller has nothing to clean up.
 */
export async function onMediaAction(
  handler: (action: MediaAction) => void,
): Promise<NativeListener | null> {
  if (!isAndroid) return null;

  const listener = (event: Event) => {
    const raw = (event as CustomEvent<RawMediaAction | null>).detail;
    if (!raw) return;
    const kind = ACTIONS[raw.action];
    if (!kind) return;
    if (kind === "seek") {
      // A seek without a position is not actionable; the service always sends
      // one, but a malformed event should not move playback to 0.
      if (raw.positionMs == null) return;
      handler({ kind: "seek", positionMs: raw.positionMs });
      return;
    }
    handler({ kind });
  };

  window.addEventListener(ACTION_EVENT, listener);
  return {
    unregister: () => window.removeEventListener(ACTION_EVENT, listener),
  };
}
