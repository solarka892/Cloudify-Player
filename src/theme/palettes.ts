import type { Shade } from "./tokens";

/**
 * Palettes control *colour* only — never form.
 *
 * Each palette carries a dark and a light variant so "follow the system" is a
 * real option rather than a second set of palettes. Values are oklch: it keeps
 * perceived lightness consistent when a hue is swapped, which matters because
 * users can override the accent on top of any palette.
 */

export type PaletteId =
  | "vapor"
  | "midnight"
  | "noir"
  | "ocean"
  | "plum"
  | "forest"
  | "sand";

export interface Palette {
  id: PaletteId;
  name: string;
  dark: Shade;
  light: Shade;
  /** Hidden from the picker until unlocked. Some things are worth finding. */
  hidden?: boolean;
}

export const PALETTES: Record<PaletteId, Palette> = {
  /** Not in the picker. Ten keystrokes away. */
  vapor: {
    id: "vapor",
    name: "Vapor",
    hidden: true,
    dark: {
      bg: "oklch(0.19 0.06 300)",
      surface: "oklch(0.25 0.08 300)",
      surface2: "oklch(0.33 0.1 300)",
      text: "oklch(0.97 0.02 320)",
      muted: "oklch(0.75 0.06 320)",
      line: "oklch(0.85 0.12 320 / 22%)",
      brand: "oklch(0.78 0.19 340)",
      brand2: "oklch(0.82 0.14 200)",
    },
    light: {
      bg: "oklch(0.96 0.03 320)",
      surface: "oklch(0.99 0.015 320)",
      surface2: "oklch(0.92 0.04 320)",
      text: "oklch(0.26 0.06 300)",
      muted: "oklch(0.55 0.06 310)",
      line: "oklch(0.5 0.1 320 / 20%)",
      brand: "oklch(0.62 0.2 340)",
      brand2: "oklch(0.66 0.14 205)",
    },
  },

  /** Neutral greys, warm accent. The default. */
  midnight: {
    id: "midnight",
    name: "Midnight",
    dark: {
      bg: "oklch(0.145 0 0)",
      surface: "oklch(0.205 0 0)",
      surface2: "oklch(0.269 0 0)",
      text: "oklch(0.985 0 0)",
      muted: "oklch(0.708 0 0)",
      line: "oklch(1 0 0 / 10%)",
      brand: "oklch(0.75 0.17 55)",
      brand2: "oklch(0.68 0.22 12)",
    },
    light: {
      bg: "oklch(0.985 0 0)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.955 0 0)",
      text: "oklch(0.185 0 0)",
      muted: "oklch(0.505 0 0)",
      line: "oklch(0 0 0 / 10%)",
      brand: "oklch(0.66 0.18 45)",
      brand2: "oklch(0.6 0.22 10)",
    },
  },

  /** Pure black, maximum contrast — made for OLED. */
  noir: {
    id: "noir",
    name: "Noir",
    dark: {
      bg: "oklch(0.06 0 0)",
      surface: "oklch(0.13 0 0)",
      surface2: "oklch(0.2 0 0)",
      text: "oklch(0.99 0 0)",
      muted: "oklch(0.66 0 0)",
      line: "oklch(1 0 0 / 14%)",
      brand: "oklch(0.9 0.05 250)",
      brand2: "oklch(0.75 0.12 280)",
    },
    light: {
      bg: "oklch(1 0 0)",
      surface: "oklch(0.985 0 0)",
      surface2: "oklch(0.94 0 0)",
      text: "oklch(0.12 0 0)",
      muted: "oklch(0.46 0 0)",
      line: "oklch(0 0 0 / 14%)",
      brand: "oklch(0.45 0.06 260)",
      brand2: "oklch(0.4 0.12 285)",
    },
  },

  /** Cool blue-tinted surfaces, cyan accent. */
  ocean: {
    id: "ocean",
    name: "Ocean",
    dark: {
      bg: "oklch(0.17 0.025 245)",
      surface: "oklch(0.225 0.03 245)",
      surface2: "oklch(0.29 0.035 245)",
      text: "oklch(0.97 0.008 245)",
      muted: "oklch(0.7 0.025 245)",
      line: "oklch(0.75 0.05 245 / 16%)",
      brand: "oklch(0.75 0.15 210)",
      brand2: "oklch(0.68 0.17 255)",
    },
    light: {
      bg: "oklch(0.975 0.012 235)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.945 0.018 235)",
      text: "oklch(0.21 0.03 245)",
      muted: "oklch(0.52 0.03 245)",
      line: "oklch(0.4 0.05 245 / 14%)",
      brand: "oklch(0.6 0.14 220)",
      brand2: "oklch(0.55 0.16 260)",
    },
  },

  /** Warm violet, magenta accent. */
  plum: {
    id: "plum",
    name: "Plum",
    dark: {
      bg: "oklch(0.165 0.028 310)",
      surface: "oklch(0.22 0.035 310)",
      surface2: "oklch(0.285 0.04 310)",
      text: "oklch(0.97 0.008 310)",
      muted: "oklch(0.7 0.03 310)",
      line: "oklch(0.78 0.06 310 / 16%)",
      brand: "oklch(0.72 0.2 340)",
      brand2: "oklch(0.66 0.2 295)",
    },
    light: {
      bg: "oklch(0.975 0.012 310)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.945 0.018 310)",
      text: "oklch(0.21 0.035 310)",
      muted: "oklch(0.52 0.035 310)",
      line: "oklch(0.4 0.06 310 / 14%)",
      brand: "oklch(0.58 0.19 340)",
      brand2: "oklch(0.54 0.18 295)",
    },
  },

  /** Deep green, lime accent. */
  forest: {
    id: "forest",
    name: "Forest",
    dark: {
      bg: "oklch(0.16 0.025 155)",
      surface: "oklch(0.215 0.03 155)",
      surface2: "oklch(0.28 0.035 155)",
      text: "oklch(0.97 0.01 155)",
      muted: "oklch(0.7 0.028 155)",
      line: "oklch(0.78 0.06 155 / 16%)",
      brand: "oklch(0.78 0.17 145)",
      brand2: "oklch(0.72 0.15 180)",
    },
    light: {
      bg: "oklch(0.975 0.014 150)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.945 0.02 150)",
      text: "oklch(0.2 0.03 155)",
      muted: "oklch(0.5 0.03 155)",
      line: "oklch(0.38 0.06 155 / 14%)",
      brand: "oklch(0.58 0.15 150)",
      brand2: "oklch(0.55 0.13 185)",
    },
  },

  /** Warm paper tones — the one that reads best in light mode. */
  sand: {
    id: "sand",
    name: "Sand",
    dark: {
      bg: "oklch(0.175 0.012 70)",
      surface: "oklch(0.235 0.016 70)",
      surface2: "oklch(0.3 0.02 70)",
      text: "oklch(0.97 0.012 80)",
      muted: "oklch(0.71 0.02 75)",
      line: "oklch(0.8 0.04 75 / 16%)",
      brand: "oklch(0.8 0.14 75)",
      brand2: "oklch(0.72 0.16 40)",
    },
    light: {
      bg: "oklch(0.965 0.018 85)",
      surface: "oklch(0.99 0.008 85)",
      surface2: "oklch(0.93 0.024 85)",
      text: "oklch(0.24 0.02 60)",
      muted: "oklch(0.52 0.025 65)",
      line: "oklch(0.4 0.05 65 / 16%)",
      brand: "oklch(0.62 0.14 60)",
      brand2: "oklch(0.56 0.16 35)",
    },
  },
};

