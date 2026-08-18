import type { LayoutId } from "./layout";
import { SIGNATURE_OFF, type SkinVars } from "./tokens";

/**
 * Skins control *form* only — never colour. Swapping a skin must leave the
 * palette intact and vice versa; that orthogonality is the whole point.
 *
 * Fonts were system stacks throughout, on the rule that the app ships no font
 * files. The rule has one exception now: the app has a face of its own, Onest
 * and JetBrains Mono, self-hosted and subset (see `styles/fonts.css`). Both are
 * still reached through `--font-ui` / `--font-display` / `--font-mono`, so a
 * user who names a typeface in Settings overrides them exactly as before, and
 * the three skins that are not the app's own look keep the system stack.
 */

export type SkinId = "one" | "nit" | "editorial" | "studio" | "obsidian";

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
  /**
   * The navigation arrangements this skin is drawn for. Absent means all of
   * them, which is what a skin that is only form should say. See `theme/layout`.
   */
  layouts?: LayoutId[];
  /**
   * Whether this skin draws playback as the thread — the track's waveform along
   * the top edge of the window — instead of a seek bar in the player.
   *
   * A property of the skin rather than a setting, because it is not two ways of
   * showing the same thing: the thread replaces the seek bar, carries the marks
   * and takes a row of the window frame. A skin that has not been drawn around
   * that would get both, which is the app disagreeing with itself about where
   * time lives. The skin's own stylesheet is what hides `[data-seekbar]`, and
   * this is what stops the strip being mounted at all.
   */
  thread?: boolean;
}

const SANS =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif';
const MONO =
  'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

/** The app's own pair. Self-hosted; the stacks above are the fallback. */
const NIT_SANS = `Onest, ${SANS}`;
const NIT_MONO = `"JetBrains Mono", ${MONO}`;

