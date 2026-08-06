import { PALETTES, ACCENTS, type PaletteId } from "./palettes";
import { SKINS, type SkinId } from "./skins";
import { THEME_EVENT } from "./particles";
import { appleVars, blankAppleVars } from "./apple";
import { foregroundFor } from "./contrast";
import { shadeToVars, type ThemeVars } from "./tokens";

/**
 * Composes the active theme and writes it to `<html>`.
 *
 * Everything visual funnels through this one function, in a fixed order —
 * palette, then skin, then metrics, then backdrop, then the user's hand edits
 * last so they always win. Components never re-render for a theme change; the
 * custom properties update underneath them.
 */

export type ThemeMode = "dark" | "light" | "system";
export type Density = "compact" | "cozy" | "spacious";

export interface ThemeInput {
  mode: ThemeMode;
  palette: PaletteId;
  skin: SkinId;
  /** Accent preset id, or `null` to keep the palette's own accent. */
  accent: string | null;
  density: Density;
  /** UI scale as a percentage, 80–140. */
  uiScale: number;
  /**
   * Frosted translucency. Off makes panels opaque and drops every
   * `backdrop-filter`, which is the single biggest rendering cost on a
   * software-composited desktop.
   */
  glass: boolean;
  /**
   * Apple mode: a whole design language rather than a skin, so it replaces the
   * skin, the shell and the player, and switches `styles/apple.css` on. Colour
   * is not its to replace — it selects the `apple` palette on the way in and
   * leaves the picker working. See `theme/apple.ts`.
   */
  apple: boolean;
  /**
   * iOS Accessibility → Reduce Transparency, the same way round as Apple has
   * it: on means the glass is glass. Off makes every vibrant surface opaque,
   * which is also the cheap path on a software-composited desktop.
   */
  appleTransparency: boolean;
  /**
   * Whether cover art is reduced to one tone.
   *
   * A setting rather than part of the skin because it is the one piece of
   * Obsidian people reasonably disagree with — the covers are the only place
   * their library's own colour appears. Off simply blanks `--art-filter`; nothing
   * else in the interface changes, the wallpaper included.
   */
  monoArtwork: boolean;
  /** Per-property overrides authored by the user; applied last. */
  overrides: ThemeVars;
}

const DENSITY_SCALE: Record<Density, string> = {
  compact: "0.85",
  cozy: "1",
  spacious: "1.18",
};

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && prefersDark());
}

/** Build the full property map for a theme, without touching the DOM. */
export function buildVars(input: ThemeInput): ThemeVars {
  const dark = resolveDark(input.mode);
  const palette = PALETTES[input.palette] ?? PALETTES.midnight;
  const skin = SKINS[input.skin] ?? SKINS.aurora;

  // Apple mode owns *form*, not colour. Its own palette is an ordinary entry in
  // `PALETTES` that the mode selects on the way in, so the picker keeps working
  // while it is on and the shade below is whatever the user is actually on.
  //
  // The blank pass is what lets the mode be turned off again: `applyTheme`
  // removes any property whose value is empty, so the `--ios-*` set does not
  // linger on the document as dead weight.
  const vars: ThemeVars = {
    ...shadeToVars(dark ? palette.dark : palette.light),
    ...(input.apple ? appleVars(dark) : { ...skin.vars, ...blankAppleVars() }),
    "--density": DENSITY_SCALE[input.density],
    "--ui-scale": `${input.uiScale}%`,
  };

  // In Apple mode the glass setting is the transparency switch instead: the
  // look is built on vibrancy, so there is no version of it with `--blur: 0`
  // that is still Apple mode.
  const glass = input.apple ? input.appleTransparency : input.glass;
  if (!glass) {
    vars["--blur"] = "0px";
    vars["--surface-alpha"] = "100%";
  } else if (!input.apple) {
    // Skins ship the opaque pair and describe their frost separately, so the
    // setting has something to change on every one of them — Editorial and
    // Studio previously baked opacity into the skin itself, which left the
    // toggle switched on and visibly doing nothing.
    vars["--blur"] = skin.glass.blur;
    vars["--surface-alpha"] = skin.glass.alpha;
  }

  // Only ever *removes* a filter: a skin that does not ask for one has nothing
  // here to turn off, so the switch is inert everywhere but Obsidian. A hand
  // override of `--art-filter` still wins, like every other override.
  if (!input.monoArtwork) vars["--art-filter"] = "none";

  // An accent preset overrides only the two brand colours, so it composes with
  // any palette instead of replacing it — Apple mode included. iOS ships one
  // tint, but it is also a tint the user is allowed to change, and the mode
  // supplies systemBlue as the default rather than as a rule: the palette below
  // it is Apple's, so with nothing chosen that is what shows through.
  const accent = input.accent ? ACCENTS[input.accent] : undefined;
  if (accent) {
    vars["--brand"] = accent.brand;
    vars["--brand-2"] = accent.brand2;
  }

  const composed = { ...vars, ...input.overrides };

  // Last, because the accent can come from four places — the palette, a preset,
  // artwork, or a hand-typed override — and only the final value tells us what
  // colour is legible on top of it. See `theme/contrast.ts`.
  composed["--brand-foreground"] = foregroundFor(
    composed["--brand"] ?? "rgb(255 255 255)",
  );

  return composed;
}

/** Apply a theme to the document. */
export function applyTheme(input: ThemeInput): void {
  const root = document.documentElement;
  const vars = buildVars(input);

  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === "") root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }

  // Tailwind's `dark:` variant and any `.dark`-scoped CSS still key off this.
  root.classList.toggle("dark", resolveDark(input.mode));
  // CSS gates every `backdrop-filter` on this attribute.
  root.dataset.glass = (input.apple ? input.appleTransparency : input.glass)
    ? "1"
    : "0";
  // The whole of `styles/apple.css` hangs off this one attribute, so the mode
  // is a single flag on <html> rather than a class on every component.
  root.dataset.apple = input.apple ? "1" : "0";
  // For the handful of rules a skin cannot express as one custom property: the
  // ambient light layer, the film of grain, the desaturated wallpaper. Written
  // here rather than read by components, so no component branches on the skin —
  // they set a class and CSS decides what it means. Apple mode replaces the skin
  // outright, so while it is on that is what the attribute says.
  root.dataset.skin = input.apple ? "apple" : input.skin;

  // Anything painting outside CSS — the canvas effects — cannot see a custom
  // property change, so it is announced.
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Write the backdrop layer (user image / artwork / gradient). */
export function applyBackdrop(vars: ThemeVars): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === "") root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
