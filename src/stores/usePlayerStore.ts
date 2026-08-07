import { create } from "zustand";
import {
  scGetStreamUrl,
  scRelatedTracks,
  type StreamSource,
  type Track,
} from "@/lib/tauri";
import {
  abandonGraph,
  applyAudio,
  applyRate,
  el,
  fadeTo,
  graphIsAudible,
  needsGraph,
  prepareForSource,
  resume,
} from "@/audio/engine";
import { attach as attachHls, release as releaseHls } from "@/audio/hls";
import {
  DEFAULT_VOLUME,
  setSourceReloader,
  useSettingsStore,
} from "@/stores/useSettingsStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";

/**
 * Playback: what's queued, in what order, and what the element is doing.
 *
 * The queue keeps its original order and `order` is a permutation of its
 * indices — that way shuffling is reversible without losing the list the user
 * actually queued, and "show me the queue" can display either view.
 *
 *   current === queue[order[pos]]
 */

export type RepeatMode = "off" | "all" | "one";

/**
 * Monotonic counter identifying the most recent play request. Sources resolve
 * asynchronously, so a slow request must not clobber a newer one.
 */
let playToken = 0;
/** Pending sleep-timer handle. */
let sleepHandle: ReturnType<typeof setTimeout> | null = null;
let mediaSessionBound = false;

/** Pressing "previous" past this many seconds restarts the track instead. */
const RESTART_THRESHOLD_S = 3;

/** Handle for the playback watchdog; see `watchElement`. */
let watchdog: number | null = null;
/** How often the watchdog looks. Cheap — two property reads. */
const WATCHDOG_INTERVAL_MS = 1000;
/**
 * How long the playhead may sit still before the source is presumed dead.
 *
 * Generous, because ordinary buffering looks identical from here and reloading
 * a track that was about to resume on its own is worse than waiting a moment
 * longer. Eight seconds is far past any rebuffer that is going to succeed.
 */
const STALL_GRACE_MS = 8000;
/** Minimum gap between two recovery attempts, so a dead track cannot loop. */
const RECOVERY_COOLDOWN_MS = 20_000;

/**
 * Resolved stream URLs, keyed by track id.
 *
 * Resolving one costs two sequential requests to SoundCloud (the track object,
 * then signing the transcoding), which is the pause you hear when switching
 * tracks. The signed URLs are short-lived, so this is deliberately a short
 * cache — long enough to make next/prev instant, short enough that a cached
 * URL is still valid when used.
 */
const urlCache = new Map<number, { source: StreamSource; at: number }>();
/**
 * How long a resolved URL is reused.
 *
 * Deliberately short of SoundCloud's own expiry rather than close to it. A URL
 * that dies *during* playback does not fail loudly — the CDN starts refusing the
 * range requests the element makes as it plays past the buffer, and the track
 * silently stops halfway with no error anywhere. Two minutes is comfortably
 * inside the window, and the recovery in `watchForStall` covers the rest.
 */
const URL_TTL_MS = 2 * 60_000;
/** Bound the map; a long listening session would otherwise grow it forever. */
const URL_CACHE_MAX = 200;

