import type HlsType from "hls.js";

/**
 * HLS playback, for the tracks SoundCloud does not offer as a plain file.
 *
 * A growing share of the catalogue has no `progressive` transcoding at all —
 * only an `.m3u8` playlist — and until now those simply refused to play: the
 * resolver returned "no playable stream" and the user got an error with no
 * reason and nothing to try. They are ordinary tracks; they just need a playlist
 * parser and Media Source Extensions, which is what this is.
 *
 * ## Loaded on demand
 *
 * `hls.js` is 350 kB, and most tracks never touch it. It is imported the first
 * time an HLS source actually turns up, so the app's startup cost is unchanged
 * for everyone who never plays one.
 *
 * ## One instance, torn down on every source change
 *
 * The library attaches to an element and owns its `src` for good — it hands the
 * element a `MediaSource` and feeds it segments. Leaving an old instance
 * attached while a new source is assigned means two things appending to one
 * buffer, which is silence at best. So exactly one instance exists at a time and
 * `release` is called before anything else touches the element, including a
 * plain progressive load.
 *
 * ## Why the element is fed a blob, and why that is good news
 *
 * MSE delivers the audio as a same-origin blob, so unlike a signed CDN URL it is
 * always readable by Web Audio — the equaliser and the visualiser work on an HLS
 * track without the CORS probe the progressive path needs. See `engine.ts`.
 */

/** The live instance, if the current source is HLS. */
let instance: HlsType | null = null;
/** The module, once something has needed it. */
let loading: Promise<typeof HlsType> | null = null;

function load(): Promise<typeof HlsType> {
  loading ??= import("hls.js").then((mod) => mod.default);
  return loading;
}

/**
 * Whether the platform plays `.m3u8` natively — asked *last*, and never
 * believed on its own.
 *
 * `canPlayType("application/vnd.apple.mpegurl")` answers **"maybe"** in
 * Chromium's Android WebView, which cannot play HLS at all. Measured on the
 * emulator 2026-08-08, and it is the whole reason an HLS track played silently:
 * this returned true, the element was handed the playlist, it fetched it, and
 * then sat there with nothing to decode and no error worth the name.
 *
 * Safari and iOS are the platforms where it is true, and they are also the ones
 * without Media Source Extensions for this — so "no MSE" is the reliable signal
 * and this is only the confirmation. See `attach`.
 */
function playsNatively(a: HTMLAudioElement): boolean {
  return a.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/** Detach and destroy the current instance, if any. */
export function release(): void {
  if (!instance) return;
  try {
    instance.destroy();
  } catch {
    // A player that refuses to be destroyed is still dead to us.
  }
  instance = null;
}

/**
 * Point `a` at `url`, over HLS.
 *
 * Resolves once the manifest has parsed — that is, once the element has a
 * duration and `play()` will do something — rather than once playback has
 * started, so the caller keeps its own control over when audio begins.
 *
 * Rejects if the manifest cannot be loaded, so a dead playlist surfaces as the
 * same failure a dead file would.
 */
export async function attach(a: HTMLAudioElement, url: string): Promise<void> {
  release();

  // Media Source Extensions first, native second — the order the library's own
  // documentation prescribes, and the opposite of what this did.
  //
  // Asking the element whether it plays HLS and believing it is the trap: every
  // Chromium says "maybe" and none of them can (see `playsNatively`). MSE is the
  // honest signal, because the platforms that lack it are precisely the ones —
  // Safari, iOS — where native playback is real, and better.
  const Hls = await load();
  if (!Hls.isSupported()) {
    if (playsNatively(a)) {
      a.src = url;
      return;
    }
    throw new Error("this build cannot play HLS streams");
  }

  const hls = new Hls({
    // The whole point of this path is tracks that would otherwise not play, so
    // it leans towards getting *something* out rather than towards ideal
    // buffering. 30s is about a third of what the default keeps in memory.
    maxBufferLength: 30,
    // A signed SoundCloud segment URL can fail transiently under load; a few
    // tries cost a second and save a track.
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: 10_000,
        maxLoadTimeMs: 60_000,
        timeoutRetry: { maxNumRetry: 2, retryDelayMs: 500, maxRetryDelayMs: 2000 },
        errorRetry: { maxNumRetry: 3, retryDelayMs: 500, maxRetryDelayMs: 4000 },
      },
    },
  });
  instance = hls;

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (settled) return;
      settled = true;
      resolve();
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      // Only fatal errors are the caller's business: hls.js reports and
      // recovers from a great many that never reach the listener.
      if (!data.fatal) return;
      if (settled) {
        // Past the manifest, a fatal error is a mid-track failure. Give the
        // library its one documented recovery before writing the track off; if
        // that does not take, the store's stall watchdog carries it on.
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else release();
        return;
      }
      settled = true;
      release();
      reject(new Error(`hls: ${data.details}`));
    });

    hls.loadSource(url);
    hls.attachMedia(a);
  });
}
