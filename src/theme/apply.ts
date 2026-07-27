import { PALETTES, ACCENTS, type PaletteId } from "./palettes";
import { SKINS, type SkinId } from "./skins";
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

  const vars: ThemeVars = {
    ...shadeToVars(dark ? palette.dark : palette.light),
    ...skin.vars,
    "--density": DENSITY_SCALE[input.density],
    "--ui-scale": `${input.uiScale}%`,
  };

  if (!input.glass) {
    vars["--blur"] = "0px";
    vars["--surface-alpha"] = "100%";
  }

  // An accent preset overrides only the two brand colours, so it composes with
  // any palette instead of replacing it.
  const accent = input.accent ? ACCENTS[input.accent] : undefined;
  if (accent) {
    vars["--brand"] = accent.brand;
    vars["--brand-2"] = accent.brand2;
  }

  return { ...vars, ...input.overrides };
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
  root.dataset.glass = input.glass ? "1" : "0";
}

/** Write the backdrop layer (user image / artwork / gradient). */
export function applyBackdrop(vars: ThemeVars): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(vars)) {
    if (value == null || value === "") root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }
}
