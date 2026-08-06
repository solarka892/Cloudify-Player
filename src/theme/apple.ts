import { isApplePlatform } from "@/lib/platform";
import { SIGNATURE_OFF, type Shade, type SkinVars, type ThemeVars } from "./tokens";

/**
 * Apple mode, as values.
 *
 * The rest of the app's appearance is composed from a palette (colour) and a
 * skin (form) that the user picks independently. Apple mode is neither: it is a
 * whole design language, so it replaces both layers at once, adds a set of
 * `--ios-*` properties that only `styles/apple.css` reads, and swaps the shell
 * and the player for `features/apple/`.
 *
 * The target is iOS 26 / iPadOS 26 / macOS 26 Tahoe — Liquid Glass. Two things
 * separate that from the frosted panels every other app calls glass, and both
 * are why the numbers here look the way they do:
 *
 *   1. **The glass is transparent, not frosted.** A Liquid Glass surface is a
 *      lens: you read the wallpaper's colour and shape straight through it. The
 *      tints below are around 40% opaque, roughly half of what a legible
 *      "frosted" panel needs, and legibility is bought back with saturation and
 *      a brightness lift instead of with opacity.
 *   2. **The edge does the work.** Real glass compresses and brightens what is
 *      behind it at the rim, throws a specular highlight where the light is,
 *      and disperses a little colour on the way out. Those three are what the
 *      eye reads as glass; the blur alone reads as a screenshot with a filter.
 *
 * Every number here is Apple's or measured off Apple's own material. The
 * colours are the iOS system palette from the Human Interface Guidelines, the
 * radii are the iOS 26 ones (much larger than iOS 18's — capsules and 20-28pt
 * cards), and the durations are UIKit's. The motion curve is a real spring
 * rather than a bezier that looks a bit like one, but it lives in
 * `styles/apple.css`: it is a sampled `linear()` easing, which needs a
 * `@supports` fallback that a custom property written from here could not give
 * it.
 */

/** Dark mode: black page, elevated greys, high-contrast labels. */
export const APPLE_DARK: Shade = {
  // systemGroupedBackground (dark) is pure black — the OLED look, and what
  // Music, Settings and every grouped list actually sit on.
  bg: "rgb(0 0 0)",
  // secondarySystemGroupedBackground: what a card or list is filled with.
  surface: "rgb(28 28 30)",
  // tertiarySystemGroupedBackground: the row under a pressed finger.
  surface2: "rgb(44 44 46)",
  text: "rgb(255 255 255)",
  // secondaryLabel — a tinted white, not a grey. iOS never uses flat grey text.
  muted: "rgb(235 235 245 / 0.6)",
  // separator (dark), which is translucent so it darkens whatever is under it.
  line: "rgb(84 84 88 / 0.65)",
  brand: "rgb(10 132 255)", // systemBlue, dark
  brand2: "rgb(94 92 230)", // systemIndigo, dark
};

/** Light mode: the grey grouped background with white cards on top. */
export const APPLE_LIGHT: Shade = {
  bg: "rgb(242 242 247)", // systemGroupedBackground
  surface: "rgb(255 255 255)",
  surface2: "rgb(242 242 247)",
  text: "rgb(0 0 0)",
  muted: "rgb(60 60 67 / 0.6)", // secondaryLabel
  line: "rgb(60 60 67 / 0.29)", // separator
  brand: "rgb(0 122 255)", // systemBlue
  brand2: "rgb(88 86 214)", // systemIndigo
};

/**
 * San Francisco, then the closest thing the machine has.
 *
 * ⚠️ The order of the first two entries is the whole reason this is a computed
 * string and not a constant, and getting it wrong silently defeats the mode.
 *
 * `-apple-system` is not inert off Apple hardware. *Every* WebKit port honours
 * it, and off a Mac it resolves to the desktop's system font — Noto Sans on a
 * typical Linux box, Cantarell on GNOME. So naming it before the real families
 * short-circuits the stack there: the browser matches it, stops, and every
 * later entry, Inter included, is never consulted. That is exactly what made
 * the mode render in the same face as the skin it replaced even with Inter
 * installed.
 *
 * Off Apple platforms it therefore goes to the *tail*, behind Inter — which is
 * the fallback worth having, drawn as a screen face on SF's proportions, close
 * enough at UI sizes that only the `a` and the `t` give it away. On Apple
 * platforms it goes first, because there it is the genuine article and the
 * system font is deliberately not reachable by family name.
 *
 * The app ships no font files (see CLAUDE.md), so the tail matters: Helvetica
 * and Arial land on Liberation Sans through fontconfig, which is a grotesque
 * like SF rather than the humanist face `system-ui` would give.
 */
