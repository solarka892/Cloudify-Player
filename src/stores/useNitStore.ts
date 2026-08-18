import { create } from "zustand";
import {
  cacheGoneTracks,
  cacheRowFacts,
  diaryList,
  dupesFind,
  laterAdd,
  laterList,
  laterRemove,
  marksAdd,
  marksAll,
  marksDelete,
  marksList,
  marksUpdate,
  threadWaveform,
  type DiaryEntry,
  type DuplicateGroup,
  type LaterItem,
  type Mark,
  type StoredTrack,
} from "@/lib/store";
import type { Track } from "@/lib/tauri";

/**
 * The local features' state: marks, later, the diary, duplicates, tombstones.
 *
 * One store rather than five. They are all thin views over the same SQLite file
 * and they all invalidate each other — marking a track writes a diary outcome,
 * hiding a duplicate changes what the library shows, saving something for later
 * is the last step of the clipboard trap — so five stores would mostly consist
 * of asking each other to refresh.
 *
 * The marks of the *playing* track are held separately from the rest and kept
 * hot, because the thread redraws from them and the number keys step through
 * them; everything else is loaded when its screen is opened.
 */

export interface Waveform {
  samples: number[];
  height: number;
}

interface NitState {
  /** Marks on the playing track, in playing order. */
  marks: Mark[];
  /** Which track `marks` belongs to, so a stale response can be dropped. */
  marksFor: number | null;

  /** The playing track's waveform, or a shape derived from its id. */
  waveform: Waveform | null;
  waveformFor: number | null;
  /** True when the shape is ours rather than SoundCloud's. */
  waveformSynthetic: boolean;

  /** Loop between two adjacent marks: [from, to] in ms, or null. */
  loop: [number, number] | null;

  /**
   * What every row in a list needs to know about itself: how many marks it
   * carries, and whether the upload is gone. Two maps keyed by track id.
   *
   * Held here rather than fetched per row for the obvious reason — a likes list
   * is three thousand rows — and refreshed whenever a mark is made or removed,
   * which is the only thing in the app that changes either number.
   */
  rowMarks: Record<string, number>;
  rowGone: Record<string, number>;

  all: [Mark, StoredTrack | null][];
  later: LaterItem[];
  diary: DiaryEntry[];
  dupes: DuplicateGroup[];
  gone: StoredTrack[];
  busy: boolean;

  /**
   * Load the marks and the waveform for a track that just started.
   *
   * `resolveWaveformUrl` is only called when the local copy misses, so playing
   * a track a second time costs no request at all — which is why it is a
   * callback rather than a URL the caller has to fetch first.
   */
  focusTrack: (
    track: Track | null,
    resolveWaveformUrl?: () => Promise<string | null>,
  ) => Promise<void>;
  addMark: (trackId: number, positionMs: number, note?: string) => Promise<Mark | null>;
  editMark: (id: number, note: string) => Promise<void>;
  removeMark: (id: number) => Promise<void>;
  /** Loop from this mark to the next one. Passing the active one clears it. */
  toggleLoop: (mark: Mark) => void;
  clearLoop: () => void;

  /** Refresh the per-row facts. Cheap: one grouped query. */
  loadRowFacts: () => Promise<void>;
  loadAll: () => Promise<void>;
  loadLater: () => Promise<void>;
  saveLater: (track: Track, source: "manual" | "trap" | "search") => Promise<void>;
  dropLater: (trackId: number) => Promise<void>;
  loadDiary: () => Promise<void>;
  loadDupes: () => Promise<void>;
  loadGone: () => Promise<void>;
}

/**
 * A waveform for a track SoundCloud has no waveform for.
 *
 * Derived from the id, so it is the same shape every time the track is played —
 * a random one would redraw differently on every launch, which reads as a bug in
 * the thread rather than as a missing waveform. Deliberately gentle: it should
 * look like a quiet track, not like a fake of a loud one.
 */
