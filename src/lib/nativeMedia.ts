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

import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import { isAndroid } from "./platform";

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

/**
 * Listen for transport commands from outside the app.
 *
 * Resolves to null on any platform without the plugin — the caller has nothing
 * to clean up and nothing to special-case.
 */
export async function onMediaAction(
  handler: (action: MediaAction) => void,
): Promise<PluginListener | null> {
  if (!isAndroid) return null;

  return addPluginListener<RawMediaAction>("cloudify", "mediaAction", (raw) => {
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
  });
}