const APPLE_FIRST = "-apple-system, BlinkMacSystemFont";
const NAMED_SF = '"SF Pro Text", "SF Pro Display", "SF Pro"';
const NEAR_SF = '"Inter Variable", "Inter", "Inter Display"';
const LAST_RESORT =
  '"Segoe UI Variable Text", "Helvetica Neue", "Helvetica", "Arial", system-ui, sans-serif';

const SF = isApplePlatform
  ? `${APPLE_FIRST}, ${NAMED_SF}, ${NEAR_SF}, ${LAST_RESORT}`
  : `${NAMED_SF}, ${NEAR_SF}, ${APPLE_FIRST}, ${LAST_RESORT}`;

/**
 * The display cut, for headings.
 *
 * SF is two families, not one: Text is spaced for reading at body sizes, Display
 * is tighter and its terminals are cut closer, and Apple switches between them
 * at 20pt. Inter ships the same pair — `Inter` and `Inter Display` — so the
 * distinction survives the substitution, which is most of why a heading in this
 * mode looks set rather than scaled.
 */
const DISPLAY_FIRST = '"SF Pro Display", "Inter Display"';

const SF_DISPLAY = isApplePlatform
  ? `${APPLE_FIRST}, ${DISPLAY_FIRST}, ${NEAR_SF}, ${LAST_RESORT}`
  : `${DISPLAY_FIRST}, ${NEAR_SF}, ${APPLE_FIRST}, ${LAST_RESORT}`;

/**
 * Form: what a skin would normally provide.
 *
 * iOS 26 rounded everything off. A control is a capsule, a card is 20pt, a
 * sheet 28 — and nested shapes are concentric, so a control inside a card has
 * the card's radius less its inset rather than an unrelated smaller number.
 */
export const APPLE_SKIN: SkinVars = {
  // The iOS 26 card / grouped-list container radius.
  "--radius": "1.25rem",
  // Controls: a chip, a field, a small button. Bigger things go to capsules.
  "--radius-control": "0.75rem",
  // Sheets, floating chrome and large artwork.
  "--radius-hero": "1.75rem",
  // A hairline is one device pixel, not one CSS pixel.
  "--border-width": "0.5px",
  "--blur": "32px",
  // Well under the ~70% a frosted panel needs: this is a lens, not a scrim.
  "--surface-alpha": "42%",
  // Apple's shadows are wide, soft and nearly black, with no visible spread.
  "--shadow-1": "0 1px 2px rgb(0 0 0 / 0.08), 0 8px 24px rgb(0 0 0 / 0.10)",
  "--shadow-2": "0 2px 8px rgb(0 0 0 / 0.12), 0 24px 60px rgb(0 0 0 / 0.22)",
  "--font-ui": SF,
  "--font-display": SF_DISPLAY,
  // iOS does not shout its section headings.
  "--label-transform": "none",
  // SF tightens as it grows; this is the tracking for body text.
  "--label-spacing": "-0.01em",
  "--motion-fast": "220ms",
  "--motion-slow": "420ms",
  // iOS focus is a soft halo in the tint colour, not a hard rectangle.
  "--focus-ring": "0 0 0 4px color-mix(in srgb, var(--brand) 30%, transparent)",
  // The mode replaces the skin wholesale, so it has to answer for the axes a
  // skin owns even where its answer is "as everyone else". Leaving them out
  // would strand Obsidian's values on the document when switching modes.
  ...SIGNATURE_OFF,
};

/**
 * The `--ios-*` layer: everything `apple.css` needs that no skin would ever
 * have a reason to define. Split by appearance because most of these are
 * translucent, and a fill that reads correctly on black is wrong on white.
 */
