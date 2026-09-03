import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BACKDROP, useSettingsStore } from "./useSettingsStore";

/**
 * The two light amounts, which are a pair per light and used to be one number.
 *
 * Worth a test because of how it fails: the sliders and the full-screen player
 * read `playerLightStrength[mode]`, so a single number arriving from an older
 * install (or an older theme file) reads `undefined` — which lands in a CSS
 * variable as nothing at all and takes the light out entirely, with no error
 * anywhere to say why. `importTheme` is the reachable end of that path.
 */

const theme = { ...useSettingsStore.getState().theme };

beforeEach(() => {
  useSettingsStore.setState({ backdrop: { ...DEFAULT_BACKDROP } });
});

/** A theme file as an older version of the app wrote one. */
function legacyThemeFile(): string {
  return JSON.stringify({
    cloudifyTheme: 1,
    name: "old",
    theme,
    backdrop: {
      ...DEFAULT_BACKDROP,
      playerLightStrength: 0.4,
      playerLightBrightness: 1.3,
    },
  });
}

describe("player light amounts", () => {
  it("starts with a number for each light rather than one for both", () => {
    const { playerLightStrength, playerLightBrightness } =
      useSettingsStore.getState().backdrop;

    expect(playerLightStrength).toEqual({ glow: 0.7, blur: 0.7 });
    expect(playerLightBrightness).toEqual({ glow: 1, blur: 1 });
  });

  it("spreads one saved number across both lights", () => {
    expect(useSettingsStore.getState().importTheme(legacyThemeFile())).toBeNull();

    const { playerLightStrength, playerLightBrightness } =
      useSettingsStore.getState().backdrop;
    // Their tuning was real; it just applied to whichever light they had on.
    expect(playerLightStrength).toEqual({ glow: 0.4, blur: 0.4 });
    expect(playerLightBrightness).toEqual({ glow: 1.3, blur: 1.3 });
  });

  it("keeps each light's own number when a file already has both", () => {
    const file = JSON.parse(legacyThemeFile());
    file.backdrop.playerLightStrength = { glow: 0.7, blur: 1 };
    file.backdrop.playerLightBrightness = { glow: 1.3, blur: 2 };

    expect(
      useSettingsStore.getState().importTheme(JSON.stringify(file)),
    ).toBeNull();

    expect(useSettingsStore.getState().backdrop.playerLightStrength).toEqual({
      glow: 0.7,
      blur: 1,
    });
    expect(useSettingsStore.getState().backdrop.playerLightBrightness).toEqual({
      glow: 1.3,
      blur: 2,
    });
  });
});
