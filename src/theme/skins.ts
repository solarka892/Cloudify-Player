import { SIGNATURE_OFF, type SkinVars } from "./tokens";

/**
 * Skins control *form* only — never colour. Swapping a skin must leave the
 * palette intact and vice versa; that orthogonality is the whole point.
 *
 * Fonts are system stacks on purpose: the app ships no font files, and a
 * user who wants a specific typeface sets it in Settings (their machine, their
 * fonts).
 */

export type SkinId = "aurora" | "editorial" | "studio" | "obsidian";

export interface Skin {
  id: SkinId;
  /** Untranslated on purpose — a skin's name is a name. The one-line
   *  description that goes with it lives in `settings.skinHints`. */
  name: string;
  vars: SkinVars;
  /**
   * What `--blur` and `--surface-alpha` become when Liquid glass is switched on.
   *
   * `vars` always carries the **opaque** pair, because that is the one state
   * every skin must be able to render and the one that costs nothing. Glass is
   * then an override applied on top by `theme/apply.ts`.
   *
   * Keeping it out of `vars` is what makes the setting mean something on every
   * skin: Editorial and Studio used to *define themselves* as opaque, so
   * turning glass on had no value left to change and the toggle did nothing.
   * Each skin now says how it frosts, rather than whether it can.
   */
  glass: { blur: string; alpha: string };
}

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif';

