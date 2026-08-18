/**
 * The theming contract, in the Relief language.
 *
 * Nothing in the UI names a colour, a radius or a duration — components read
 * custom properties and this module defines what those properties are. See
 * `docs/design-language.md`; every token below is a line on that page, and a
 * token that cannot be traced to one does not belong here.
 *
 * ## What is gone, and why
 *
 * The old contract had a `SkinVars` set of thirty-odd properties because form was
 * switchable: five skins argued about blur, glass alpha, two shadow levels, a
 * duotone ink pair, a print offset, grain, an ambient glow, uppercase label
 * transforms and how far an opaque panel should sink. Relief settles all of those
 * questions once — there is no light source, so there are no shadows and no
 * glass; artwork is never recoloured, so there is no duotone; nothing is set in
 * caps. A token exists to hold a decision that is still open, and none of those
 * are.
 *
 * What remains is two layers applied to `<html>`:
 *   1. the sheet — colour (`Shade` → `shadeToVars`)
 *   2. overrides — whatever the user edited by hand, which wins
 */

/**
 * The colours of the sheet. Nine values, and the five-step ramp counts as one
 * scale rather than five colours.
 *
 * `surface` is the one addition to the manifesto's eight, and it earns its place
 * by keeping the ramp honest: the ramp means *a quantity*, and a row lit up under
 * the pointer is not a quantity. Painting hover states out of the ramp — which is
 * what happens when there is no separate fill — makes the legend a liar.
 */
export interface Shade {
  /** The page. */
  sheet: string;
  /** Fills that are not data: hover, inputs, the inside of a block. */
  surface: string;
  /** Every letter and every line. One ink. */
  ink: string;
  /** The same ink, printed lighter. Secondary text only, never a third colour. */
  inkSoft: string;
  /** The separator. A contour, not a hairline. */
  contour: string;
  /** The only cool colour: selection, links, "you are here". Never decoration. */
  water: string;
  /** One hazard colour. Destructive actions and failures. Nothing else. */
  warning: string;
  /** The hypsometric ramp, low ground to high. */
  relief: [string, string, string, string, string];
}

/** Expand a shade into the full set of colour custom properties. */
export function shadeToVars(s: Shade): Record<string, string> {
  return {
    "--sheet": s.sheet,
    "--surface": s.surface,
    "--ink": s.ink,
    "--ink-soft": s.inkSoft,
    "--contour": s.contour,
    "--water": s.water,
    "--warning": s.warning,
    "--relief-1": s.relief[0],
    "--relief-2": s.relief[1],
    "--relief-3": s.relief[2],
    "--relief-4": s.relief[3],
    "--relief-5": s.relief[4],
    /**
     * The accent, as a role rather than a colour.
     *
     * Everything that means "this one, now" reads `--brand`, and by default it
     * is the water: the map's single cool colour. The accent picker points it at
     * a band of the ramp instead, and the artwork sampler snaps a cover's colour
     * to the nearest band — so it can move, and it can only ever land somewhere
     * the legend already declares.
     */
    "--brand": s.water,
    /** Ink that stays legible on a filled accent. */
    "--brand-foreground": s.sheet,
  };
}

/**
 * The one number the user still owns.
 *
 * Density is not here and that is deliberate: the manifesto states the row
 * height, the margin and the gaps, and a slider that re-spaces a sheet the
 * language already spaced would be undoing the design on request. Scale is a
 * different question — it makes the same sheet bigger for eyes that need it,
 * without moving anything relative to anything else.
 */
export interface MetricVars {
  /** Root font size; drives the whole sheet. */
  "--ui-scale": string;
}

/**
 * Every property a saved theme may carry. A user theme is exactly this — a
 * partial map of custom property names to values — which is why themes export
 * cleanly to JSON.
 */
export type ThemeVars = Partial<
  Record<keyof MetricVars | string, string>
>;
