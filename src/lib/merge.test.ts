import { describe, expect, it } from "vitest";
import { fillDefaults } from "@/lib/merge";

/**
 * Rehydration has to survive its own history: every one of these is a settings
 * file written by a version that did not have some field yet.
 */
describe("fillDefaults", () => {
  const defaults = {
    layout: "rail",
    backdrop: { mode: "artwork", blur: 40, effect: "none", effectIntensity: 1 },
    theme: { palette: "midnight", overrides: {} },
    presets: [] as { id: string }[],
  };

  it("keeps a nested field the saved state has never heard of", () => {
    // The bug this exists for: a shallow merge replaced `backdrop` wholesale,
    // leaving `effect` undefined — neither "none" nor a real effect.
    const merged = fillDefaults(defaults, {
      backdrop: { mode: "image", blur: 10 },
    });
    expect(merged.backdrop.effect).toBe("none");
    expect(merged.backdrop.effectIntensity).toBe(1);
    // And still honours what was saved.
    expect(merged.backdrop.mode).toBe("image");
    expect(merged.backdrop.blur).toBe(10);
  });

  it("replaces arrays rather than merging them", () => {
    const merged = fillDefaults(
      { ...defaults, presets: [{ id: "a" }] },
      { presets: [{ id: "b" }] },
    );
    expect(merged.presets).toEqual([{ id: "b" }]);
  });

  it("ignores keys the defaults no longer have", () => {
    const merged = fillDefaults(defaults, { glideScroll: true, layout: "top" });
    expect(merged).not.toHaveProperty("glideScroll");
    expect(merged.layout).toBe("top");
  });

  it("survives a saved value of the wrong shape", () => {
    // Hand-edited or corrupted storage should not decide the app's fate.
    const merged = fillDefaults(defaults, { backdrop: "nonsense" });
    expect(merged.backdrop).toBe("nonsense");
    expect(fillDefaults(defaults, null)).toBe(null);
  });

  it("passes an explicit null or false through", () => {
    const merged = fillDefaults({ accent: "warm" as string | null }, {
      accent: null,
    });
    expect(merged.accent).toBe(null);
  });
});
