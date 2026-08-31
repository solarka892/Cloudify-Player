import { useEffect, useRef } from "react";
import { t } from "@/i18n";
import { clock } from "@/hooks/useHotkeys";
import { gainFor, isUsable, newMeasurement, sample } from "@/audio/loudness";
import {
  diaryFinish,
  diaryPrune,
  diaryStart,
  kvGet,
  kvSet,
  loudnessGet,
  loudnessSet,
} from "@/lib/store";
import { type Track } from "@/lib/tauri";
import { setLevellingGain, usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast } from "@/stores/useToastStore";

/**
 * Everything that has to happen *while* something is playing.
 *
 * Two features share one subscription to the player rather than each mounting
 * their own, because both key off the same two events — the track changed, the
 * position moved — and a store that updates four times a second is not one to
 * subscribe to twice for no reason.
 *
 *   - the resume point, written every few seconds and read at startup;
 *   - loudness: measured while playing, applied on the next play;
 *   - the diary: one entry per listen, closed with what became of it.
 *
 * This was `useNitSession` and carried two more — marks and the waveform the
 * thread drew, and the loop between two marks. Those went with Nit. The diary
 * stayed on purpose: it is what the app knows about how you actually listen,
 * and it has its own section now rather than a tab inside a feature.
 *
 * Renders nothing.
 */

/** Where the resume point is kept. One row in the store's key/value table. */
const RESUME_KEY = "resume";

/** How often the resume point is written while playing. */
const RESUME_EVERY_MS = 5000;

/** Past this fraction of a track, ending it counts as having played it. */
const PLAYED_FRACTION = 0.9;

interface ResumePoint {
  queue: Track[];
  index: number;
  positionMs: number;
}

export function usePlaybackSession(): void {
  const current = usePlayerStore((s) => s.current);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const levelling = useSettingsStore((s) => s.audio.levelling);
  const resumeEnabled = useSettingsStore((s) => s.nit.resume);
  const diaryDays = useSettingsStore((s) => s.nit.diaryDays);

  const measurement = useRef(newMeasurement());
  /** The track the open measurement belongs to. */
  const measuring = useRef<number | null>(null);
  /** The open diary entry, and what it was for. */
  const entry = useRef<{ id: number; trackId: number } | null>(null);
  /** Last position seen for the previous track, for the diary's outcome. */
  const lastSeen = useRef({ positionMs: 0, durationMs: 0 });

  // ── the track changed ───────────────────────────────────────────────────
  useEffect(() => {
    // Close the previous listen before opening the next: the outcome is only
    // knowable at the moment the track stops being the one that is playing.
    const open = entry.current;
    if (open && open.trackId !== current?.id) {
      const { positionMs, durationMs } = lastSeen.current;
      const played = durationMs > 0 && positionMs / durationMs >= PLAYED_FRACTION;
      void diaryFinish(open.id, played ? "played" : "skipped", positionMs);
      entry.current = null;
    }

    // The measurement belongs to the track that just ended, and only if enough
    // of it was heard for the number to mean anything.
    const previous = measuring.current;
    if (previous !== null && previous !== current?.id) {
      if (isUsable(measurement.current)) {
        void loudnessSet(previous, measurement.current.levelDb);
      }
      measurement.current = newMeasurement();
      measuring.current = null;
    }

    if (!current) {
      setLevellingGain(1);
      return;
    }
    measuring.current = current.id;

    void diaryStart(current).then((id) => {
      // A track switched away from while this was in flight must not leave an
      // entry that never closes.
      if (usePlayerStore.getState().current?.id === current.id) {
        entry.current = { id, trackId: current.id };
      } else {
        void diaryFinish(id, "skipped", 0);
      }
    });

    // The trim for this track, from what it measured last time. Always set,
    // including to 1 — a stale gain from the previous track would be worse than
    // no levelling at all.
    if (!levelling) {
      setLevellingGain(1);
    } else {
      void loudnessGet(current.id)
        .then((level) => {
          if (usePlayerStore.getState().current?.id === current.id) {
            setLevellingGain(gainFor(level));
          }
        })
        .catch(() => setLevellingGain(1));
    }
  }, [current, levelling]);

  // ── while it plays ──────────────────────────────────────────────────────
  useEffect(() => {
    lastSeen.current = { positionMs: position * 1000, durationMs: duration * 1000 };
  }, [position, duration]);

  // ── measuring ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!levelling || !isPlaying) return;
    const timer = window.setInterval(() => {
      measurement.current = sample(measurement.current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [levelling, isPlaying]);

  // ── the resume point ────────────────────────────────────────────────────
  useEffect(() => {
    if (!resumeEnabled) return;
    const write = () => {
      const player = usePlayerStore.getState();
      if (!player.current) return;
      const point: ResumePoint = {
        queue: player.queue,
        index: player.order[player.pos] ?? 0,
        positionMs: player.position * 1000,
      };
      void kvSet(RESUME_KEY, JSON.stringify(point));
    };
    const timer = window.setInterval(write, RESUME_EVERY_MS);
    // Closing the window is the one moment the interval is guaranteed to have
    // missed, and it is also the moment that matters most.
    window.addEventListener("beforeunload", write);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", write);
      write();
    };
  }, [resumeEnabled]);

  // ── at startup ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Retention first: a window the user shortened while the app was closed has
    // to take effect before anything is written this session.
    void diaryPrune(diaryDays);

    if (!resumeEnabled) return;
    let cancelled = false;
    void kvGet(RESUME_KEY).then((raw) => {
      if (!raw || cancelled) return;
      // Anything already playing means the user got there first.
      if (usePlayerStore.getState().current) return;
      let point: ResumePoint;
      try {
        point = JSON.parse(raw) as ResumePoint;
      } catch {
        return;
      }
      const track = point.queue?.[point.index];
      if (!track) return;

      // Cued, not played. This used to call `playTrack` and pause immediately
      // afterwards, which is half a second of audio at every launch — a jump
      // scare on a desktop, and on Android a play/pause round trip through the
      // media session that took the track's sound with it. `cueTrack` loads the
      // queue and the position and never starts anything.
      void usePlayerStore
        .getState()
        .cueTrack(track, point.queue, point.positionMs)
        .then(() => {
          toast(
            t.settings.resumed.replace("{time}", clock(point.positionMs)),
            "info",
          );
        });
    });
    return () => {
      cancelled = true;
    };
    // Startup only: re-running this would try to restore a session the user is
    // already in the middle of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