export const SKINS: Record<SkinId, Skin> = {
  /** Soft, translucent, generous. Leans on the artwork backdrop. */
  aurora: {
    id: "aurora",
    name: "Aurora Glass",
    vars: {
      "--radius": "1rem",
      "--radius-control": "0.625rem",
      "--radius-hero": "1.5rem",
      "--border-width": "1px",
      "--blur": "0px",
      "--surface-alpha": "100%",
      "--shadow-1": "0 1px 2px oklch(0 0 0 / 0.18), 0 8px 24px oklch(0 0 0 / 0.22)",
      "--shadow-2": "0 2px 8px oklch(0 0 0 / 0.22), 0 24px 64px oklch(0 0 0 / 0.32)",
      "--font-ui": SANS,
      "--font-display": SANS,
      "--label-transform": "none",
      "--label-spacing": "0em",
      "--motion-fast": "130ms",
      "--motion-slow": "280ms",
      "--focus-ring": "0 0 0 2px color-mix(in srgb, var(--brand) 65%, transparent)",
      ...SIGNATURE_OFF,
    },
    // The soft one: the most blur and the least surface, so the backdrop is
    // most of what you see.
    glass: { blur: "14px", alpha: "55%" },
  },

  /** Flat, high-contrast, typographic. Rules instead of shadows. */
  editorial: {
    id: "editorial",
    name: "Editorial",
    vars: {
      "--radius": "0.125rem",
      "--radius-control": "0.125rem",
      "--radius-hero": "0.25rem",
      "--border-width": "1px",
      "--blur": "0px",
      "--surface-alpha": "100%",
      "--shadow-1": "none",
      "--shadow-2": "none",
      "--font-ui": SANS,
      "--font-display": SERIF,
      "--label-transform": "uppercase",
      "--label-spacing": "0.09em",
      "--motion-fast": "80ms",
      "--motion-slow": "150ms",
      "--focus-ring": "0 0 0 2px var(--foreground)",
      ...SIGNATURE_OFF,
    },
    // Editorial is about hard edges and legible type, so it frosts tightly:
    // enough blur to read as glass, opaque enough that the rules stay crisp
    // and small text does not sit on a moving photograph.
    glass: { blur: "18px", alpha: "76%" },
  },

  /** Tactile and warm; shallow depth, like a piece of hi-fi hardware. */
  studio: {
    id: "studio",
    name: "Studio",
    vars: {
      "--radius": "0.625rem",
      "--radius-control": "0.5rem",
      "--radius-hero": "0.875rem",
      "--border-width": "1px",
      "--blur": "0px",
      "--surface-alpha": "100%",
      "--shadow-1":
        "inset 0 1px 0 oklch(1 0 0 / 0.06), 0 1px 3px oklch(0 0 0 / 0.28)",
      "--shadow-2":
        "inset 0 1px 0 oklch(1 0 0 / 0.08), 0 6px 20px oklch(0 0 0 / 0.34)",
      "--font-ui": SANS,
      "--font-display": SANS,
      "--label-transform": "none",
      "--label-spacing": "0.01em",
      "--motion-fast": "110ms",
      "--motion-slow": "220ms",
      "--focus-ring":
        "0 0 0 1px var(--background), 0 0 0 3px color-mix(in srgb, var(--brand) 70%, transparent)",
      ...SIGNATURE_OFF,
    },
    // Hardware has depth but not transparency; a moderate frost keeps the
    // inset highlights readable against it.
    glass: { blur: "20px", alpha: "68%" },
  },

  /**
   * Black glass. Hairlines instead of borders, weight instead of colour, and a
   * radius of exactly zero everywhere.
   *
   * The one skin that reaches past form into the two things a skin normally has
   * no say over — the artwork and the window frame — because both are what would
   * otherwise break it: a SoundCloud cover is the most saturated object on the
   * screen, and a system title bar is the one rectangle with rounded corners and
   * a gradient. Both go through tokens (`--art-filter`, `--chrome-*`) so the
   * other skins say "no" in the same vocabulary rather than by omission.
   */
  obsidian: {
    id: "obsidian",
    name: "Obsidian",
    vars: {
      // Zero, not "small". A 2px radius reads as a mistake; 0 reads as a
      // decision, and it is the mode's whole signature.
      "--radius": "0px",
      "--radius-control": "0px",
      "--radius-hero": "0px",
      // Including the things that are round everywhere else. A square avatar and
      // a rectangular slider handle are the mode's loudest tells.
      "--radius-round": "0px",
      "--border-width": "1px",
      "--blur": "0px",
      "--surface-alpha": "100%",
      // No shadows at all: depth is layers of translucency and hairlines. If an
      // element sinks into the page, strengthen its border — do not bring a
      // shadow back. The window's own drop shadow on the desktop is not part of
      // the interface and is not this.
      "--shadow-1": "none",
      "--shadow-2": "none",
      "--font-ui": SANS,
      // One typeface. The character comes from weight (200 headings against 600
      // micro-caps) and from tracking, which is cheaper and more consistent than
      // a second family the user may not have.
      "--font-display": SANS,
      "--label-transform": "uppercase",
      "--label-spacing": "0.17em",
      "--label-size": "0.5625rem",
      "--motion-fast": "90ms",
      "--motion-slow": "200ms",
      // A square ring with a gap: on black, a ring that touches the element
      // merges with its hairline border and stops reading as focus.
      "--focus-ring": "0 0 0 1px var(--background), 0 0 0 2px var(--foreground)",
      // The key token of the mode. Desaturate, then pull the level down and the
      // contrast up a hair, so a cover reads as texture rather than as a photo
      // someone drained.
      "--art-filter": "grayscale(1) brightness(0.82) contrast(1.06)",
      "--chrome-height": "32px",
      "--chrome-alpha": "2%",
      "--grain": "0.05",
      // Deliberately quieter than it wants to be. The light is what makes the
      // glass legible; past about 0.5 it stops being a reflection and becomes
      // wallpaper, and then the interface is competing with it.
      "--glow": "0.44",
      // With glass off the panels would otherwise be the palette's `surface` at
      // full strength, which is three times brighter than the frosted version of
      // the same colour. See the token's comment.
      "--surface-sink": "55%",
    },
    // The heaviest frost of any skin, over the least surface. It can afford both
    // because the palette under it is black: 26% of a near-black card is about
    // 2% of white, which is the "panel is barely lighter than the page" the mode
    // is built on, and the blur is what keeps that from reading as flat.
    glass: { blur: "30px", alpha: "26%" },
  },
};

export const SKIN_IDS = Object.keys(SKINS) as SkinId[];
