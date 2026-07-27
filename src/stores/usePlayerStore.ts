import { create } from "zustand";
import { scGetStreamUrl, scRelatedTracks, type Track } from "@/lib/tauri";
import { applyAudio, el, fadeTo, resume } from "@/audio/engine";
import { DEFAULT_VOLUME, useSettingsStore } from "@/stores/useSettingsStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";

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
  /** Seconds. */
  position: number;
  duration: number;
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
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function bindElement(): HTMLAudioElement {
    const a = el();
    if (a.dataset.bound === "1") return a;
    a.dataset.bound = "1";

    a.addEventListener("timeupdate", () => {
      // Coalesce: `timeupdate` fires ~4x/s and every listener re-renders.
      const next = a.currentTime;
      if (Math.abs(next - get().position) < 0.25) return;
      set({ position: next });
    });
    a.addEventListener("durationchange", () =>
      set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }),
    );
    a.addEventListener("play", () => set({ isPlaying: true }));
    a.addEventListener("pause", () => set({ isPlaying: false }));
    a.addEventListener("ended", () => {
      set({ isPlaying: false, position: 0 });
      const { repeat } = get();
      if (repeat === "one") {
        get().playAt(get().pos);
        return;
      }
      if (useSettingsStore.getState().autoplayNext) get().next();
    });
    a.addEventListener("error", () =>
      set({ error: "playback error", isPlaying: false, isLoading: false }),
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

  /** Prefer the downloaded file; fall back to a fresh signed stream URL. */
  async function resolveSource(track: Track): Promise<string> {
    const local = useDownloadsStore.getState().localUrl(track.id);
    if (local) return local;
    return scGetStreamUrl(track.id);
  }

  /** Load and play `order[orderPos]`. */
  async function load(orderPos: number): Promise<void> {
    const { queue, order } = get();
    const queueIndex = order[orderPos];
    if (queueIndex == null) return;
    const track = queue[queueIndex];
    if (!track) return;

    const a = bindElement();
    bindMediaSession();
    const token = ++playToken;
    const { fadeMs } = useSettingsStore.getState();

    // Stop the outgoing track *before* anything async. Resolving a stream URL
    // is a network round trip that can be slow or fail, and leaving the old
    // audio running behind the new title/cover is the worst possible state.
    if (fadeMs > 0 && !a.paused) await fadeTo(0, fadeMs);
    a.pause();
    a.removeAttribute("src");
    a.load();

    set({
      pos: orderPos,
      current: track,
      isPlaying: false,
      isLoading: true,
      error: null,
      position: 0,
      duration: 0,
    });
    publishMetadata(track);

    try {
      const src = await resolveSource(track);
      if (token !== playToken) return; // superseded while resolving

      a.src = src;
      a.playbackRate = get().rate;
      a.volume = fadeMs > 0 ? 0 : effectiveVolume();
      await a.play();
      resume();
      applyAudio(useSettingsStore.getState().audio);
      if (fadeMs > 0) void fadeTo(effectiveVolume(), fadeMs);
      set({ isLoading: false });
    } catch (e) {
      if (token !== playToken) return;
      set({ isLoading: false, error: String(e), isPlaying: false });
    }
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
    position: 0,
    duration: 0,
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
      if (a.paused) {
        void a.play();
        resume();
      } else {
        a.pause();
      }
    },

    seek(seconds) {
      bindElement().currentTime = seconds;
      set({ position: seconds });
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
      bindElement().playbackRate = rate;
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
