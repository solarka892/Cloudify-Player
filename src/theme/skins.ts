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
  name: string;
  hint: string;
  vars: SkinVars;
}

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif';

export const SKINS: Record<SkinId, Skin> = {
  /** Soft, translucent, generous. Leans on the artwork backdrop. */
  aurora: {
    id: "aurora",
    name: "Aurora Glass",
    hint: "Стекло, размытие, мягкое свечение",
    vars: {
      "--radius": "1rem",
      "--radius-control": "0.625rem",
      "--radius-hero": "1.5rem",
      "--border-width": "1px",
      "--blur": "14px",
      "--surface-alpha": "55%",
      "--shadow-1": "0 1px 2px oklch(0 0 0 / 0.18), 0 8px 24px oklch(0 0 0 / 0.22)",
      "--shadow-2": "0 2px 8px oklch(0 0 0 / 0.22), 0 24px 64px oklch(0 0 0 / 0.32)",
      "--font-ui": SANS,
      "--font-display": SANS,
      "--label-transform": "none",
      "--label-spacing": "0em",
      "--motion-fast": "130ms",
      "--motion-slow": "280ms",
    },
  },

  /** Flat, high-contrast, typographic. Rules instead of shadows. */
  editorial: {
    id: "editorial",
    name: "Editorial",
    hint: "Крупная типографика, жёсткие линии, без теней",
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
  },

  /** Tactile and warm; shallow depth, like a piece of hi-fi hardware. */
  studio: {
    id: "studio",
    name: "Studio",
    hint: "Тактильные контролы, аккуратная глубина, волна",
    vars: {
      "--radius": "0.625rem",
      "--radius-control": "0.5rem",
      "--radius-hero": "0.875rem",
      "--border-width": "1px",
      "--blur": "8px",
      "--surface-alpha": "92%",
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
  },
};

export const SKIN_IDS = Object.keys(SKINS) as SkinId[];