function extras(dark: boolean): Record<string, string> {
  return {
    /* System colours that aren't the accent. */
    "--ios-blue": dark ? "rgb(10 132 255)" : "rgb(0 122 255)",
    "--ios-green": dark ? "rgb(48 209 88)" : "rgb(52 199 89)",
    "--ios-red": dark ? "rgb(255 69 58)" : "rgb(255 59 48)",
    "--ios-orange": dark ? "rgb(255 159 10)" : "rgb(255 149 0)",
    "--ios-pink": dark ? "rgb(255 55 95)" : "rgb(255 45 85)",

    /* Label hierarchy. iOS has four levels and uses all of them. */
    "--ios-label-2": dark ? "rgb(235 235 245 / 0.6)" : "rgb(60 60 67 / 0.6)",
    "--ios-label-3": dark ? "rgb(235 235 245 / 0.3)" : "rgb(60 60 67 / 0.3)",
    "--ios-label-4": dark ? "rgb(235 235 245 / 0.18)" : "rgb(60 60 67 / 0.18)",

    /* Fills: the grey behind a segmented control, a slider track, a chip. */
    "--ios-fill-1": dark ? "rgb(120 120 128 / 0.36)" : "rgb(120 120 128 / 0.2)",
    "--ios-fill-2": dark ? "rgb(120 120 128 / 0.32)" : "rgb(120 120 128 / 0.16)",
    "--ios-fill-3": dark ? "rgb(118 118 128 / 0.24)" : "rgb(118 118 128 / 0.12)",

    "--ios-separator": dark ? "rgb(84 84 88 / 0.65)" : "rgb(60 60 67 / 0.29)",
    "--ios-separator-opaque": dark ? "rgb(56 56 58)" : "rgb(198 198 200)",

    /* Page and card backgrounds, for surfaces that must stay opaque. */
    "--ios-bg": dark ? "rgb(0 0 0)" : "rgb(242 242 247)",
    "--ios-surface": dark ? "rgb(28 28 30)" : "rgb(255 255 255)",
    "--ios-surface-2": dark ? "rgb(44 44 46)" : "rgb(242 242 247)",
    /* Elevated variants — what a sheet uses, one step lighter than the page. */
    "--ios-elevated": dark ? "rgb(28 28 30)" : "rgb(255 255 255)",

    /* ── Liquid Glass ────────────────────────────────────────────────────
     *
     * The material, in the four parts the eye actually reads:
     *
     *   tint       what little colour the glass itself has
     *   lens       the compressed, brightened band at the rim
     *   specular   the highlight where the light source is
     *   dispersion the colour that splits on the way out
     *
     * `apple.css` composes them; these are the amounts. */

    /* Tint. Deliberately thin — a Liquid Glass panel is see-through, and the
       numbers a "frosted" panel needs (70%+) are what make every web
       imitation look like a fogged window instead.

       Light glass carries a little more than dark, and for a reason that is not
       symmetry: light glass *lightens* what is behind it, so over an already
       pale backdrop the only thing separating it from the page is how much it
       lightens. Dark glass darkens, and a dark page gives it plenty to work
       against. */
    "--ios-glass-tint": dark
      ? "rgb(30 30 32 / 0.44)"
      : "rgb(255 255 255 / 0.46)",
    /* Chrome that carries controls over moving content needs more body. */
    "--ios-glass-tint-strong": dark
      ? "rgb(24 24 26 / 0.62)"
      : "rgb(255 255 255 / 0.6)",

    /* The rim, as one even hairline.
     *
     * Not two offset ones. An inset shadow carrying an offset does not shift
     * the ring, it shifts the *shadow*, so at a 28pt corner the lit side piles
     * up into a bright crescent and the far side opens a gap — which is
     * exactly the white speck that shows in the corners of every hand-rolled
     * glass panel on the web. Direction is the specular pair's job below;
     * the edge itself is uniform.
     *
     * And it is *dark* in light mode, not white. This is the one that had light
     * mode looking like flat panels with no material at all: a white hairline
     * is what defines glass against a dark page, but against a pale one it is
     * invisible, and so was every edge in the interface. Apple's light glass is
     * bounded by a faint dark line with the white highlight sitting *inside*
     * it — `inner`, below — which is what reads as a bright bevel on a light
     * surface.
     *
     * `inner` is the band just inside the rim where a lens gathers light, and
     * it is the single cue that most makes the surface look thick rather than
     * printed on. Blurred and inset with a negative spread, so it has no
     * corners to pile up in. */
    "--ios-glass-rim": dark
      ? "rgb(255 255 255 / 0.2)"
      : "rgb(0 0 0 / 0.12)",
    "--ios-glass-rim-inner": dark
      ? "rgb(255 255 255 / 0.16)"
      : "rgb(255 255 255 / 0.55)",

    /* Specular: the main highlight, and the smaller glint opposite it. */
    "--ios-glass-sheen": dark
      ? "rgb(255 255 255 / 0.14)"
      : "rgb(255 255 255 / 0.55)",
    "--ios-glass-glint": dark
      ? "rgb(255 255 255 / 0.07)"
      : "rgb(255 255 255 / 0.28)",

    /* Dispersion: white split towards the ends of the visible spectrum. Kept
       far below the threshold of "rainbow" — at these alphas it registers as
       the edge being made of something, not as a colour effect. */
    "--ios-glass-spectrum-warm": "rgb(255 214 170 / 0.5)",
    "--ios-glass-spectrum-cool": "rgb(170 214 255 / 0.5)",

    /* Light mode leans on the shadow harder, for the same reason the rim went
       dark: separation from a pale page has to come from somewhere. */
    "--ios-glass-shadow": dark
      ? "0 8px 32px rgb(0 0 0 / 0.44), 0 2px 8px rgb(0 0 0 / 0.3)"
      : "0 10px 36px rgb(0 0 0 / 0.2), 0 2px 8px rgb(0 0 0 / 0.12)",

    /* How hard the material works on what is behind it. The saturation boost
       is what keeps a wallpaper's colour readable through the tint, and it does
       not vary by appearance; the brightness lift does, because dark glass has
       to climb away from black while light glass is already near the top. */
    "--ios-glass-saturate": "180%",
    "--ios-glass-brightness": dark ? "1.12" : "1.04",
    /* Contrast, which only light glass needs. Pushing brightness up under a
       white tint walks the backdrop *towards* the tint and the two dissolve
       into each other — which is the other half of why light mode read as
       flat. A contrast lift keeps the shapes behind legible through it, and
       that is the difference between a lens and tracing paper. */
    "--ios-glass-contrast": dark ? "1" : "1.08",
    /* The lens rim works the backdrop harder still, over a 1px blur, which is
       what compresses it. */
    "--ios-lens-brightness": dark ? "1.5" : "1.22",
    "--ios-lens-saturate": "220%",
    "--ios-lens-width": "2.5px",

    "--ios-blur-nav": "28px",
    "--ios-blur-panel": "36px",

    /* Opaque stand-ins, used when transparency is turned off. */
    "--ios-glass-solid": dark ? "rgb(28 28 30)" : "rgb(249 249 249)",

    /* ── Controls ────────────────────────────────────────────────────────
     *
     * A switch knob is white in both appearances — iOS never darkens it — and
     * it is lifted off the track by a shadow rather than a border. The
     * selected segment of a segmented control is the one place that differs:
     * white on light, systemGray2 on dark, because a white segment on a dark
     * track would out-shout the label on it. */
    "--ios-knob": "rgb(255 255 255)",
    "--ios-knob-shadow":
      "0 1px 3px rgb(0 0 0 / 0.22), 0 0 0 0.5px rgb(0 0 0 / 0.04)",
    "--ios-segment": dark ? "rgb(99 99 102)" : "rgb(255 255 255)",

    /* A sheet or a menu laid over the app: wider and darker than a card's. */
    "--ios-sheet-shadow": dark
      ? "0 20px 60px rgb(0 0 0 / 0.6)"
      : "0 20px 60px rgb(0 0 0 / 0.22)",
  };
}

/** Everything Apple mode writes, so turning it off can clear all of it. */
export const APPLE_VAR_NAMES: string[] = Object.keys(extras(true));

/** The form + `--ios-*` half of the theme. Colour comes from the shades above. */
export function appleVars(dark: boolean): ThemeVars {
  return { ...APPLE_SKIN, ...extras(dark) };
}

/** Same keys, blank, so `applyTheme` removes them when the mode is switched off. */
export function blankAppleVars(): ThemeVars {
  return Object.fromEntries(APPLE_VAR_NAMES.map((name) => [name, ""]));
}
