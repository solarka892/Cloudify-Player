import type { Shade } from "./tokens";

/**
 * Palettes control *colour* only — never form.
 *
 * Each palette carries a dark and a light variant so "follow the system" is a
 * real option rather than a second set of palettes.
 *
 * Values are hex, and used to be oklch. Oklch earns its keep when hues are
 * swapped programmatically and perceived lightness has to survive the swap —
 * which was the old arrangement, five palettes with an accent picker over them.
 * Relief does not swap hues: every value is a named entry in a legend
 * (`docs/design-language.md`), the ramp is a measured sequence rather than a
 * rotation, and the eight numbers below are the same eight quoted in the
 * manifesto. Hex keeps those two readable as one list.
 */

export type PaletteId = "relief";

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
   * It is not a description of the palette's own values but a rule about colour
   * arriving from *outside* it: an accent sampled from the playing cover is
   * reduced to its lightness instead of being applied as found. Without it, one
   * switch in Settings puts a magenta play button on an interface that never
   * agreed to magenta. See `desaturate` in `theme/artwork.ts`.
   *
   * Relief does not set it, and reaches the same end by a different route: a
   * sampled colour is snapped to the nearest band of the relief ramp, so cover
   * colour still reaches the interface but only ever as an entry the legend
   * already declares. Draining it to grey would answer rule 3 of the language
   * while throwing away the thing the switch is for.
   */
  achromatic?: boolean;
}

export const PALETTES: Record<PaletteId, Palette> = {
  /**
   * Relief — the app's only palette. See `docs/design-language.md`.
   *
   * A hypsometric sheet: one ink, one cool, one hazard, and a five-step ramp
   * that is a single scale rather than five separate colours. Eight values,
   * because a legend has as many entries as it has meanings.
   *
   * Light is the default shade and that is the point. Every player in the
   * category is dark, this project has been dark five times over, and a
   * topographic sheet is printed on paper. Dark is the same sheet printed on
   * black stock — the hues hold, the lightness inverts — not a second palette.
   *
   * `brand` is `--water`: the map's one cool colour, spent on selection and on
   * "you are here". `brand2` is the top of the relief ramp, so the two together
   * read as "the cold thing and the high thing" rather than as a gradient.
   */
  relief: {
    id: "relief",
    name: "Relief",
    light: {
      bg: "#EEF0EA",
      surface: "#E4E8DE",
      surface2: "#CFD9C4",
      text: "#171C15",
      muted: "#5B6458",
      line: "#B4BEAB",
      brand: "#2F6B8F",
      brand2: "#C9A97A",
    },
    dark: {
      bg: "#171C15",
      surface: "#1F261D",
      surface2: "#2C352A",
      text: "#EEF0EA",
      muted: "#96A08F",
      line: "#3A4437",
      brand: "#6FA8C7",
      brand2: "#C9A97A",
    },
  },
};

export const PALETTE_IDS = (Object.keys(PALETTES) as PaletteId[]).filter(
  (id) => !PALETTES[id].hidden,
);

/** Palettes that only appear once found. */
export const HIDDEN_PALETTE_IDS = (Object.keys(PALETTES) as PaletteId[]).filter(
  (id) => PALETTES[id].hidden,
);

/** Quick accent overrides, applied on top of whatever palette is active. */
/**
 * The relief ramp, offered as a choice of accent.
 *
 * Not a palette of moods — the same five bands the rows are tinted with, so
 * picking one says "colour the interface at this elevation" rather than "make
 * it purple". Anything outside the ramp would be a colour with no entry in the
 * legend, which this language does not have.
 */
export const ACCENTS: Record<string, { brand: string; brand2: string }> = {
  water: { brand: "#2F6B8F", brand2: "#C9A97A" },
  lowland: { brand: "#7C9A6A", brand2: "#CFD9C4" },
  plain: { brand: "#A79B62", brand2: "#D9CFA6" },
  upland: { brand: "#C9A97A", brand2: "#D9CFA6" },
  peak: { brand: "#8C8F86", brand2: "#F4F2EE" },
};

export const ACCENT_IDS = Object.keys(ACCENTS);
