import { accentValue, SHEET, type AccentId } from "./palettes";
import { foregroundFor } from "./contrast";
import { shadeToVars, type ThemeVars } from "./tokens";

/**
 * Composes the sheet and writes it to `<html>`.
 *
 * Everything visual funnels through here, in a fixed order — the sheet, then the
 * accent, then the scale, then the user's hand edits last so they always win.
 * Components never re-render for a theme change; the custom properties update
 * underneath them.
 *
 * ## What this function used to do
 *
 * It composed a palette against a skin, then patched the result for six switches:
 * glass on or off, Apple mode replacing the form outright, mono artwork, a print
 * offset, an accent pair, a density multiplier. Each patch existed because form
 * was negotiable, and the negotiation is what made the app feel like five apps.
 * Relief answers those questions in the language instead, so the function is
 * mostly gone — which is the point rather than a side effect.
 */

export type ThemeMode = "dark" | "light" | "system";

export interface ThemeInput {
  mode: ThemeMode;
  /** A band of the relief ramp, or `null` for the water. */
  accent: AccentId | null;
  /** UI scale as a percentage, 80–140. */
  uiScale: number;
  /**
   * An accent sampled from the playing cover, already snapped to a band of the
   * ramp by `theme/artwork.ts`. Beats `accent` while something is playing.
   *
   * Kept because it was asked for by name, and made legal by the snapping: cover
   * colour still reaches the interface, but only ever as a value the legend
   * declares. A raw sampled colour would be a sixth band nobody can read.
   */
  artworkAccent: string | null;
  /** Per-property overrides authored by the user; applied last. */
  overrides: ThemeVars;
}

const prefersDark = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export function resolveDark(mode: ThemeMode): boolean {
  return mode === "dark" || (mode === "system" && prefersDark());
}

/** Build the full property map for a theme, without touching the DOM. */
export function buildVars(input: ThemeInput): ThemeVars {
  const dark = resolveDark(input.mode);
  const vars: ThemeVars = {
    ...shadeToVars(dark ? SHEET.dark : SHEET.light),
    "--ui-scale": `${input.uiScale}%`,
  };

  // The accent, in order of who gets the last word: the sheet's own water, then
  // a band the user picked, then the cover of whatever is playing. Each is a
  // value from the ramp, so none of them can introduce a colour the legend
  // cannot name.
  const chosen =
    input.artworkAccent ??
    (input.accent ? accentValue(input.accent, dark) : null);
  if (chosen) vars["--brand"] = chosen;

  const composed = { ...vars, ...input.overrides };

  // Last, because the accent can arrive from four places — the sheet, a band, a
  // cover, or a hand-typed override — and only the final value says what ink
  // stays legible on top of it. See `theme/contrast.ts`.
  composed["--brand-foreground"] = foregroundFor(
    composed["--brand"] ?? SHEET.light.water,
  );

  return composed;
}

/**
 * Broadcast when the sheet changes.
 *
 * Anything that paints outside CSS — the visualiser's canvas — cannot observe a
 * custom property being rewritten, so it is told. Lives here rather than in the
 * deleted effects module because this is the only thing that changes a token.
 */
export const THEME_EVENT = "cloudify:theme";

/** Apply a theme to the document. */
export function applyTheme(input: ThemeInput): void {
  const root = document.documentElement;
  const vars = buildVars(input);

  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === "") root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }

  // Which printing is on the screen. The stylesheet needs it for the handful of
  // rules a custom property cannot carry, and Tailwind's `dark:` keys off it.
  root.classList.toggle("dark", resolveDark(input.mode));

  window.dispatchEvent(new Event(THEME_EVENT));
}
