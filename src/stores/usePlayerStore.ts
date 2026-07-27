import { create } from "zustand";
import { scGetStreamUrl, type Track } from "@/lib/tauri";

// The <audio> element lives outside React state (it's imperative, not data).
let audio: HTMLAudioElement | null = null;

interface PlayerState {
  current: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  /** Playback position in seconds. */
  position: number;
  /** Track duration in seconds (from the audio element). */
  duration: number;
  /** 0..1 */
  volume: number;
  error: string | null;

  /** Play a track, or toggle play/pause if it's already the current one. */
  playTrack: (track: Track) => Promise<void>;
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
    a.addEventListener("ended", () => set({ isPlaying: false, position: 0 }));
    a.addEventListener("error", () =>
      set({ error: "playback error", isPlaying: false, isLoading: false }),
    );
    audio = a;
    return a;
  }

  return {
    current: null,
    isPlaying: false,
    isLoading: false,
    position: 0,
    duration: 0,
    volume: 0.8,
    error: null,

    async playTrack(track) {
      const a = ensureAudio();

      // Same track → just toggle.
      if (get().current?.id === track.id) {
        if (a.paused) void a.play();
        else a.pause();
        return;
      }

      set({
        current: track,
        isLoading: true,
        error: null,
        position: 0,
        duration: 0,
      });
      try {
        const url = await scGetStreamUrl(track.id);
        // Guard against a newer play() having replaced the current track.
        if (get().current?.id !== track.id) return;
        a.src = url;
        a.volume = get().volume;
        await a.play();
        set({ isLoading: false });
      } catch (e) {
        set({ isLoading: false, error: String(e), isPlaying: false });
      }
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
    },
  };
});
