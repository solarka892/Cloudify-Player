import { describe, expect, it } from "vitest";
import { buildVars, resolveDark, type ThemeInput } from "./apply";
import { ACCENTS, accentValue, SHEET } from "./palettes";
import { shadeToVars } from "./tokens";
import { bandForDuration } from "@/lib/band";

/**
 * The sheet, tested where it is cheapest to break.
 *
 * `buildVars` is a pure function from settings to custom properties, which makes
 * it the one part of the appearance system checkable without a browser — and the
 * part where a mistake is least visible in review. Every case below is a rule
 * stated in `docs/design-language.md` that nothing else enforces.
 */

/** A theme input with everything at its default, for one field to be varied. */
function input(patch: Partial<ThemeInput> = {}): ThemeInput {
  return {
    mode: "dark",
    accent: null,
    uiScale: 100,
    artworkAccent: null,
    overrides: {},
    ...patch,
  };
}

describe("the two printings", () => {
  it("are the same sheet, inverted", () => {
    const light = buildVars(input({ mode: "light" }));
    const dark = buildVars(input({ mode: "dark" }));

    // The ground and the ink swap places. That is what "printed on black stock"
    // means, and it is the whole reason there is no second palette.
    expect(light["--sheet"]).toBe(dark["--ink"]);
    expect(light["--ink"]).toBe(dark["--sheet"]);
  });

  it("keeps the ramp climbing in the same direction on both", () => {
    // An inverted ramp would put the pale bands at the top of the scale, and the
    // scale has to mean "more" in the same direction whichever stock it is on.
    for (const shade of [SHEET.light, SHEET.dark]) {
      const vars = shadeToVars(shade);
      const bands = [1, 2, 3, 4, 5].map((n) => vars[`--relief-${n}`]!);
      expect(new Set(bands).size, "five distinct bands").toBe(5);
    }
  });

  it("resolves `system` from the machine", () => {
    // The test setup answers "not dark" and never changes.
    expect(resolveDark("system")).toBe(false);
    expect(resolveDark("dark")).toBe(true);
    expect(resolveDark("light")).toBe(false);
  });
});

describe("the accent", () => {
  it("is the water until something says otherwise", () => {
    const vars = buildVars(input());
    expect(vars["--brand"]).toBe(SHEET.dark.water);
  });

  it("can only ever be a band of the ramp", () => {
    for (const id of ACCENTS) {
      const vars = buildVars(input({ accent: id }));
      // Not merely "some colour": the exact value the legend declares.
      expect(vars["--brand"], id).toBe(accentValue(id, true));
      expect(SHEET.dark.relief).toContain(vars["--brand"]);
    }
  });

  it("lets the playing cover outrank the chosen band", () => {
    // The cover is the more specific answer to "what is on screen right now",
    // and the sampler has already snapped it onto the ramp.
    const sampled = accentValue("sienna", true);
    const vars = buildVars(input({ accent: "lowland", artworkAccent: sampled }));
    expect(vars["--brand"]).toBe(sampled);
  });

  it("computes an ink that stays legible on whatever it landed on", () => {
    for (const id of ACCENTS) {
      const vars = buildVars(input({ accent: id }));
      expect(vars["--brand-foreground"], id).toBeTruthy();
    }
  });
});

describe("overrides", () => {
  it("beat the sheet", () => {
    const vars = buildVars(
      input({ overrides: { "--sheet": "#000000" } }),
    );
    expect(vars["--sheet"]).toBe("#000000");
  });

  it("beat the accent, and the ink is recomputed against them", () => {
    // The hand-typed value is the last word, so the legibility pass has to run
    // after it rather than against the value it replaced.
    const vars = buildVars(
      input({ accent: "lowland", overrides: { "--brand": "rgb(255 255 255)" } }),
    );
    expect(vars["--brand"]).toBe("rgb(255 255 255)");
    expect(vars["--brand-foreground"]).not.toBe(SHEET.dark.sheet);
  });
});

describe("scale", () => {
  it("is the one metric left, and it is a percentage", () => {
    expect(buildVars(input({ uiScale: 120 }))["--ui-scale"]).toBe("120%");
  });
});

/**
 * The band is the signature, so what it encodes has to be stable.
 *
 * Boundaries in minutes rather than quantiles: a band must mean the same thing on
 * every screen, and a quantile would make it mean "long for this playlist".
 */
describe("the band on a row", () => {
  it("climbs with length", () => {
    expect(bandForDuration(30_000)).toBe(1);
    expect(bandForDuration(3 * 60_000)).toBe(2);
    expect(bandForDuration(5 * 60_000)).toBe(3);
    expect(bandForDuration(7 * 60_000)).toBe(4);
    expect(bandForDuration(20 * 60_000)).toBe(5);
  });

  it("puts a boundary in the higher band", () => {
    expect(bandForDuration(2 * 60_000)).toBe(2);
    expect(bandForDuration(9 * 60_000)).toBe(5);
  });

  it("never returns nothing, however odd the input", () => {
    expect(bandForDuration(0)).toBe(1);
    expect(bandForDuration(-1)).toBe(1);
  });
});
