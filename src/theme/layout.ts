import { SKINS, type SkinId } from "./skins";

/**
 * How the navigation and the content are arranged.
 *
 * Declared here rather than in the settings store, because it is no longer only
 * a user preference: a skin can be drawn for some arrangements and not others,
 * and the place that knows which is the theme layer. The store re-exports the
 * type, so nothing that already imported it from there had to change.
 */
export type LayoutId = "rail" | "top" | "sidebar";

export const LAYOUT_IDS: LayoutId[] = ["rail", "top", "sidebar"];

/**
 * The arrangements a skin is actually drawn for.
 *
 * A skin listing none of them takes all three, which is what three of the four
 * do — they are form and nothing else, and form does not care where the nav is.
 *
 * Nit is the exception, and the reason is worth stating: its navigation is not a
 * styled list, it is an 88px column of icons with micro-caps under them, a 3px
 * marker at the edge and the keyboard hint at its foot. The sidebar is a 240px
 * panel with playlist sub-items under each section — a different information
 * architecture, not a wider version of the same one — and the look has no
 * drawing for it. Offering a choice that comes out wrong is worse than not
 * offering it.
 */
export function layoutsFor(skin: SkinId): LayoutId[] {
  return SKINS[skin]?.layouts ?? LAYOUT_IDS;
}

export function layoutAllowed(layout: LayoutId, skin: SkinId): boolean {
  return layoutsFor(skin).includes(layout);
}

/**
 * The arrangement to actually render, given what the user chose and what the
 * skin can draw.
 *
 * Resolved at render rather than written back to the setting, exactly like the
 * phone layout: someone who chose the sidebar under Editorial and then tries Nit
 * for an evening gets their sidebar back when they switch away, instead of
 * finding that the look silently rewrote their preferences.
 *
 * Apple mode replaces the shell outright and never consults this.
 */
export function resolveLayout(layout: LayoutId, skin: SkinId): LayoutId {
  return layoutAllowed(layout, skin) ? layout : "rail";
}
