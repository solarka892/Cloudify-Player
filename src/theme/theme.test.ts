import { describe, expect, it } from "vitest";
import { buildVars, type ThemeInput } from "./apply";
import { PALETTES, type PaletteId } from "./palettes";
import { SKINS, SKIN_IDS, type SkinId } from "./skins";
import { desaturate } from "./artwork";

/**
 * The theming contract, tested where it is cheapest to break.
 *
 * `buildVars` is a pure function from settings to custom properties, which makes
 * it the one part of the appearance system that can be checked without a browser
 * — and the part where a mistake is least visible in review. Every case below is
 * a rule stated somewhere in `tokens.ts` or `skins.ts` that nothing else enforces.
 */

/** A theme input with everything at its default, for one field to be varied. */
function input(patch: Partial<ThemeInput> = {}): ThemeInput {
  return {
    mode: "dark",
    palette: "midnight",
    skin: "aurora",
    accent: null,
    density: "cozy",
    uiScale: 100,
    glass: false,
    apple: false,
    appleTransparency: true,
    monoArtwork: true,
    overrides: {},
    ...patch,
  };
}

describe("the obsidian skin", () => {
  it("has a radius of zero everywhere, including the round token", () => {
    const vars = buildVars(input({ skin: "obsidian" }));
    expect(vars["--radius"]).toBe("0px");
    expect(vars["--radius-control"]).toBe("0px");
    expect(vars["--radius-hero"]).toBe("0px");
    // The one that would otherwise leave avatars and slider handles circular.
    expect(vars["--radius-round"]).toBe("0px");
  });

  it("frosts at 30px over a 26% surface when glass is on", () => {
    const vars = buildVars(input({ skin: "obsidian", glass: true }));
    expect(vars["--blur"]).toBe("30px");
    expect(vars["--surface-alpha"]).toBe("26%");
  });

  it("has no shadows at all", () => {
    const vars = buildVars(input({ skin: "obsidian" }));
    expect(vars["--shadow-1"]).toBe("none");
    expect(vars["--shadow-2"]).toBe("none");
  });

  it("sinks opaque panels toward the page; the others leave them alone", () => {
    // The reason this token exists: with glass off, `--surface-alpha` is forced
    // to 100% and a palette tuned to be read through 26% of translucency is far
    // too bright at full strength.
    expect(buildVars(input({ skin: "obsidian" }))["--surface-sink"]).toBe("55%");
    for (const skin of SKIN_IDS.filter((id) => id !== "obsidian")) {
      expect(buildVars(input({ skin }))["--surface-sink"]).toBe("0%");
    }
  });
});

describe("the glass switch", () => {
  it("forces every skin opaque and unblurred when off", () => {
    for (const skin of SKIN_IDS) {
      const vars = buildVars(input({ skin, glass: false }));
      expect(vars["--blur"], skin).toBe("0px");
      expect(vars["--surface-alpha"], skin).toBe("100%");
    }
  });

  it("gives every skin something to change when on", () => {
    // The bug this guards: Editorial and Studio used to bake opacity into the
    // skin itself, so the switch was on and visibly doing nothing.
    for (const skin of SKIN_IDS) {
      const on = buildVars(input({ skin, glass: true }));
      expect(on["--blur"], skin).not.toBe("0px");
      expect(on["--surface-alpha"], skin).not.toBe("100%");
    }
  });
});

describe("--art-filter", () => {
  it("greyscales artwork under obsidian and nowhere else", () => {
    expect(buildVars(input({ skin: "obsidian" }))["--art-filter"]).toContain(
      "grayscale(1)",
    );
    for (const skin of SKIN_IDS.filter((id) => id !== "obsidian")) {
      expect(buildVars(input({ skin }))["--art-filter"], skin).toBe("none");
    }
  });

  it("is blanked by the greyscale-artwork setting", () => {
    const vars = buildVars(input({ skin: "obsidian", monoArtwork: false }));
    expect(vars["--art-filter"]).toBe("none");
  });

  it("is present on every skin, so switching away cannot leave it stuck", () => {
    // `applyTheme` only removes a property it is handed as an empty string, so a
    // skin silent about `--art-filter` would inherit Obsidian's greyscale.
    for (const skin of SKIN_IDS) {
      expect(Object.keys(SKINS[skin].vars), skin).toContain("--art-filter");
    }
    // Apple mode replaces the skin wholesale and has to answer for it too.
    expect(buildVars(input({ skin: "obsidian", apple: true }))["--art-filter"]).toBe(
      "none",
    );
  });
});

describe("the obsidian palette", () => {
  /** oklch chroma is the second component: `oklch(L C H[ / A])`. */
  function chromaOf(value: string): number {
    const m = /oklch\(\s*[\d.]+\s+([\d.]+)/.exec(value);
    expect(m, `not an oklch value: ${value}`).not.toBeNull();
    return Number(m![1]);
  }

  it("has zero chroma in all eight fields, in both appearances", () => {
    const palette = PALETTES.obsidian;
    for (const shade of [palette.dark, palette.light]) {
      for (const [field, value] of Object.entries(shade)) {
        expect(chromaOf(value), field).toBe(0);
      }
    }
  });

  it("declares itself achromatic, so a sampled accent is reduced", () => {
    expect(PALETTES.obsidian.achromatic).toBe(true);
    // The palettes that merely *happen* to be grey do not claim this: it changes
    // what the artwork-accent switch does, which is a behaviour, not a colour.
    expect(PALETTES.ink.achromatic).toBeUndefined();
  });

  it("is distinct from ink, which is the palette it is closest to", () => {
    // If these ever converge, one of them should go — see the comment on the
    // palette. Weaker lines, a lower `muted`, and text that stops short of white
    // so that white is left to mean "accent".
    const { obsidian, ink } = PALETTES;
    expect(obsidian.dark.line).not.toBe(ink.dark.line);
    expect(obsidian.dark.muted).not.toBe(ink.dark.muted);
    expect(obsidian.dark.text).not.toBe(ink.dark.text);
  });
});

describe("overrides", () => {
  it("beat the skin", () => {
    const vars = buildVars(
      input({ skin: "obsidian", overrides: { "--radius": "12px" } }),
    );
    expect(vars["--radius"]).toBe("12px");
  });

  it("beat the greyscale-artwork setting", () => {
    // A hand-edited filter is a deliberate choice; a switch elsewhere in Settings
    // should not silently overrule it.
    const vars = buildVars(
      input({ monoArtwork: false, overrides: { "--art-filter": "sepia(1)" } }),
    );
    expect(vars["--art-filter"]).toBe("sepia(1)");
  });
});

describe("unknown ids from an imported theme file", () => {
  it("fall back instead of producing an undefined-valued theme", () => {
    const vars = buildVars(
      input({
        skin: "not-a-skin" as SkinId,
        palette: "not-a-palette" as PaletteId,
      }),
    );
    expect(vars["--radius"]).toBe(SKINS.aurora.vars["--radius"]);
    expect(vars["--background"]).toBe(PALETTES.midnight.dark.bg);
  });
});

describe("desaturate", () => {
  it("keeps a sampled accent's lightness and drops its hue", () => {
    const { brand } = desaturate({
      brand: "rgb(255 0 0)",
      brand2: "rgb(0 0 255)",
    });
    // Rec. 709 luma of pure red.
    expect(brand).toBe("rgb(54 54 54)");
  });

  it("leaves a value it cannot parse alone rather than mangling it", () => {
    const pair = { brand: "oklch(0.7 0.2 30)", brand2: "#ff0000" };
    expect(desaturate(pair)).toEqual(pair);
  });
});
