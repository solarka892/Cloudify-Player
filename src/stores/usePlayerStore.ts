import { create } from "zustand";
import { scGetStreamUrl, type Track } from "@/lib/tauri";
import { DEFAULT_VOLUME, useSettingsStore } from "@/stores/useSettingsStore";

// The <audio> element lives outside React state (it's imperative, not data).
let audio: HTMLAudioElement | null = null;

/**
 * Monotonic counter identifying the most recent play request. Stream URLs are
 * resolved asynchronously, so a slow request must not clobber a newer one.
 */
let playToken = 0;

/** Pressing "previous" past this many seconds restarts the track instead. */
const RESTART_THRESHOLD_S = 3;

/** Start from the remembered volume only if the user opted into that. */
function initialVolume(): number {
  const { rememberVolume, volume } = useSettingsStore.getState();
  return rememberVolume ? volume : DEFAULT_VOLUME;
}

interface PlayerState {
  current: Track | null;
  /** The list playback walks through; `[current]` when a track is played alone. */
  queue: Track[];
  /** Position of `current` in `queue`, or -1 when nothing is queued. */
  index: number;
  isPlaying: boolean;
  isLoading: boolean;
  /** Playback position in seconds. */
  position: number;
  /** Track duration in seconds (from the audio element). */
  duration: number;
  /** 0..1 */
  volume: number;
  error: string | null;

  /**
   * Play a track, or toggle play/pause if it's already the current one.
   * Pass the list it came from as `queue` so next/prev and autoplay can walk it.
   */
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  /** Jump to a position in the current queue (used by the queue panel). */
  playAt: (index: number) => void;
  /** Advance to the next queued track; no-op at the end of the queue. */
  next: () => void;
  /** Restart the track, or step back one if already near its start. */
  prev: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function ensureAudio(): HTMLAudioElement {
    if (audio) return audio;
    const a = new Audio();
    a.addEventListener("timeupdate", () => set({ position: a.currentTime }));
    a.addEventListener("durationchange", () =>
      set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }),
    );
    a.addEventListener("play", () => set({ isPlaying: true }));
    a.addEventListener("pause", () => set({ isPlaying: false }));
    a.addEventListener("ended", () => {
      set({ isPlaying: false, position: 0 });
      // Autoplay: falls through to a stop at the end of the queue.
      if (useSettingsStore.getState().autoplayNext) get().next();
    });
    a.addEventListener("error", () =>
      set({ error: "playback error", isPlaying: false, isLoading: false }),
    );
    audio = a;
    return a;
  }

  /** Resolve `queue[index]` to a stream and play it. */
  async function load(queue: Track[], index: number): Promise<void> {
    const track = queue[index];
    if (!track) return;

    const a = ensureAudio();
    const token = ++playToken;
    set({
      current: track,
      queue,
      index,
      isLoading: true,
      error: null,
      position: 0,
      duration: 0,
    });

    try {
      const url = await scGetStreamUrl(track.id);
      // Guard against a newer play request having superseded this one.
      if (token !== playToken) return;
      a.src = url;
      a.volume = get().volume;
      await a.play();
      set({ isLoading: false });
    } catch (e) {
      if (token !== playToken) return;
      set({ isLoading: false, error: String(e), isPlaying: false });
    }
  }

  return {
    current: null,
    queue: [],
    index: -1,
    isPlaying: false,
    isLoading: false,
    position: 0,
    duration: 0,
    volume: initialVolume(),
    error: null,

    async playTrack(track, queue) {
      // Same track → just toggle.
      if (get().current?.id === track.id) {
        get().togglePlay();
        return;
      }

      const found = queue?.findIndex((t) => t.id === track.id) ?? -1;
      // Without a list context (or if the track isn't in it) the queue is just
      // this one track.
      if (!queue || found < 0) await load([track], 0);
      else await load(queue, found);
    },

    playAt(index) {
      const { queue } = get();
      if (index < 0 || index >= queue.length) return;
      void load(queue, index);
    },

    next() {
      const { queue, index } = get();
      if (index < 0 || index + 1 >= queue.length) return;
      void load(queue, index + 1);
    },

    prev() {
      const { index, position } = get();
      if (position > RESTART_THRESHOLD_S || index <= 0) {
        get().seek(0);
        return;
      }
      void load(get().queue, index - 1);
    },

    togglePlay() {
      if (!get().current) return;
      const a = ensureAudio();
      if (a.paused) void a.play();
      else a.pause();
    },

    seek(seconds) {
      ensureAudio().currentTime = seconds;
      set({ position: seconds });
    },

    setVolume(volume) {
      ensureAudio().volume = volume;
      set({ volume });
      useSettingsStore.getState().rememberCurrentVolume(volume);
    },
  };
});
