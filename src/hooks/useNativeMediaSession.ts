/**
 * Keeps the OS-level playback session in step with the player.
 *
 * A no-op on desktop, where the webview's own Media Session API already covers
 * MPRIS and SMTC (see `bindMediaSession` in the player store). On Android it is
 * what keeps audio alive at all once the screen goes off — see
 * `src/lib/nativeMedia.ts`.
 *
 * Driven by a store subscription rather than calls sprinkled through the store's
 * actions: every one of `playTrack`, `togglePlay`, `next`, `prev`, `seek`,
 * `cycleRepeat` and the queue edits would otherwise need to remember to publish,
 * and the one that forgot would leave a stale lock screen.
 */

import { useEffect } from "react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { isAndroid } from "@/lib/platform";
import {
  clearNowPlaying,
  onMediaAction,
  publishNowPlaying,
  type NowPlaying,
} from "@/lib/nativeMedia";
import { artwork } from "@/lib/utils";

/**
 * How far the position may drift before it counts as a seek worth republishing.
 *
 * `timeupdate` fires several times a second, and pushing each one across the
 * bridge would be pure overhead: Android extrapolates the progress bar from the
 * playback speed, so it only needs to hear about jumps.
 */
const SEEK_TOLERANCE_S = 2;

export function useNativeMediaSession(): void {
  useEffect(() => {
    if (!isAndroid) return;

    // ── outbound: player → OS ──────────────────────────────────────────────
    let lastKey = "";
    let lastPosition = 0;

    const publish = (state: ReturnType<typeof usePlayerStore.getState>) => {
      const { current, isPlaying, duration, position, pos, order, repeat } = state;

      if (!current) {
        if (lastKey !== "") {
          lastKey = "";
          void clearNowPlaying();
        }
        return;
      }

      const canSkipNext = pos + 1 < order.length || repeat === "all";
      // `prev` restarts the track rather than refusing when it is the first one,
      // so the button is always worth offering.
      const canSkipPrevious = true;

      // Everything the notification actually renders. Position is deliberately
      // absent: it changes constantly and is handled by the drift check below.
      const key = [
        current.id,
        isPlaying,
        Math.round(duration),
        canSkipNext,
        canSkipPrevious,
      ].join("|");

      const drifted = Math.abs(position - lastPosition) > SEEK_TOLERANCE_S;
      if (key === lastKey && !drifted) return;
      lastKey = key;
      lastPosition = position;

      const payload: NowPlaying = {
        title: current.title,
        artist: current.artist ?? "",
        artworkUrl: artwork(current.artwork_url ?? null, "t500x500"),
        durationMs: Math.round((Number.isFinite(duration) ? duration : 0) * 1000),
        positionMs: Math.round(position * 1000),
        playing: isPlaying,
        canSkipNext,
        canSkipPrevious,
      };
      void publishNowPlaying(payload);
    };

    // A track already loaded when this mounts still needs announcing.
    publish(usePlayerStore.getState());
    const unsubscribe = usePlayerStore.subscribe(publish);

    // ── inbound: OS → player ───────────────────────────────────────────────
    const listener = onMediaAction((action) => {
      const player = usePlayerStore.getState();
      switch (action.kind) {
        case "play":
          if (!player.isPlaying) player.togglePlay();
          break;
        case "pause":
          if (player.isPlaying) player.togglePlay();
          break;
        case "next":
          player.next();
          break;
        case "previous":
          player.prev();
          break;
        case "stop":
          if (player.isPlaying) player.togglePlay();
          break;
        case "seek":
          player.seek(action.positionMs / 1000);
          break;
      }
    });

    return () => {
      unsubscribe();
      // Registration can still be in flight on a fast remount (StrictMode), so
      // the unregister chains onto it rather than racing it.
      void listener.then((handle) => handle?.unregister());
    };
  }, []);
}
