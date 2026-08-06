import { APPLE_DARK, APPLE_LIGHT } from "./apple";
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
  | "apple"
  | "vapor"
  | "midnight"
  | "paper"
  | "graphite"
  | "ink"
  | "slate"
  | "porcelain"
  | "carbon"
  | "noir"
  | "obsidian"
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
  /**
   * The palette rules colour out, not just tones it down.
   *
   * Every one of its eight values already has zero chroma — but so does `ink`,
   * and the flag is not a description of them. It is what happens to colour that
   * arrives from *outside* the palette: an accent sampled from the playing cover
   * is reduced to its lightness instead of being applied as found. Without it,
   * one switch in Settings puts a magenta play button on a monochrome interface
   * and the palette has no say. See `desaturate` in `theme/artwork.ts`.
   */
  achromatic?: boolean;
}

export const PALETTES: Record<PaletteId, Palette> = {
  /**
   * The iOS system palette, as an ordinary palette.
   *
   * It lives here rather than only inside Apple mode so the picker keeps
   * working while that mode is on: the mode owns the *form* and the shell, and
   * switches to this on the way in, but colour stays the user's to change. It
   * is also perfectly usable under the other skins, which is the argument for
   * it being a palette in the first place.
   *
   * Not oklch like the rest — these are Apple's published sRGB values, and
   * converting them would move them.
   */
  apple: {
    id: "apple",
    name: "Apple",
    dark: APPLE_DARK,
    light: APPLE_LIGHT,
  },

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


  /** Pure white paper, near-black text. The brightest option. */
  paper: {
    id: "paper",
    name: "Paper",
    dark: {
      bg: "oklch(0.21 0 0)",
      surface: "oklch(0.27 0 0)",
      surface2: "oklch(0.34 0 0)",
      text: "oklch(0.98 0 0)",
      muted: "oklch(0.72 0 0)",
      line: "oklch(1 0 0 / 12%)",
      brand: "oklch(0.72 0 0)",
      brand2: "oklch(0.86 0 0)",
    },
    light: {
      bg: "oklch(1 0 0)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.96 0 0)",
      text: "oklch(0.16 0 0)",
      muted: "oklch(0.48 0 0)",
      line: "oklch(0 0 0 / 12%)",
      brand: "oklch(0.32 0 0)",
      brand2: "oklch(0.5 0 0)",
    },
  },

  /** Mid grey throughout — no pure black, no pure white. */
  graphite: {
    id: "graphite",
    name: "Graphite",
    dark: {
      bg: "oklch(0.26 0 0)",
      surface: "oklch(0.32 0 0)",
      surface2: "oklch(0.39 0 0)",
      text: "oklch(0.95 0 0)",
      muted: "oklch(0.72 0 0)",
      line: "oklch(1 0 0 / 13%)",
      brand: "oklch(0.82 0 0)",
      brand2: "oklch(0.66 0 0)",
    },
    light: {
      bg: "oklch(0.9 0 0)",
      surface: "oklch(0.95 0 0)",
      surface2: "oklch(0.86 0 0)",
      text: "oklch(0.2 0 0)",
      muted: "oklch(0.45 0 0)",
      line: "oklch(0 0 0 / 14%)",
      brand: "oklch(0.36 0 0)",
      brand2: "oklch(0.55 0 0)",
    },
  },

  /** Maximum contrast, no colour anywhere. */
  ink: {
    id: "ink",
    name: "Ink",
    dark: {
      bg: "oklch(0 0 0)",
      surface: "oklch(0.11 0 0)",
      surface2: "oklch(0.19 0 0)",
      text: "oklch(1 0 0)",
      muted: "oklch(0.68 0 0)",
      line: "oklch(1 0 0 / 18%)",
      brand: "oklch(1 0 0)",
      brand2: "oklch(0.78 0 0)",
    },
    light: {
      bg: "oklch(1 0 0)",
      surface: "oklch(1 0 0)",
      surface2: "oklch(0.93 0 0)",
      text: "oklch(0 0 0)",
      muted: "oklch(0.42 0 0)",
      line: "oklch(0 0 0 / 20%)",
      brand: "oklch(0 0 0)",
      brand2: "oklch(0.3 0 0)",
    },
  },

  /** Cool grey with a blue cast. */
  slate: {
    id: "slate",
    name: "Slate",
    dark: {
      bg: "oklch(0.2 0.012 250)",
      surface: "oklch(0.26 0.014 250)",
      surface2: "oklch(0.33 0.016 250)",
      text: "oklch(0.96 0.004 250)",
      muted: "oklch(0.71 0.012 250)",
      line: "oklch(0.8 0.03 250 / 14%)",
      brand: "oklch(0.82 0.03 250)",
      brand2: "oklch(0.68 0.05 250)",
    },
    light: {
      bg: "oklch(0.955 0.005 250)",
      surface: "oklch(0.99 0.002 250)",
      surface2: "oklch(0.91 0.008 250)",
      text: "oklch(0.19 0.015 250)",
      muted: "oklch(0.47 0.015 250)",
      line: "oklch(0.3 0.03 250 / 14%)",
      brand: "oklch(0.38 0.03 250)",
      brand2: "oklch(0.52 0.05 250)",
    },
  },

  /** Warm off-white, very soft edges. */
  porcelain: {
    id: "porcelain",
    name: "Porcelain",
    dark: {
      bg: "oklch(0.23 0.006 60)",
      surface: "oklch(0.29 0.008 60)",
      surface2: "oklch(0.36 0.01 60)",
      text: "oklch(0.97 0.006 60)",
      muted: "oklch(0.73 0.01 60)",
      line: "oklch(1 0 0 / 12%)",
      brand: "oklch(0.85 0.02 60)",
      brand2: "oklch(0.7 0.03 40)",
    },
    light: {
      bg: "oklch(0.975 0.006 70)",
      surface: "oklch(1 0.002 70)",
      surface2: "oklch(0.935 0.01 70)",
      text: "oklch(0.22 0.01 60)",
      muted: "oklch(0.5 0.012 60)",
      line: "oklch(0.35 0.02 60 / 13%)",
      brand: "oklch(0.4 0.02 55)",
      brand2: "oklch(0.55 0.04 40)",
    },
  },

  /** Near-black with a warm grey lift; softer than Ink. */
  carbon: {
    id: "carbon",
    name: "Carbon",
    dark: {
      bg: "oklch(0.1 0.004 60)",
      surface: "oklch(0.16 0.005 60)",
      surface2: "oklch(0.24 0.006 60)",
      text: "oklch(0.96 0.004 60)",
      muted: "oklch(0.66 0.008 60)",
      line: "oklch(1 0 0 / 12%)",
      brand: "oklch(0.88 0.01 60)",
      brand2: "oklch(0.62 0.02 50)",
    },
    light: {
      bg: "oklch(0.93 0.004 60)",
      surface: "oklch(0.985 0.002 60)",
      surface2: "oklch(0.885 0.006 60)",
      text: "oklch(0.14 0.006 60)",
      muted: "oklch(0.44 0.008 60)",
      line: "oklch(0 0 0 / 15%)",
      brand: "oklch(0.24 0.01 60)",
      brand2: "oklch(0.45 0.02 50)",
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

  /**
   * True black, and nothing above it.
   *
   * Close enough to `ink` to be worth saying why both exist. `ink` is a
   * high-contrast palette: pure white text, 18% dividers, a light `muted`. This
   * one is the opposite instinct at the same black — text stops short of white
   * (97%) so that white is left to mean *accent*, dividers fall to 8% so they
   * read as hairlines rather than as rules, and `muted` drops to 55% so the
   * hierarchy has somewhere to go. `ink` is built to be legible; this is built to
   * be quiet, and against 8% lines the difference is the whole design.
   *
   * Paired with the Obsidian skin by the built-in preset, but it is an ordinary
   * palette: it works under Editorial, and the skin works over `ink`.
   */
  obsidian: {
    id: "obsidian",
    name: "Obsidian",
    achromatic: true,
    dark: {
      bg: "oklch(0 0 0)",
      // Both surfaces sit close to the page on purpose: what separates a panel
      // from the page is its hairline and the light behind it, not a step in
      // fill. Tuned for `--surface-alpha: 26%`, where these land near 2% and 4%
      // of white — see the skin's `--surface-sink` for the opaque case.
      surface: "oklch(0.115 0 0)",
      surface2: "oklch(0.17 0 0)",
      text: "oklch(0.97 0 0)",
      muted: "oklch(0.55 0 0)",
      line: "oklch(1 0 0 / 8%)",
      // The only solid white fill in the interface: the play button. Everything
      // else that wants emphasis gets it from weight or from a 2px marker.
      brand: "oklch(1 0 0)",
      brand2: "oklch(0.55 0 0)",
    },
    // Not an afterthought: "follow the system" is a real setting, and a palette
    // that only works after dark makes it a trap. Same reasoning inverted —
    // near-black text rather than pure black, hairlines at 9%, and enough
    // contrast in `muted` to clear 3:1 on white.
    light: {
      bg: "oklch(1 0 0)",
      surface: "oklch(0.985 0 0)",
      surface2: "oklch(0.935 0 0)",
      text: "oklch(0.09 0 0)",
      muted: "oklch(0.42 0 0)",
      line: "oklch(0 0 0 / 9%)",
      brand: "oklch(0 0 0)",
      brand2: "oklch(0.38 0 0)",
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
  /**
   * Neutral accents.
   *
   * ⚠️ `white` and `black` each have no contrast against one of the two
   * appearances: on a light palette a white accented label is near-invisible,
   * and a black one is on a dark palette. They are offered because a monochrome
   * accent is a look people want, not because either is safe everywhere — each
   * pair is a hair off pure so at least the gradient reads.
   */
  white: { brand: "oklch(1 0 0)", brand2: "oklch(0.9 0 0)" },
  /** The mirror of it, and mirror-image caveat: invisible on a dark palette. */
  black: { brand: "oklch(0 0 0)", brand2: "oklch(0.28 0 0)" },
  /** systemGray / systemGray2, which is what Apple's own neutral tint is. */
  grey: { brand: "oklch(0.68 0.01 260)", brand2: "oklch(0.55 0.01 260)" },

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