/** Everything the picker offers by default. */
export const PALETTE_IDS = (Object.keys(PALETTES) as PaletteId[]).filter(
  (id) => !PALETTES[id].hidden,
);

/** Palettes that only appear once found. */
export const HIDDEN_PALETTE_IDS = (Object.keys(PALETTES) as PaletteId[]).filter(
  (id) => PALETTES[id].hidden,
);

/** Quick accent overrides, applied on top of whatever palette is active. */
export const ACCENTS: Record<string, { brand: string; brand2: string }> = {
  orange: { brand: "oklch(0.75 0.17 55)", brand2: "oklch(0.68 0.22 12)" },
  pink: { brand: "oklch(0.72 0.22 350)", brand2: "oklch(0.66 0.24 320)" },
  violet: { brand: "oklch(0.68 0.21 295)", brand2: "oklch(0.62 0.2 270)" },
  blue: { brand: "oklch(0.7 0.16 245)", brand2: "oklch(0.64 0.19 275)" },
  cyan: { brand: "oklch(0.78 0.13 205)", brand2: "oklch(0.72 0.15 235)" },
  green: { brand: "oklch(0.74 0.17 155)", brand2: "oklch(0.72 0.15 185)" },
  amber: { brand: "oklch(0.83 0.16 85)", brand2: "oklch(0.76 0.17 60)" },
  red: { brand: "oklch(0.68 0.21 25)", brand2: "oklch(0.62 0.22 5)" },
};

export const ACCENT_IDS = Object.keys(ACCENTS);
