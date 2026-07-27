import { EQ_BANDS } from "./engine";

/**
 * Equaliser presets, in dB per band (31 Hz → 16 kHz).
 *
 * Deliberately conservative: every curve stays inside ±7 dB and keeps the
 * 1–2 kHz region near flat, so switching presets changes character without
 * wrecking the mix or clipping the output.
 */

export interface EqPreset {
  id: string;
  name: string;
  bands: number[];
}

const flat = EQ_BANDS.map(() => 0);

export const EQ_PRESETS: EqPreset[] = [
  { id: "flat", name: "Flat", bands: flat },
  { id: "bass", name: "Bass Boost", bands: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: "deep", name: "Deep", bands: [5, 4, 2, 0, -1, -2, -1, 1, 3, 4] },
  { id: "treble", name: "Treble Boost", bands: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
  { id: "vocal", name: "Vocal", bands: [-3, -2, -1, 1, 3, 4, 3, 1, 0, -1] },
  { id: "rock", name: "Rock", bands: [4, 3, 1, -1, -2, 0, 2, 3, 4, 4] },
  { id: "electronic", name: "Electronic", bands: [5, 4, 1, 0, -2, 1, 1, 2, 4, 5] },
  { id: "jazz", name: "Jazz", bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { id: "podcast", name: "Podcast", bands: [-4, -3, 0, 3, 4, 4, 3, 1, -1, -2] },
  { id: "night", name: "Night", bands: [-2, -1, 0, 1, 2, 2, 1, 0, -2, -3] },
];

/** Which preset the current band values correspond to, if any. */
export function matchPreset(bands: number[]): string | null {
  const preset = EQ_PRESETS.find((p) =>
    p.bands.every((v, i) => Math.abs(v - (bands[i] ?? 0)) < 0.01),
  );
  return preset?.id ?? null;
}
