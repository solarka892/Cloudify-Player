import {
  Bell,
  Home,
  Library,
  Mail,
  Search,
  Settings,
  User,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/i18n";

/**
 * The app's top-level sections, in order.
 *
 * All three navigation arrangements render from this list, so adding a section
 * is a one-line change here rather than three edits in `nav.tsx`.
 */

export type ViewId =
  | "home"
  | "search"
  | "library"
  | "messages"
  | "notifications"
  | "profile"
  | "settings";

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
  { id: "messages", get label() {
    return t.nav.messages;
  }, Icon: Mail },
  { id: "notifications", get label() {
    return t.nav.notifications;
  }, Icon: Bell },
  { id: "profile", get label() {
    return t.nav.profile;
  }, Icon: User },
  { id: "settings", get label() {
    return t.nav.settings;
  }, Icon: Settings },
];

/**
 * What the phone-width tab bar shows.
 *
 * Seven tabs across a narrow screen leaves each one about 50px, which is under
 * the touch target Android asks for and makes every label a truncated stub.
 * Messages and notifications are reachable from the desktop nav and from the
 * things that link into them, so they are the two that give way.
 */
export const COMPACT_NAV_ITEMS: NavItem[] = NAV_ITEMS.filter(
  (item) => item.id !== "messages" && item.id !== "notifications",
);