export const SKINS: Record<SkinId, Skin> = {
  /**
   * One — the app's only look, and what everything else is being folded into.
   *
   * The app had five appearances (four skins and Apple mode) across twelve
   * screens: sixty places for the same button to be drawn two different ways,
   * which is exactly what happened, over and over. This is the answer to that,
   * and the argument for it is not taste — it is that a look nobody has to
   * maintain in five parallel copies is a look that can actually be finished.
   *
   * The form, and why each number is what it is:
   *
   *   - **One radius family, three sizes, all soft.** 10 / 14 / 20. Not the 2px
   *     of Nit (a statement that has to be defended on every screen) and not
   *     Apple's 28 (which is Apple's). Soft enough to feel current, small
   *     enough that a dense list does not turn into a bag of pills.
   *   - **Controls are rounder than containers, not capsules.** A pill for
   *     everything you can press is Nit's device and it fights a list; 8px on a
   *     control inside a 14px card is the concentric relationship every
   *     well-drawn interface has.
   *   - **Depth is one soft shadow, no rim, no glass by default.** Frost is the
   *     single most expensive thing to paint and the first to look cheap when
   *     it is everywhere. It stays available as the `glass` opt-in.
   *   - **Motion is fast and short.** 130/240ms. Long easings feel luxurious in
   *     a demo and slow in an app you use for six hours.
   *
   * The typeface is the app's own — the same one Nit shipped and the other
   * three skins declined. There is no reason to ship two faces and use the
   * system's.
   */
  one: {
    id: "one",
    name: "One",
    vars: {
      "--radius": "0.875rem",
      "--radius-control": "0.625rem",
      "--radius-hero": "1.25rem",
      "--border-width": "1px",
      "--blur": "24px",
      "--surface-alpha": "100%",
      // One shadow, two depths. No inset highlight: a rim on every surface is
      // how an interface starts to look like a pile of stickers.
      "--shadow-1": "0 1px 2px oklch(0 0 0 / 0.20), 0 4px 12px oklch(0 0 0 / 0.14)",
      "--shadow-2": "0 2px 6px oklch(0 0 0 / 0.24), 0 16px 40px oklch(0 0 0 / 0.28)",
      "--font-ui": NIT_SANS,
      "--font-display": NIT_SANS,
      "--font-mono": NIT_MONO,
      "--label-transform": "none",
      "--label-spacing": "0",
      "--motion-fast": "130ms",
      "--motion-slow": "240ms",
      "--focus-ring":
        "0 0 0 2px var(--background), 0 0 0 4px color-mix(in srgb, var(--brand) 65%, transparent)",
      ...SIGNATURE_OFF,
    },
    glass: { blur: "24px", alpha: "72%" },
  },


  /**
   * The app's own look, and the default.
   *
   * Two radii and nothing between them: `2px` for anything that holds content —
   * cards, covers, panels — and a full `999px` for anything you operate. The
   * contrast between the square and the round *is* the rhythm; a skin where
   * everything meets in the middle at 8px is the one thing this is not. No
   * shadows anywhere: depth is a hairline and a change of fill.
   *
   * It reaches past form in the two places a look has to — the typeface, which
   * is the app's own rather than the system's, and cover art, which is printed
   * in two inks. Both go through tokens, so the other three skins say "no" in
   * the same vocabulary instead of by omission.
   */
  nit: {
    id: "nit",
    name: "Nit",
    vars: {
      // Not zero — that is Obsidian's, and it is a different statement. 2px is a
      // corner that has been cut rather than one that was never drawn.
      "--radius": "2px",
      // Everything you can operate is a pill, at every size. The single loudest
      // thing about the look, and the reason the 2px reads as deliberate.
      "--radius-control": "999px",
      "--radius-hero": "2px",
      "--radius-round": "999px",
      "--border-width": "1px",
      "--blur": "0px",
      "--surface-alpha": "100%",
      // None, anywhere. A border is how a surface says where it ends.
      "--shadow-1": "none",
      "--shadow-2": "none",
      "--font-ui": NIT_SANS,
      "--font-display": NIT_SANS,
      "--font-mono": NIT_MONO,
      "--label-transform": "uppercase",
      "--label-spacing": "0.1em",
      "--label-size": "0.625rem",
      "--motion-fast": "110ms",
      "--motion-slow": "260ms",
      "--focus-ring": "0 0 0 2px var(--brand)",
      // Take the colour out; `.art-frame::after` puts two inks back. The
      // contrast and the half-stop down are what stop a two-ink print from
      // collapsing into one flat midtone.
      "--art-filter": "grayscale(1) contrast(1.18) brightness(0.95)",
      "--art-duotone-from": "var(--brand-2)",
      "--art-duotone-to": "var(--brand)",
      // Three would be a glitch effect. Two is a press that moved.
      "--print-offset": "2px",
      "--grain": "0",
      "--glow": "0",
      "--surface-sink": "0%",
    },
    // Frosts lightly and keeps its hairlines: the look is flat ink on paper, and
    // a heavy blur under 1px borders turns them into smudges.
    glass: { blur: "16px", alpha: "72%" },
    // No sidebar. The nav here is an 88px column of icons with micro-caps under
    // them and the keyboard hint at its foot; the sidebar is a 240px panel with
    // a playlist index inside it, which is a different architecture rather than
    // a wider version of the same one, and this look has no drawing for it.
    layouts: ["rail", "top"],
    // The look the thread was drawn for, and the only one that gives up its seek
    // bar for it.
    thread: true,
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
      "--font-mono": MONO,
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
      "--font-mono": MONO,
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
      "--font-mono": MONO,
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
      // Grey is the whole point here; a second ink would be a different mode.
      "--art-duotone-from": "transparent",
      "--art-duotone-to": "transparent",
      // Headings carry their hierarchy in weight — 200 against 600 — and a
      // coloured copy behind a 200-weight stroke is a smudge.
      "--print-offset": "0px",
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

/**
 * Skins that belong to a built-in look rather than standing on their own.
 *
 * Obsidian was listed twice — once as a look in "Ready-made looks" and again as
 * a skin below it — while Apple, which is the same kind of thing, appeared only
 * in the first. Two lists disagreeing about what the app's modes are is worse
 * than either list alone, so the skin picker now offers only the skins that are
 * *just* form, and Obsidian is reached the way Apple is: by choosing the look.
 *
 * Nit joins it for the same reason and not because it is the default: it brings
 * a typeface and an artwork treatment, which is more than form, and offering it
 * twice would put the app's own look in two lists that can disagree.
 *
 * Both stay perfectly ordinary `SkinId`s — a preset selects one, saved themes
 * carry it, `SKIN_IDS` still covers it, and `SettingsView` still shows it in the
 * picker while it is the current skin, so the section is never a list with
 * nothing selected in it.
 */
export const MODE_SKIN_IDS: SkinId[] = ["nit", "obsidian"];

/** The skins the picker offers on their own. */
export const PICKABLE_SKIN_IDS = SKIN_IDS.filter(
  (id) => !MODE_SKIN_IDS.includes(id),
);