function cacheUrl(trackId: number, source: StreamSource): void {
  if (urlCache.size >= URL_CACHE_MAX) {
    // Insertion-ordered: the oldest entry is the first key.
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
  urlCache.set(trackId, { source, at: Date.now() });
}

function cachedUrl(trackId: number): StreamSource | null {
  const hit = urlCache.get(trackId);
  if (!hit) return null;
  if (Date.now() - hit.at >= URL_TTL_MS) {
    urlCache.delete(trackId);
    return null;
  }
  return hit.source;
}

/** Drop a track's cached URL, so the next play signs a fresh one. */
function forgetUrl(trackId: number): void {
  urlCache.delete(trackId);
}

/** A downloaded file, dressed as a stream source. */
function localSource(url: string): StreamSource {
  return { url, protocol: "progressive", mimeType: "audio/mpeg" };
}

function initialVolume(): number {
  const { rememberVolume, volume } = useSettingsStore.getState();
  return rememberVolume ? volume : DEFAULT_VOLUME;
}

/** Fisher–Yates on a copy. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

interface PlayerState {
  queue: Track[];
  /** Playback order as indices into `queue`. */
  order: number[];
  /** Position within `order`; -1 when nothing is loaded. */
  pos: number;
  current: Track | null;

  isPlaying: boolean;
  isLoading: boolean;
  /**
   * Whether the user wants sound, as opposed to whether there is any.
   *
   * The play button follows this, not `isPlaying`. A press has to change the
   * glyph *now* — that is the entire feedback the control gives — and the
   * element cannot promise to be playing by then: a source takes a round trip to
   * resolve, a paused element on a slow connection can sit in `waiting` for
   * seconds, and either way the button was still showing "play" while the track
   * was on its way. Two fields because they are two different facts, and the
   * places that need the real one (the OS media session, the stall watchdog)
   * need it to be real.
   */
  wantsPlay: boolean;
  /** Seconds. */
  position: number;
  duration: number;
  /**
   * How much of the track is buffered ahead of the playhead, in seconds.
   *
   * Rendered under the seek bar's fill. SoundCloud streams progressively and the
   * element only holds a window of it, so "why did it stop when I skipped
   * ahead?" has an answer on screen instead of being a mystery.
   */
  buffered: number;
  volume: number;
  muted: boolean;
  rate: number;
  error: string | null;

  shuffle: boolean;
  repeat: RepeatMode;
  /** Epoch ms at which playback stops, or `null`. */
  sleepAt: number | null;
  /** True while related tracks are being fetched to extend the queue. */
  radioLoading: boolean;

  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  playAt: (orderPos: number) => void;
  next: () => void;
  prev: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;

  addNext: (track: Track) => void;
  addLast: (track: Track) => void;
  removeAt: (orderPos: number) => void;
  moveInQueue: (from: number, to: number) => void;
  clearQueue: () => void;

  /** Replace the queue with a station seeded by this track. */
  startRadio: (track: Track) => Promise<void>;
  /** Stop playback after N minutes; `null` cancels. */
  setSleep: (minutes: number | null) => void;
  /** Re-fetch the current source, keeping the position. */
  reloadSource: () => Promise<void>;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function bindElement(): HTMLAudioElement {
    const a = el();
    if (a.dataset.bound === "1") return a;
    a.dataset.bound = "1";

    /**
     * Ignore events from an element the engine has already replaced.
     *
     * Elements are disposable here (see `audio/engine.ts`), and a discarded one
     * keeps emitting: releasing its source fires `error`, and a swap mid-track
     * can still let it reach `ended`. Acting on either would report a failure
     * or skip a track that has nothing to do with what is now playing.
     */
    const live = (fn: () => void) => () => {
      if (a === el()) fn();
    };

    a.addEventListener(
      "timeupdate",
      live(() => {
        // Coalesce: `timeupdate` fires ~4x/s and every listener re-renders.
        const next = a.currentTime;
        if (Math.abs(next - get().position) < 0.25) return;
        set({ position: next });
      }),
    );
    a.addEventListener(
      "durationchange",
      live(() => set({ duration: Number.isFinite(a.duration) ? a.duration : 0 })),
    );

    /** How far the element has buffered past where it is playing. */
    const readBuffered = () => {
      const at = a.currentTime;
      for (let i = 0; i < a.buffered.length; i++) {
        if (a.buffered.start(i) <= at + 0.5 && a.buffered.end(i) >= at) {
          return a.buffered.end(i);
        }
      }
      return at;
    };
    const syncBuffered = () => {
      const next = readBuffered();
      if (Math.abs(next - get().buffered) < 0.5) return;
      set({ buffered: next });
    };
    a.addEventListener("progress", live(syncBuffered));
    a.addEventListener("canplay", live(syncBuffered));

    /**
     * Take the element's word for whether sound is happening.
     *
     * Bound to five events rather than the two that "should" be enough because
     * the pair of them is not enough in practice: WebKit can go from `play` to
     * `waiting` and back without another `play`, a source swap emits `emptied`
     * with no `pause` beside it, and an element that ends up stalled forever
     * emits nothing further at all. Reading `a.paused` on any of them, plus the
     * slow poll in `watchElement`, is what stops the button from lying.
     */
    const syncPlaying = () => {
      const playing = !a.paused && !a.ended;
      if (playing === get().isPlaying) return;
      set({ isPlaying: playing });
    };
    for (const event of ["play", "playing", "pause", "emptied", "stalled"]) {
      a.addEventListener(event, live(syncPlaying));
    }

    // `wantsPlay` follows a pause the app did not ask for — the OS, a headset
    // button, another app taking the audio focus. The transient pause inside
    // `load` is exempt, because `isLoading` is already set by then and the
    // intent it would clear is the one that load is in the middle of honouring.
    a.addEventListener(
      "pause",
      live(() => {
        if (!get().isLoading) set({ wantsPlay: false });
      }),
    );
    a.addEventListener("play", live(() => set({ wantsPlay: true })));

    // "Buffering", as distinct from "loading a new track". Both put the same
    // spinner on the play button; only one of them is worth a watchdog.
    a.addEventListener("waiting", live(() => set({ isLoading: true })));
    a.addEventListener(
      "playing",
      live(() => set({ isLoading: false, error: null })),
    );

    a.addEventListener(
      "ended",
      live(() => {
        set({ isPlaying: false, wantsPlay: false, position: 0 });
        const { repeat } = get();
        if (repeat === "one") {
          get().playAt(get().pos);
          return;
        }
        if (useSettingsStore.getState().autoplayNext) get().next();
      }),
    );
    a.addEventListener(
      "error",
      live(() => {
        const track = get().current;
        const local = track
          ? useDownloadsStore.getState().localUrl(track.id)
          : null;

        // A downloaded file that won't decode (truncated download, asset
        // protocol refusing the path) shouldn't strand the track — retry it
        // from SoundCloud once before giving up.
        if (track && local && a.src === local) {
          void playFromNetwork(track);
          return;
        }

        // MediaError codes: 1 aborted, 2 network, 3 decode, 4 unsupported.
        const reason = a.error ? `${a.error.code}` : "?";
        set({
          error: `playback error ${reason}`,
          isPlaying: false,
          isLoading: false,
        });
        toast(`${t.player.playbackFailed} (${reason})`, "error");
      }),
    );
    return a;
  }

  /** OS media keys and the desktop's now-playing widget. */
  function bindMediaSession(): void {
    if (mediaSessionBound || !("mediaSession" in navigator)) return;
    mediaSessionBound = true;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => get().togglePlay());
    ms.setActionHandler("pause", () => get().togglePlay());
    ms.setActionHandler("nexttrack", () => get().next());
    ms.setActionHandler("previoustrack", () => get().prev());
    ms.setActionHandler("seekto", (e) => {
      if (e.seekTime != null) get().seek(e.seekTime);
    });
  }

  function publishMetadata(track: Track): void {
    if (!("mediaSession" in navigator) || !window.MediaMetadata) return;
    const art = track.artwork_url?.replace("-large", "-t500x500");
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist ?? "",
      artwork: art ? [{ src: art, sizes: "500x500", type: "image/jpeg" }] : [],
    });
  }

  /** Prefer the downloaded file, then a warm URL, then resolve a fresh one. */
  async function resolveSource(
    track: Track,
    skipLocal = false,
  ): Promise<StreamSource> {
    if (!skipLocal) {
      const local = useDownloadsStore.getState().localUrl(track.id);
      if (local) return localSource(local);
    }

    const warm = cachedUrl(track.id);
    if (warm) return warm;

    const source = await scGetStreamUrl(track.id);
    cacheUrl(track.id, source);
    return source;
  }

  /**
   * Point the element at a resolved source, whichever kind it is.
   *
   * The one place `src` is assigned, because HLS is not an assignment: hls.js
   * takes the element over and feeds it through Media Source Extensions, and an
   * instance left attached would keep appending underneath the next track. So
   * every path releases first, including the progressive one.
   *
   * Resolves once the element has something to play, not once it is playing.
   */
  async function setSource(
    a: HTMLAudioElement,
    source: StreamSource,
  ): Promise<void> {
    releaseHls();
    if (source.protocol === "hls") {
      await attachHls(a, source.url);
      return;
    }
    a.src = source.url;
  }

  /**
   * Resolve the *next* track's URL while the current one plays, so pressing
   * next — or autoplay reaching the end — starts without a round trip.
   */
  function warmNext(): void {
    const { queue, order, pos } = get();
    const nextIndex = order[pos + 1];
    if (nextIndex == null) return;

    const next = queue[nextIndex];
    if (!next) return;
    // Downloaded tracks and already-warm URLs need nothing.
    if (useDownloadsStore.getState().ids.has(next.id)) return;
    if (cachedUrl(next.id)) return;

    void scGetStreamUrl(next.id)
      .then((source) => cacheUrl(next.id, source))
      // A failed warm-up is invisible: the real play will resolve it again.
      .catch(() => undefined);
  }

  /** Load and play `order[orderPos]`. */
  async function load(orderPos: number): Promise<void> {
    const { queue, order } = get();
    const queueIndex = order[orderPos];
    if (queueIndex == null) return;
    const track = queue[queueIndex];
    if (!track) return;

    let a = bindElement();
    bindMediaSession();
    watchElement();
    const token = ++playToken;
    const { fadeMs } = useSettingsStore.getState();

    // Set before the pause below, so the `pause` listener knows this one is
    // ours and leaves `wantsPlay` alone — see `bindElement`.
    set({
      pos: orderPos,
      current: track,
      isPlaying: false,
      // The button flips to "pause" on the press that got here, and stays there
      // through however long the resolve takes. That wait is the whole reason
      // this field exists.
      wantsPlay: true,
      isLoading: true,
      error: null,
      position: 0,
      duration: 0,
      buffered: 0,
    });

    // Stop the outgoing track *before* anything async. Resolving a stream URL
    // is a network round trip that can be slow or fail, and leaving the old
    // audio running behind the new title/cover is the worst possible state.
    if (fadeMs > 0 && !a.paused) await fadeTo(0, fadeMs);
    // Pause only. Clearing `src` and calling `load()` fires a spurious error
    // event for the empty source; assigning the new `src` resets the element
    // anyway, and a failed resolve then leaves the old track merely paused.
    a.pause();
    publishMetadata(track);

    try {
      const source = await resolveSource(track);
      if (token !== playToken) return; // superseded while resolving

      // Must precede the source: the CORS mode is read at load time. This can
      // hand back a different element, so rebind before touching it.
      await prepareForSource(
        useSettingsStore.getState().audio,
        source.url,
        source.protocol === "hls" ? "hls" : "file",
      );
      if (token !== playToken) return; // superseded while deciding the routing
      a = bindElement();
      await setSource(a, source);
      if (token !== playToken) return; // superseded while the manifest loaded
      applyRate(a, get().rate);
      a.volume = fadeMs > 0 ? 0 : effectiveVolume();

      // The user may have pressed pause during the resolve. Honouring that
      // means loading the track and leaving it stopped, not starting it anyway
      // and making them press again.
      if (get().wantsPlay) await a.play();
      // Order matters: `applyAudio` is what builds the graph, so resuming
      // before it had nothing to resume — and a graph whose context stays
      // suspended plays in total silence.
      applyAudio(useSettingsStore.getState().audio);
      resume();
      void confirmGraphAudible();
      if (fadeMs > 0) void fadeTo(effectiveVolume(), fadeMs);
      set({ isLoading: false });
      warmNext();
    } catch (e) {
      if (token !== playToken) return;
      // A URL that failed is not worth keeping: the next attempt has to sign a
      // new one rather than replay the same failure from cache.
      forgetUrl(track.id);
      set({
        isLoading: false,
        error: String(e),
        isPlaying: false,
        wantsPlay: false,
      });
      // The element was faded to silence on the way in, and nothing is going to
      // fade it back — leaving it there would make the *next* successful play
      // silent as well.
      a.volume = effectiveVolume();
      // `error` in the store is not rendered anywhere, so without this a track
      // that will not start does nothing at all: no sound, no reason. The
      // message matters — a throttled client_id, a dead track and a blocked
      // autoplay all land here and need different responses.
      toast(`${t.player.playbackFailed}: ${e}`, "error");
    }
  }

  /**
   * Re-fetch the current source and resume where we were.
   *
   * Two callers, one mechanism. The audio chain changing needs it because the
   * element's CORS mode is only read at load time, so a graph switched on
   * mid-track does nothing until the source is re-assigned. A stall needs it
   * because a signed SoundCloud URL that has expired mid-track cannot be
   * un-expired — see `watchElement`.
   *
   * `fresh` is what separates the two: re-signing is pointless for the first and
   * the entire point of the second.
   */
  async function reloadInPlace(fresh = false): Promise<void> {
    const track = get().current;
    if (!track) return;

    let a = bindElement();
    const at = a.currentTime;
    const wasPlaying = !a.paused || get().wantsPlay;
    const token = ++playToken;
    if (fresh) forgetUrl(track.id);

    try {
      const source = await resolveSource(track);
      if (token !== playToken) return;

      await prepareForSource(
        useSettingsStore.getState().audio,
        source.url,
        source.protocol === "hls" ? "hls" : "file",
      );
      if (token !== playToken) return;
      a = bindElement();
      await setSource(a, source);
      if (token !== playToken) return;
      // Seeking before the element knows how long the track is silently lands
      // at 0 on some builds, which turns a recovery into a restart — the one
      // outcome that would be worse than the stall.
      await seekWhenSeekable(a, at);
      a.volume = effectiveVolume();
      if (wasPlaying) await a.play();
      applyAudio(useSettingsStore.getState().audio);
      resume();
      set({ isLoading: false });
    } catch {
      // Leave the element as it was; the user can hit play again.
    }
  }

  /** Re-attempt the current track over the network, ignoring the local copy. */
  async function playFromNetwork(track: Track): Promise<void> {
    let a = bindElement();
    const token = ++playToken;
    try {
      const source = await resolveSource(track, true);
      if (token !== playToken) return;
      await prepareForSource(
        useSettingsStore.getState().audio,
        source.url,
        source.protocol === "hls" ? "hls" : "file",
      );
      if (token !== playToken) return;
      a = bindElement();
      await setSource(a, source);
      if (token !== playToken) return;
      a.volume = effectiveVolume();
      await a.play();
      resume();
      set({ isLoading: false, error: null });
      toast(t.player.localFileBroken, "info");
    } catch (e) {
      if (token !== playToken) return;
      set({
        isLoading: false,
        error: String(e),
        isPlaying: false,
        wantsPlay: false,
      });
      toast(`${t.player.playbackFailed}: ${e}`, "error");
    }
  }

  /**
   * Put the playhead at `at`, waiting for the element to be able to accept it.
   *
   * Assigning `currentTime` before metadata has arrived is ignored — the
   * element has no idea how long the track is yet, so there is nothing to seek
   * within. Gives up after a moment and lets the track start from the top
   * rather than hanging: a restart is bad, a player that never resumes is worse.
   */
  function seekWhenSeekable(a: HTMLAudioElement, at: number): Promise<void> {
    if (at <= 0) return Promise.resolve();
    if (a.readyState >= 1) {
      a.currentTime = at;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        a.removeEventListener("loadedmetadata", done);
        if (a.readyState >= 1) a.currentTime = at;
        resolve();
      };
      const timer = setTimeout(done, 5000);
      a.addEventListener("loadedmetadata", done, { once: true });
    });
  }

  /**
   * Catch a track that has quietly stopped, and put it back.
   *
   * SoundCloud streams progressively over a *signed, expiring* URL, and the
   * element fetches the rest of the file as it plays. Two things follow, and
   * both were being reported as "the track just stops":
   *
   *   - seeking past what is buffered makes the element ask the CDN for a range
   *     it may no longer serve, and
   *   - a URL signed at the start of a long track can expire before the end of
   *     it.
   *
   * Neither raises `error`. The element simply sits there with the clock
   * stopped, playing nothing, reporting no fault — which is invisible to every
   * event listener in this file. So it is measured: the playhead is expected to
   * move while the user wants sound, and if it does not, the source is re-signed
   * and reloaded at the same position.
   *
   * The same poll is what keeps `isPlaying` honest when an event goes missing.
   */
  function watchElement(): void {
    if (watchdog !== null) return;

    let lastPosition = -1;
    let stalledFor = 0;
    let lastRecovery = 0;

    watchdog = window.setInterval(() => {
      const a = el();
      const state = get();

      // Cheap and idempotent, and the reason a missed `play`/`pause` event can
      // no longer leave the button showing the wrong glyph for good.
      const playing = !a.paused && !a.ended;
      if (playing !== state.isPlaying) set({ isPlaying: playing });

      // Only a track that is *supposed* to be advancing can be stalled. A
      // deliberate pause, a finished track and an empty player are all fine.
      if (!state.current || !state.wantsPlay || a.paused || a.ended) {
        stalledFor = 0;
        lastPosition = a.currentTime;
        return;
      }

      const moved = Math.abs(a.currentTime - lastPosition) > 0.05;
      lastPosition = a.currentTime;
      if (moved) {
        stalledFor = 0;
        return;
      }

      stalledFor += WATCHDOG_INTERVAL_MS;
      if (stalledFor < STALL_GRACE_MS) return;

      // A recovery that fires again immediately would be a reload loop against
      // a track that is simply not going to play, so failures are spaced out
      // and the user is told rather than left watching it thrash.
      const now = Date.now();
      if (now - lastRecovery < RECOVERY_COOLDOWN_MS) return;
      lastRecovery = now;
      stalledFor = 0;

      set({ isLoading: true });
      void reloadInPlace(true);
    }, WATCHDOG_INTERVAL_MS);
  }

  /**
   * Make sure switching effects on has not switched sound off.
   *
   * The graph can be silent with nothing reporting a fault (see
   * `graphIsAudible`), and the user's only clue is a track that plays with no
   * audio. So the engine is asked, and if it went quiet the effects are dropped
   * and the track reloaded on the plain path — sound outranks the equaliser.
   */
  async function confirmGraphAudible(): Promise<void> {
    if (!needsGraph(useSettingsStore.getState().audio)) return;
    if (await graphIsAudible()) return;

    abandonGraph();
    await reloadInPlace();
    toast(t.audio.graphUnsupported, "error");
  }

  function effectiveVolume(): number {
    const { volume, muted } = get();
    return muted ? 0 : volume;
  }

  /** Queue exhausted: loop, extend with a station, or stop. */
  function onQueueEnd(): void {
    const { repeat, order } = get();
    if (repeat === "all" && order.length > 0) {
      void load(0);
      return;
    }
    if (useSettingsStore.getState().radio) {
      const last = get().current;
      if (last) void extendWithRelated(last);
    }
  }

  /** Append "more like this" so playback keeps going past the queue. */
  async function extendWithRelated(seed: Track): Promise<void> {
    if (get().radioLoading) return;
    set({ radioLoading: true });
    try {
      const related = await scRelatedTracks(seed.id, 30);
      const known = new Set(get().queue.map((t) => t.id));
      const fresh = related.filter((t) => !known.has(t.id));
      if (fresh.length === 0) return;

      const queue = [...get().queue, ...fresh];
      const added = fresh.map((_, i) => get().queue.length + i);
      const order = [...get().order, ...(get().shuffle ? shuffle(added) : added)];
      set({ queue, order });
      void load(get().pos + 1);
    } catch {
      // A failed radio fetch just means playback stops; not worth an error UI.
    } finally {
      set({ radioLoading: false });
    }
  }

  return {
    queue: [],
    order: [],
    pos: -1,
    current: null,

    isPlaying: false,
    isLoading: false,
    wantsPlay: false,
    position: 0,
    duration: 0,
    buffered: 0,
    volume: initialVolume(),
    muted: false,
    rate: 1,
    error: null,

    shuffle: false,
    repeat: "off",
    sleepAt: null,
    radioLoading: false,

    async playTrack(track, queue) {
      if (get().current?.id === track.id) {
        get().togglePlay();
        return;
      }

      const list = queue?.length ? queue : [track];
      const found = list.findIndex((t) => t.id === track.id);
      const nextQueue = found >= 0 ? list : [track];
      const startIndex = found >= 0 ? found : 0;

      const indices = nextQueue.map((_, i) => i);
      // Shuffling from a track means that track first, the rest scrambled.
      const order = get().shuffle
        ? [startIndex, ...shuffle(indices.filter((i) => i !== startIndex))]
        : indices;

      set({ queue: nextQueue, order });
      await load(order.indexOf(startIndex));
    },

    playAt(orderPos) {
      if (orderPos < 0 || orderPos >= get().order.length) return;
      void load(orderPos);
    },

    next() {
      const { pos, order } = get();
      if (pos < 0) return;
      if (pos + 1 >= order.length) {
        onQueueEnd();
        return;
      }
      void load(pos + 1);
    },

    prev() {
      const { pos, position } = get();
      if (position > RESTART_THRESHOLD_S || pos <= 0) {
        get().seek(0);
        return;
      }
      void load(pos - 1);
    },

    togglePlay() {
      if (!get().current) return;
      const a = bindElement();
      // Intent first, and set here rather than left to the element's events:
      // this is what makes the glyph change on the press instead of whenever
      // the network gets round to it. A press during a load flips the intent
      // that `load` will honour when the source arrives.
      const next = !get().wantsPlay;
      set({ wantsPlay: next });

      if (next) {
        watchElement();
        void a.play().catch(() => {
          // Nothing loaded yet — `load` is still resolving and will start it.
        });
        resume();
      } else {
        a.pause();
      }
    },

    seek(seconds) {
      const a = bindElement();
      a.currentTime = seconds;
      // The old buffered figure describes a range that no longer contains the
      // playhead, so it would read as "buffered behind you" until the next
      // `progress`. Collapsing it to the seek target is the honest reading:
      // nothing ahead is known to be there yet.
      set({ position: seconds, buffered: seconds });
    },

    setVolume(volume) {
      set({ volume, muted: false });
      bindElement().volume = volume;
      useSettingsStore.getState().rememberCurrentVolume(volume);
    },

    toggleMute() {
      const muted = !get().muted;
      set({ muted });
      bindElement().volume = muted ? 0 : get().volume;
    },

    setRate(rate) {
      set({ rate });
      applyRate(bindElement(), rate);
    },

    toggleShuffle() {
      const on = !get().shuffle;
      const { queue, order, pos } = get();
      const currentIndex = order[pos];

      if (queue.length === 0) {
        set({ shuffle: on });
        return;
      }

      const indices = queue.map((_, i) => i);
      const nextOrder = on
        ? currentIndex == null
          ? shuffle(indices)
          : [currentIndex, ...shuffle(indices.filter((i) => i !== currentIndex))]
        : indices;

      set({
        shuffle: on,
        order: nextOrder,
        // Keep playing the same track; only what comes after it changes.
        pos: currentIndex == null ? pos : nextOrder.indexOf(currentIndex),
      });
    },

    cycleRepeat() {
      const order: RepeatMode[] = ["off", "all", "one"];
      const nextIndex = (order.indexOf(get().repeat) + 1) % order.length;
      set({ repeat: order[nextIndex]! });
    },

    addNext(track) {
      const { queue, order, pos } = get();
      const queueIndex = queue.length;
      const nextOrder = [...order];
      nextOrder.splice(pos + 1, 0, queueIndex);
      set({ queue: [...queue, track], order: nextOrder });
    },

    addLast(track) {
      const { queue, order } = get();
      set({ queue: [...queue, track], order: [...order, queue.length] });
    },

    removeAt(orderPos) {
      const { order, pos } = get();
      if (orderPos < 0 || orderPos >= order.length) return;
      if (orderPos === pos) return; // removing what's playing needs a skip first

      const nextOrder = order.filter((_, i) => i !== orderPos);
      set({
        order: nextOrder,
        pos: orderPos < pos ? pos - 1 : pos,
      });
    },

    moveInQueue(from, to) {
      const { order, pos } = get();
      if (from === to || from < 0 || from >= order.length) return;
      const target = Math.max(0, Math.min(order.length - 1, to));

      const nextOrder = [...order];
      const [moved] = nextOrder.splice(from, 1);
      if (moved == null) return;
      nextOrder.splice(target, 0, moved);

      // `pos` addresses a slot, so it has to follow the track that was playing.
      const playing = order[pos];
      set({
        order: nextOrder,
        pos: playing == null ? pos : nextOrder.indexOf(playing),
      });
    },

    clearQueue() {
      const { order, pos } = get();
      const playing = order[pos];
      if (playing == null) {
        set({ queue: [], order: [], pos: -1, current: null });
        return;
      }
      // Keep the playing track so the bar doesn't empty out under the user.
      const track = get().queue[playing]!;
      set({ queue: [track], order: [0], pos: 0 });
    },

    async startRadio(track) {
      set({ radioLoading: true });
      try {
        const related = await scRelatedTracks(track.id, 50);
        const queue = [track, ...related.filter((t) => t.id !== track.id)];
        const indices = queue.map((_, i) => i);
        set({ queue, order: indices });
        await load(0);
      } catch (e) {
        set({ error: String(e) });
      } finally {
        set({ radioLoading: false });
      }
    },

    reloadSource: reloadInPlace,

    setSleep(minutes) {
      if (sleepHandle) clearTimeout(sleepHandle);
      if (minutes == null) {
        sleepHandle = null;
        set({ sleepAt: null });
        return;
      }
      const ms = minutes * 60_000;
      sleepHandle = setTimeout(() => {
        const a = el();
        // Fade out rather than cutting: this fires while someone is asleep.
        void fadeTo(0, 4000).then(() => {
          a.pause();
          a.volume = get().muted ? 0 : get().volume;
        });
        set({ sleepAt: null });
      }, ms);
      set({ sleepAt: Date.now() + ms });
    },
  };
});

// The settings store asks for this when the audio chain changes; registering
// it here avoids an import cycle between the two stores.
setSourceReloader(() => reloadCurrentSource());

/** Module-level handle so the reloader can reach the store's internals. */
async function reloadCurrentSource(): Promise<void> {
  await usePlayerStore.getState().reloadSource();
}