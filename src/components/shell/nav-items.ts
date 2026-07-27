import { Home, Library, Search, Settings, User, type LucideIcon } from "lucide-react";
import { t } from "@/i18n";

/**
 * The app's top-level sections, in order.
 *
 * All three navigation arrangements render from this list, so adding a section
 * is a one-line change here rather than three edits in `nav.tsx`.
 */

export type ViewId = "home" | "search" | "library" | "profile" | "settings";

export interface NavItem {
  id: ViewId;
  label: string;
  Icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "home", get label() {
    return t.nav.home;
  }, Icon: Home },
  { id: "search", get label() {
    return t.nav.search;
  }, Icon: Search },
  { id: "library", get label() {
    return t.nav.library;
  }, Icon: Library },
  { id: "profile", get label() {
    return t.nav.profile;
  }, Icon: User },
  { id: "settings", get label() {
    return t.nav.settings;
  }, Icon: Settings },
];
