import { analyser } from "@/audio/engine";

/**
 * How loud a track actually was, and what to do about it.
 *
 * ## What is measured
 *
 * Not LUFS. Proper loudness measurement needs K-weighting, gated 400 ms blocks
 * and the whole of BS.1770; what happens here is a running mean of the RMS of
 * whatever the analyser hands over, in dBFS. That is a coarser number, and it is
 * the honest one to use because of how it is applied: the difference between two
 * tracks' means is a good estimate of how much one will jump against the other,
 * which is the entire question being asked. Nothing here claims a standard it
 * does not implement, and the interface shows the trim in dB rather than a
 * loudness figure.
 *
 * ## What it costs
 *
 * One `getFloatTimeDomainData` per second into a 2048-sample buffer, which is
 * about a quarter of a millisecond of work. It runs only while a Web Audio graph
 * exists for some other reason — the equaliser, the visualiser, night mode — and
 * simply does not sample when there is none. See the comment on `levelling` in
 * `engine.ts` for why measuring is opportunistic while *applying* is not.
 */

/** Target for the trim: roughly where a mastered release sits. */
const TARGET_DBFS = -14;

/** Never move a track by more than this, in either direction. */
const MAX_TRIM_DB = 9;

/** Silence, and anything close enough to it to be a measurement of nothing. */
const FLOOR_DBFS = -70;

export interface Measurement {
  /** Mean level in dBFS over everything sampled so far. */
  levelDb: number;
  /** How many samples went into it; below a handful it means nothing. */
  count: number;
}

export function newMeasurement(): Measurement {
  return { levelDb: 0, count: 0 };
}

/**
 * Take one reading. Returns the updated measurement, or the same one when
 * there is no graph to read from.
 */
export function sample(measurement: Measurement): Measurement {
  const node = analyser();
  if (!node) return measurement;

  const buffer = new Float32Array(node.fftSize);
  node.getFloatTimeDomainData(buffer);

  let sum = 0;
  for (const value of buffer) sum += value * value;
  const rms = Math.sqrt(sum / buffer.length);
  if (rms <= 0) return measurement;

  const db = 20 * Math.log10(rms);
  // A gap between tracks, or a quiet intro, is not a measurement of the track.
  if (db < FLOOR_DBFS) return measurement;

  // Running mean rather than a growing array: this runs for the length of a
  // track and the only thing anyone wants out of it is the average.
  const count = measurement.count + 1;
  return {
    count,
    levelDb: measurement.levelDb + (db - measurement.levelDb) / count,
  };
}

/** Whether enough of the track was heard for the number to mean anything. */
export function isUsable(measurement: Measurement): boolean {
  // Thirty readings is thirty seconds of playback.
  return measurement.count >= 30;
}

/**
 * The gain to play a track at, given what it measured last time.
 *
 * Returns 1 for a track never measured — a first play is untouched, which is
 * the whole reason this can be described plainly in Settings.
 */
export function gainFor(levelDb: number | null): number {
  if (levelDb === null || !Number.isFinite(levelDb)) return 1;
  const trim = Math.max(-MAX_TRIM_DB, Math.min(MAX_TRIM_DB, TARGET_DBFS - levelDb));
  return 10 ** (trim / 20);
}

/** The same trim, in dB, for showing in the player. */
export function trimFor(levelDb: number | null): number | null {
  if (levelDb === null || !Number.isFinite(levelDb)) return null;
  return Math.max(-MAX_TRIM_DB, Math.min(MAX_TRIM_DB, TARGET_DBFS - levelDb));
}