export function syntheticWaveform(trackId: number, width = 160): Waveform {
  const samples: number[] = [];
  // xorshift, seeded from the id. Small, deterministic, and not `Math.random`.
  let seed = (trackId ^ 0x9e3779b9) >>> 0 || 1;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0xffffffff;
  };
  for (let i = 0; i < width; i++) {
    // A slow envelope so it has a shape, plus a little noise so it has texture.
    const envelope = 0.55 + 0.3 * Math.sin((i / width) * Math.PI * 3);
    samples.push(Math.round(Math.max(0.08, Math.min(1, envelope * (0.7 + next() * 0.6))) * 100));
  }
  return { samples, height: 100 };
}

export const useNitStore = create<NitState>()((set, get) => ({
  marks: [],
  marksFor: null,
  waveform: null,
  waveformFor: null,
  waveformSynthetic: false,
  loop: null,
  rowMarks: {},
  rowGone: {},
  all: [],
  later: [],
  diary: [],
  dupes: [],
  gone: [],
  busy: false,

  async focusTrack(track, resolveWaveformUrl) {
    if (!track) {
      set({ marks: [], marksFor: null, waveform: null, waveformFor: null, loop: null });
      return;
    }
    if (get().marksFor === track.id) return;
    set({ marksFor: track.id, marks: [], loop: null });

    const marks = await marksList(track.id).catch(() => []);
    // The track may have changed while we were asking.
    if (get().marksFor === track.id) set({ marks });

    let wave = await threadWaveform(track.id).catch(() => null);
    if (get().marksFor !== track.id) return;
    if (!wave && resolveWaveformUrl) {
      const url = await resolveWaveformUrl().catch(() => null);
      if (get().marksFor !== track.id) return;
      if (url) wave = await threadWaveform(track.id, url).catch(() => null);
      if (get().marksFor !== track.id) return;
    }
    set({
      waveform: wave ?? syntheticWaveform(track.id),
      waveformFor: track.id,
      waveformSynthetic: !wave,
    });
  },

  async addMark(trackId, positionMs, note) {
    const mark = await marksAdd(trackId, positionMs, note ?? null).catch(() => null);
    if (!mark) return null;
    if (get().marksFor === trackId) {
      set({
        marks: [...get().marks, mark].sort((a, b) => a.position_ms - b.position_ms),
      });
    }
    void get().loadRowFacts();
    return mark;
  },

  async editMark(id, note) {
    await marksUpdate(id, note).catch(() => {});
    set({
      marks: get().marks.map((m) => (m.id === id ? { ...m, note } : m)),
      all: get().all.map(([m, t]) => (m.id === id ? [{ ...m, note }, t] : [m, t])),
    });
  },

  async removeMark(id) {
    await marksDelete(id).catch(() => {});
    set({
      marks: get().marks.filter((m) => m.id !== id),
      all: get().all.filter(([m]) => m.id !== id),
      // A loop bounded by a mark that no longer exists would run forever.
      loop: null,
    });
    void get().loadRowFacts();
  },

  toggleLoop(mark) {
    const marks = get().marks;
    const index = marks.findIndex((m) => m.id === mark.id);
    if (index < 0) return;
    const to = marks[index + 1]?.position_ms;
    const from = mark.position_ms;
    const current = get().loop;
    if (current && current[0] === from) {
      set({ loop: null });
      return;
    }
    // The last mark loops to the end of the track, which the player clamps.
    set({ loop: [from, to ?? Number.POSITIVE_INFINITY] });
  },

  clearLoop: () => set({ loop: null }),

  async loadRowFacts() {
    const facts = await cacheRowFacts().catch(() => null);
    if (facts) set({ rowMarks: facts.marks, rowGone: facts.gone });
  },

  async loadAll() {
    set({ busy: true });
    set({ all: await marksAll().catch(() => []), busy: false });
  },

  async loadLater() {
    set({ later: await laterList().catch(() => []) });
  },

  async saveLater(track, source) {
    await laterAdd(track, source).catch(() => {});
    await get().loadLater();
  },

  async dropLater(trackId) {
    await laterRemove(trackId).catch(() => {});
    set({ later: get().later.filter((i) => i.track_id !== trackId) });
  },

  async loadDiary() {
    set({ busy: true });
    set({ diary: await diaryList().catch(() => []), busy: false });
  },

  async loadDupes() {
    set({ busy: true });
    set({ dupes: await dupesFind().catch(() => []), busy: false });
  },

  async loadGone() {
    set({ gone: await cacheGoneTracks().catch(() => []) });
  },
}));
