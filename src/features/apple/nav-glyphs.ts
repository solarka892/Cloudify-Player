import type { ViewId } from "@/components/shell/nav-items";
import {
  AppleBell,
  AppleBookmark,
  AppleEnvelope,
  AppleGear,
  AppleHouse,
  AppleMagnifier,
  ApplePersonCircle,
  AppleSquareStack,
  type Glyph,
} from "./icons";

/**
 * A drawing for each section, in this app's own hand rather than lucide's.
 *
 * Its own module because two frames draw the same navigation now — the column
 * and the phone's dock — and a table living inside one of them is how a section
 * ends up with two different glyphs depending on the window's width. (It is
 * also what the fast-refresh rule is about: a file that exports both components
 * and constants cannot be hot-swapped cleanly.)
 *
 * Keyed off the shared `NAV_ITEMS` rather than replacing it, so the sections,
 * their order and their labels stay in one place; this only swaps the picture.
 */
export const GLYPHS: Record<ViewId, Glyph> = {
  home: AppleHouse,
  search: AppleMagnifier,
  library: AppleSquareStack,
  nit: AppleBookmark,
  messages: AppleEnvelope,
  notifications: AppleBell,
  profile: ApplePersonCircle,
  settings: AppleGear,
};
