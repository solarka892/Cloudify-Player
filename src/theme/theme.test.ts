import { describe, expect, it } from "vitest";
import { buildVars, type ThemeInput } from "./apply";
import { PALETTES, type PaletteId } from "./palettes";
import { SKINS, SKIN_IDS, type SkinId } from "./skins";
import { LAYOUT_IDS, layoutAllowed, resolveLayout } from "./layout";
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
    skin: "editorial",
    accent: null,
    density: "cozy",
    uiScale: 100,
    glass: false,
    monoArtwork: true,
    printShift: true,
    overrides: {},
    ...patch,
  };
}

describe("the nit skin", () => {
  it("prints cover art with the palette's two inks", () => {
    const vars = buildVars(input({ skin: "nit" }));
    // The filter drains the photograph; the ink goes on over it in CSS.
    expect(vars["--art-filter"]).toContain("grayscale(1)");
    // Written as roles rather than as values, so the palette still owns colour.
    expect(vars["--art-duotone-from"]).toBe("var(--brand-2)");
    expect(vars["--art-duotone-to"]).toBe("var(--brand)");
  });

  it("takes the ink off with the greyscale, not one without the other", () => {
    const vars = buildVars(input({ skin: "nit", monoArtwork: false }));
    expect(vars["--art-filter"]).toBe("none");
    expect(vars["--art-duotone-from"]).toBe("transparent");
    expect(vars["--art-duotone-to"]).toBe("transparent");
  });

  it("contrasts a square card against a round control", () => {
    const vars = buildVars(input({ skin: "nit" }));
    expect(vars["--radius"]).toBe("2px");
    expect(vars["--radius-control"]).toBe("999px");
    expect(vars["--shadow-1"]).toBe("none");
    expect(vars["--shadow-2"]).toBe("none");
  });

  it("offsets a heading's second impression, until told not to", () => {
    expect(buildVars(input({ skin: "nit" }))["--print-offset"]).toBe("2px");
    expect(
      buildVars(input({ skin: "nit", printShift: false }))["--print-offset"],
    ).toBe("0px");
  });

  it("leaves every other skin's artwork untouched", () => {
    // The point of the token being in `SIGNATURE_OFF`: a skin that says nothing
    // about the duotone must not inherit whatever was on the document before it.
    for (const id of SKIN_IDS.filter((s) => s !== "nit")) {
      const vars = buildVars(input({ skin: id }));
      expect(vars["--art-filter"]).not.toContain("nit-duotone");
      expect(vars["--art-duotone-from"]).toBe("transparent");
      expect(vars["--art-duotone-to"]).toBe("transparent");
      expect(vars["--print-offset"]).toBe("0px");
    }
  });
});

describe("what a skin is drawn for", () => {
  it("keeps Nit out of the sidebar, and falls back rather than rewriting", () => {
    // The nav here is an 88px icon column; the sidebar is a 240px panel with a
    // playlist index in it, which the look has no drawing for.
    expect(layoutAllowed("sidebar", "nit")).toBe(false);
    expect(layoutAllowed("rail", "nit")).toBe(true);
    expect(layoutAllowed("top", "nit")).toBe(true);
    // The stored preference is answered around, never overwritten: switching
    // away from Nit has to give the sidebar back.
    expect(resolveLayout("sidebar", "nit")).toBe("rail");
    expect(resolveLayout("sidebar", "editorial")).toBe("sidebar");
  });

  it("lets every other skin draw all three", () => {
    for (const skin of SKIN_IDS.filter((id) => id !== "nit")) {
      for (const layout of LAYOUT_IDS) {
        expect(layoutAllowed(layout, skin), `${skin}/${layout}`).toBe(true);
      }
    }
  });

  it("gives the thread to exactly the skin that gives up its seek bar", () => {
    // Both halves matter. A skin with the thread *and* a seek bar is the app
    // disagreeing with itself about where time lives; a skin with neither has
    // no progress at all.
    expect(SKINS.nit.thread).toBe(true);
    for (const skin of SKIN_IDS.filter((id) => id !== "nit")) {
      expect(SKINS[skin].thread, skin).toBeFalsy();
    }
  });
});

describe("every skin", () => {
  it("answers for the instrument face", () => {
    // Three roles, and the third is the one a new skin forgets. A missing
    // `--font-mono` is not a blank readout — it is the previous skin's.
    for (const id of SKIN_IDS) {
      expect(buildVars(input({ skin: id }))["--font-mono"]).toBeTruthy();
    }
  });
});

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

  it("is obeyed when off, on every skin", () => {
    // Nothing overrules it any more: the one look that forced glass on was the
    // Apple shell, and it is gone. Off has to mean off, because this is the
    // perf escape on a software-composited desktop.
    for (const skin of SKIN_IDS) {
      const vars = buildVars(input({ skin, glass: false }));
      expect(vars["--blur"], skin).toBe("0px");
      expect(vars["--surface-alpha"], skin).toBe("100%");
    }
  });
});

describe("--art-filter", () => {
  it("is only touched by the two skins that treat artwork", () => {
    // Two skins have an opinion about cover art and they are different
    // opinions: Obsidian drains it, Nit prints it in two inks. Every other skin
    // has to leave it alone — the token is shared, so a skin that forgets to
    // say `none` inherits whichever of the two was on before it.
    expect(buildVars(input({ skin: "obsidian" }))["--art-filter"]).toContain(
      "grayscale(1)",
    );
    expect(buildVars(input({ skin: "nit" }))["--art-filter"]).toContain(
      "grayscale(1)",
    );
    for (const skin of SKIN_IDS.filter((id) => id !== "obsidian" && id !== "nit")) {
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
    expect(vars["--radius"]).toBe(SKINS.nit.vars["--radius"]);
    expect(vars["--background"]).toBe(PALETTES.signal.dark.bg);
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
