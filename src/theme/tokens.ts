/**
 * The theming contract.
 *
 * Nothing in the UI hardcodes a colour, radius, blur or duration — every
 * component reads CSS custom properties, and this module defines what those
 * properties are. That is what makes skin / palette / layout independently
 * switchable at runtime, and what makes a user-authored theme just a bag of
 * these values.
 *
 * Three layers, applied in order onto `<html>`:
 *   1. palette — colour only  (`Shade` → `shadeToVars`)
 *   2. skin    — form only    (radius, blur, shadow, type, motion)
 *   3. overrides — whatever the user changed by hand, wins over both
 */

/**
 * The handful of colours a palette actually specifies. Every colour token the
 * UI uses is derived from these eight, so a new palette is eight values rather
 * than twenty, and derived tokens can never drift out of sync.
 */
export interface Shade {
  /** Page background. */
  bg: string;
  /** Cards, panels, the player bar. */
  surface: string;
  /** Hover states, inputs, secondary fills. */
  surface2: string;
  text: string;
  /** De-emphasised text. */
  muted: string;
  /** Borders and dividers; may be translucent. */
  line: string;
  /** Accent, and its gradient partner. */
  brand: string;
  brand2: string;
}

/** Expand a palette into the full set of colour custom properties. */
export function shadeToVars(s: Shade): Record<string, string> {
  return {
    "--background": s.bg,
    "--foreground": s.text,
    "--card": s.surface,
    "--card-foreground": s.text,
    "--popover": s.surface,
    "--popover-foreground": s.text,
    // `primary` is the high-contrast fill (play button): inverted against the page.
    "--primary": s.text,
    "--primary-foreground": s.bg,
    "--secondary": s.surface2,
    "--secondary-foreground": s.text,
    "--muted": s.surface2,
    "--muted-foreground": s.muted,
    "--accent": s.surface2,
    "--accent-foreground": s.text,
    "--border": s.line,
    "--input": s.line,
    "--ring": s.muted,
    "--brand": s.brand,
    "--brand-2": s.brand2,
  };
}

/** Form tokens — everything a skin controls. */
export interface SkinVars {
  /** Card / panel corner radius. */
  "--radius": string;
  /** Controls: buttons, inputs. */
  "--radius-control": string;
  /** Hero blocks, artwork tiles. */
  "--radius-hero": string;
  "--border-width": string;
  /** Backdrop blur behind panels; `0px` for opaque skins. */
  "--blur": string;
  /** Panel opacity as a percentage string, e.g. `"55%"`. */
  "--surface-alpha": string;
  "--shadow-1": string;
  "--shadow-2": string;
  "--font-ui": string;
  "--font-display": string;
  /** Section labels: `none` or `uppercase`. */
  "--label-transform": string;
  "--label-spacing": string;
  "--motion-fast": string;
  "--motion-slow": string;
}

/** Layout tokens — density, scale. Driven by user settings, not by the skin. */
export interface MetricVars {
  /** Multiplier on vertical rhythm: compact 0.85 → spacious 1.15. */
  "--density": string;
  /** Root font size; drives the whole UI scale. */
  "--ui-scale": string;
}

/** Background-layer tokens. */
export interface BackdropVars {
  "--backdrop-image": string;
  "--backdrop-blur": string;
  "--backdrop-dim": string;
  "--backdrop-saturate": string;
}

/**
 * Every property a saved theme may carry. A user theme is exactly this — a
 * partial map of CSS custom property names to values — which is why themes
 * export cleanly to JSON and survive skin or palette changes underneath them.
 */
export type ThemeVars = Partial<
  Record<keyof SkinVars | keyof MetricVars | keyof BackdropVars | string, string>
>;
