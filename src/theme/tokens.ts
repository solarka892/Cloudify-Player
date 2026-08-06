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
  /**
   * Things that are round rather than rounded: avatars, badges, slider handles,
   * the play button.
   *
   * A separate token because "as round as it goes" is not a size — it is a
   * shape, and collapsing it onto `--radius-control` would make an avatar a
   * 10px-cornered square in Aurora, which is nobody's idea of an avatar. Every
   * skin but one keeps it at `9999px`; Obsidian takes it to `0`, and a square
   * avatar is the single loudest thing about the mode.
   */
  "--radius-round": string;
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
  /**
   * Section-label size.
   *
   * A skin that tracks its labels out to 0.17em also has to shrink them, or the
   * two together read as a headline rather than as a caption. The other skins
   * keep the size they always had, so this is a token they set rather than one
   * that changes them.
   */
  "--label-size": string;
  "--motion-fast": string;
  "--motion-slow": string;
  /**
   * Filter applied to every piece of cover art in the app.
   *
   * Artwork is the one thing in the interface the app does not author, so a skin
   * that rules out colour has to say what happens to it — otherwise a SoundCloud
   * cover is the brightest, most saturated object on a monochrome screen. `none`
   * everywhere else: this is opt-in, not a correction.
   */
  "--art-filter": string;
  /** Height of the app's own title bar. `0px` disables the row entirely. */
  "--chrome-height": string;
  /** Title-bar surface opacity as a percentage of white over the page. */
  "--chrome-alpha": string;
  /**
   * The focus indicator, as a `box-shadow` value.
   *
   * A shadow rather than an `outline` because a skin with square corners wants a
   * ring that follows the element's radius, and `outline` does not offer one
   * that also carries an inner gap.
   */
  "--focus-ring": string;
  /**
   * Opacity of the film of grain over the window, 0..1.
   *
   * True black on an LCD reads as a hole rather than as a surface; a few percent
   * of noise gives it a matte texture. `0` in every skin that does not ask.
   */
  "--grain": string;
  /**
   * Opacity of the skin's ambient light layer, 0..1.
   *
   * `0` hides it; the layer itself is `display: none` unless a skin turns it on,
   * so this is the dimmer, not the switch — see `--glow` in `globals.css`.
   */
  "--glow": string;
  /**
   * How far an *opaque* panel sinks toward the page background, as a percentage.
   *
   * Only meaningful with glass off, when `--surface-alpha` is forced to 100%: a
   * palette whose surfaces are tuned to be barely visible *through* 26% of
   * translucency is far too light at full strength. Rather than give the skin a
   * second set of colours — which it is not allowed to have — it says how far to
   * pull the surface back toward the page, and the palette underneath still
   * decides what both of those colours are. `0%` leaves panels exactly as the
   * palette drew them, which is what every skin but Obsidian wants.
   */
  "--surface-sink": string;
}

/**
 * The Obsidian-specific axes, in their off state.
 *
 * Every skin has to answer for these, and all but one answers "nothing". Spelling
 * that out beats letting the properties go missing: `applyTheme` only removes a
 * property it is given as an empty string, so a skin silent about `--art-filter`
 * would inherit Obsidian's greyscale from whatever was on `<html>` before it.
 *
 * `--focus-ring` is not here — every skin has an opinion about its own.
 */
export const SIGNATURE_OFF: Pick<
  SkinVars,
  | "--radius-round"
  | "--label-size"
  | "--art-filter"
  | "--chrome-height"
  | "--chrome-alpha"
  | "--grain"
  | "--glow"
  | "--surface-sink"
> = {
  "--radius-round": "9999px",
  "--label-size": "0.6875rem",
  // The app's own title bar is a window-level feature, not a skin's, so its
  // height is the same in all of them; only its finish differs.
  "--chrome-height": "32px",
  "--chrome-alpha": "6%",
  "--art-filter": "none",
  "--grain": "0",
  "--glow": "0",
  "--surface-sink": "0%",
};

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
