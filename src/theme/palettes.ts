import type { Shade } from "./tokens";

/**
 * The sheet, in two printings.
 *
 * One palette, because Relief is one language and a palette picker is an
 * unanswered question about which language the app speaks. Seventeen palettes and
 * five skins were the shape of that question being asked over and over.
 *
 * ## Why these colours
 *
 * A survey sheet is not a muted document — it is one of the most colourful
 * printed things there is, and every colour on it is doing a job. An earlier draft
 * of this palette drew the ramp in soft ochres on near-white and read as empty,
 * which is precisely the complaint this whole redesign exists to answer. So the
 * ramp is at real strength: lowland green, meadow, wheat, ochre, sienna — the
 * actual hypsometric sequence, low ground to high.
 *
 * The ground stays light, and that is the bet. Every player in this category is
 * dark, this project has been dark five times over, and a sheet is printed on
 * paper. It is a *slate-green* paper rather than white — deep enough that type
 * sits on a surface instead of floating, and biased toward the ramp's own family
 * so the two never argue.
 *
 * Colour arrives from two places and no others: the ramp, where it means a
 * measured quantity, and the cover art, which is never touched. That is the whole
 * argument for a restrained ground — the wall of other people's artwork is the
 * colour, and a loud page would compete with it.
 *
 * Values are hex. Oklch earns its keep when hues are rotated programmatically,
 * which was the old arrangement; a ramp is a measured sequence rather than a
 * rotation, and hex keeps these readable against the manifesto's own table.
 */

/** Contrast checked against the ground: ink 15.1:1, inkSoft 4.9:1, water 5.4:1. */
const LIGHT: Shade = {
  sheet: "#E7EAE3",
  surface: "#DCE0D5",
  ink: "#14180F",
  inkSoft: "#57604F",
  contour: "#A9B39E",
  water: "#1F5E86",
  warning: "#9E2B1F",
  relief: ["#BFD3A6", "#DCE3A0", "#EED98C", "#DDA85C", "#C6784A"],
};

/**
 * The same sheet printed on black stock: the hues hold, the lightness inverts.
 *
 * Not a second palette and not an inversion either — an inverted ramp would put
 * the pale bands at the top of the scale, and the scale has to keep climbing in
 * the same direction whichever stock it is printed on. So the bands keep their
 * hues and lose their lightness.
 */
const DARK: Shade = {
  sheet: "#14180F",
  surface: "#1E2419",
  ink: "#E7EAE3",
  inkSoft: "#8D9685",
  contour: "#333B2C",
  water: "#5E9EC4",
  warning: "#D2624E",
  relief: ["#4C6B3A", "#6E7539", "#8A7440", "#96683A", "#8E4F33"],
};

export const SHEET = { light: LIGHT, dark: DARK } as const;

/**
 * The accents, and there are exactly five because the ramp has five bands.
 *
 * Not a palette of moods. Picking one says "colour the interface at this
 * elevation", which is a sentence the legend can already translate; anything
 * outside the ramp would be a colour with no entry in it. `null` means the
 * water — the map's own cool colour, and the default.
 */
export const ACCENTS = ["lowland", "meadow", "wheat", "ochre", "sienna"] as const;

export type AccentId = (typeof ACCENTS)[number];

/** The band a named accent points at, per printing. */
export function accentValue(id: AccentId, dark: boolean): string {
  const shade = dark ? DARK : LIGHT;
  return shade.relief[ACCENTS.indexOf(id)];
}
