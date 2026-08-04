import type { SkinVars } from "./tokens";

/**
 * Skins control *form* only — never colour. Swapping a skin must leave the
 * palette intact and vice versa; that orthogonality is the whole point.
 *
 * Fonts are system stacks on purpose: the app ships no font files, and a
 * user who wants a specific typeface sets it in Settings (their machine, their
 * fonts).
 */

export type SkinId = "aurora" | "editorial" | "studio";

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
    },
    // Hardware has depth but not transparency; a moderate frost keeps the
    // inset highlights readable against it.
    glass: { blur: "20px", alpha: "68%" },
  },
};

export const SKIN_IDS = Object.keys(SKINS) as SkinId[];
