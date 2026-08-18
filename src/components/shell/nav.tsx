import { Settings } from "lucide-react";
import { Logo, LogoWord } from "@/components/Logo";
import { COMPACT_NAV_ITEMS, NAV_ITEMS, type ViewId } from "./nav-items";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useNavStore } from "@/stores/useNavStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Navigation, in the three arrangements the layout setting can choose from.
 *
 * All three consume the same `NAV_ITEMS`, so adding a section is a one-line
 * change rather than three.
 */

export type { ViewId };

/**
 * Unread count for a section, or 0 for the ones that never have one.
 *
 * Both stores are subscribed to unconditionally — a hook cannot be called
 * behind a branch — and the numbers are cheap: one is a field, the other a
 * filter over a list that is already in memory.
 */
function useBadge(id: ViewId): number {
  const messages = useMessagesStore((s) => s.unread);
  const notifications = useNotificationsStore((s) => s.unreadCount());
  if (id === "messages") return messages;
  if (id === "notifications") return notifications;
  return 0;
}

/** The little count on a nav item. Caps at 99 so it cannot widen the rail. */
function Badge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "brand-gradient flex h-4 min-w-4 items-center justify-center rounded-[var(--radius-round)] px-1 text-[10px] font-semibold leading-none text-brand-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

interface NavProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
}

/** Icon-only column. Widens to show labels on hover. */
export function NavRail({ view, onNavigate }: NavProps) {
  return (
    <div data-rail-slot className="nav-in-x relative h-full w-14 shrink-0">
      <nav
        data-rail
        className="group/rail panel absolute inset-y-0 left-0 z-20 flex w-14 flex-col gap-1 overflow-hidden rounded-none border-y-0 border-l-0 p-2 transition-[width] duration-[var(--motion-slow)] hover:w-48"
      >
        <BrandMark compact />
        {NAV_ITEMS.map((item) => (
          <RailItem
            key={item.id}
            item={item}
            active={view === item.id}
            onNavigate={onNavigate}
          />
        ))}
        {/* What this look expects you to know, at the foot of the rail. Hidden
            in every other skin — it is a statement about how the app is meant
            to be driven, not a feature of the navigation. */}
        <div className="rail-hint label text-[0.59375rem] text-muted-foreground">
          ⌘K
          <br />M · H
        </div>
      </nav>
    </div>
  );
}

function RailItem({
  item: { id, label, Icon },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      title={label}
      // `aria-current` is what a stylesheet grabs hold of to restyle the active
      // item as a set — Obsidian replaces the filled pill with a 2px marker at
      // the edge — and it is the right thing for a screen reader either way.
      aria-current={active ? "page" : undefined}
      data-nav-item="side"
      className={cn(
        "relative flex h-10 shrink-0 items-center gap-3 rounded-[var(--radius)] px-2.5 text-sm",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="nav-marker" aria-hidden />
      <span className="relative shrink-0">
        <Icon className="h-[18px] w-[18px]" />
        {/* Pinned to the icon rather than the row: the rail widens on hover,
            and a badge at the row's end would travel with it. */}
        {badge > 0 && (
          <Badge count={badge} className="absolute -right-2 -top-1.5" />
        )}
      </span>
      {/* Uncovered left to right as the rail opens, rather than faded in after
          it stops — see `rail-wipe`. */}
      <span className="label whitespace-nowrap rail-wipe group-hover/rail:rail-wipe-open">
        {label}
      </span>
    </button>
  );
}

/** Horizontal tabs across the top, closest to soundcloud.com. */
export function NavTop({ view, onNavigate }: NavProps) {
  return (
    <header className="nav-in-y flex h-14 shrink-0 items-center gap-1 border-b border-border px-4">
      <BrandMark />
      <div className="ml-4 flex items-center gap-1">
        {NAV_ITEMS.filter((i) => i.id !== "settings").map((item) => (
          <TopItem
            key={item.id}
            item={item}
            active={view === item.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>
      <button
        onClick={() => onNavigate("settings")}
        title={t.nav.settings}
        className={cn(
          "ml-auto rounded-[var(--radius)] p-2 transition-colors duration-[var(--motion-fast)]",
          view === "settings"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Settings className="h-4 w-4" />
      </button>
    </header>
  );
}

function TopItem({
  item: { id, label, Icon },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      data-nav-item="top"
      className={cn(
        "relative flex items-center gap-2 rounded-[var(--radius)] px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="nav-marker" aria-hidden />
      <Icon className="h-4 w-4" />
      <span className="label">{label}</span>
      <Badge count={badge} />
    </button>
  );
}

/**
 * The phone-width header: the wordmark, and the two sections the tab bar has
 * no room for.
 *
 * Five tabs is already the most a 360px bar can hold at Android's 48px touch
 * target, so messages and notifications are dropped from it — which left them
 * with no way in at all on a phone. They live up here instead, as icons with
 * their unread badges, which is also where SoundCloud's own app keeps them.
 *
 * No inset of its own: `.safe-inset` on the app frame holds every layout clear
 * of the status bar and the cutout, so one here would be counted twice.
 */
export function NavCompactHeader({ view, onNavigate }: NavProps) {
  const unreadMessages = useBadge("messages");
  const unreadNotifications = useBadge("notifications");

  return (
    <header className="nav-in-y relative z-20 flex shrink-0 items-center gap-1 border-b border-border px-2">
      <BrandMark />
      <div className="ml-auto flex items-center gap-1">
        <HeaderIcon
          id="messages"
          active={view === "messages"}
          badge={unreadMessages}
          onNavigate={onNavigate}
        />
        <HeaderIcon
          id="notifications"
          active={view === "notifications"}
          badge={unreadNotifications}
          onNavigate={onNavigate}
        />
      </div>
    </header>
  );
}

function HeaderIcon({
  id,
  active,
  badge,
  onNavigate,
}: {
  id: ViewId;
  active: boolean;
  badge: number;
  onNavigate: (view: ViewId) => void;
}) {
  const item = NAV_ITEMS.find((i) => i.id === id);
  if (!item) return null;
  const { Icon, label } = item;

  return (
    <button
      onClick={() => onNavigate(id)}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        // 44px, not the 32px the desktop toolbar uses: this is a thumb target.
        "relative flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[var(--motion-fast)]",
        active ? "text-brand" : "text-muted-foreground",
      )}
    >
      <Icon className="h-[22px] w-[22px]" />
      <Badge count={badge} className="absolute right-1 top-1.5" />
    </button>
  );
}

/**
 * Bottom tab bar, for phone-width windows.
 *
 * Not one of the three layout settings — it replaces whichever of them is chosen
 * when there is no room for it, because a 56px rail plus a 240px sidebar leaves a
 * phone nothing to read content in. Labels sit under the icons rather than beside
 * them so five tabs fit across a narrow screen, and the touch targets stay at the
 * 48px Android asks for even though the labels are small.
 *
 * `pb-safe` rather than an inset on the app frame: the bar's *background* has to
 * reach the bottom of the screen and run under the translucent gesture bar, and
 * only its labels lift clear of it. Padding the frame instead ended the bar 24px
 * early and left a band of bare window below it.
 *
 * Built from `panel panel-chrome`, the same surface the player bar above it
 * uses, and not from utilities of its own. It used to carry `bg-card/80
 * backdrop-blur-lg`, which is a hardcoded translucency outside the theme system
 * — so it blurred whether or not the user had asked for blur, while the player
 * two pixels above it obeyed the setting and stayed opaque. The result was two
 * touching strips of chrome in two different greys with a seam between them,
 * which is what made the bottom of the app look broken rather than designed.
 *
 * `border-x-0 border-b-0` for the same reason the player bar does it: these are
 * edges of the window, not of a card.
 */
export function NavBottom({ view, onNavigate }: NavProps) {
  return (
    <nav className="nav-in-y panel panel-chrome pb-safe flex shrink-0 items-stretch rounded-none border-x-0 border-b-0">
      {COMPACT_NAV_ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          aria-current={view === id ? "page" : undefined}
          data-nav-item="bottom"
          className={cn(
            "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition-colors duration-[var(--motion-fast)]",
            view === id ? "text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="nav-marker" aria-hidden />
          <Icon className="h-[22px] w-[22px] shrink-0" />
          <span className="label w-full truncate text-center text-[10px] leading-tight">
            {label}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** Wide column with the playlist list inline, closest to Spotify. */
export function NavSidebar({ view, onNavigate }: NavProps) {
  const playlists = useLibraryStore((s) => s.ownPlaylists);
  const liked = useLibraryStore((s) => s.likedPlaylists);
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const all = [...playlists.items, ...liked.items];

  return (
    <nav className="nav-in-x flex h-full w-60 shrink-0 flex-col gap-1 border-r border-border p-3">
      <BrandMark />
      <div className="mt-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <SidebarItem
            key={item.id}
            item={item}
            active={view === item.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>

      {all.length > 0 && (
        <>
          <div className="label mt-4 px-2.5 text-xs font-semibold text-muted-foreground">
            {t.library.playlists}
          </div>
          <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {all.map((playlist) => (
              <li key={playlist.id}>
                <button
                  onClick={() => openPlaylist(playlist)}
                  // `nav-sub` is the stylesheet's handle on this list, the way
                  // `label` is on the nav items above it: the only rows in the
                  // sidebar carrying user text rather than our own.
                  className="nav-sub w-full truncate rounded-[var(--radius)] px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent/60 hover:text-foreground"
                >
                  {playlist.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

function SidebarItem({
  item: { id, label, Icon },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      data-nav-item="side"
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-[var(--radius)] px-2.5 text-sm transition-colors duration-[var(--motion-fast)]",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <span className="nav-marker" aria-hidden />
      <Icon className="h-[18px] w-[18px]" />
      <span className="label">{label}</span>
      <Badge count={badge} className="ml-auto" />
    </button>
  );
}

/**
 * The wordmark. Goes home, the way a logo in the top-left is expected to.
 *
 * `compact` is the rail's version: the glyph alone while the rail is 56px, with
 * the word arriving when it widens — on the same delayed fade the item labels
 * use, for the same reason. The word heads a column of labels, so it starts
 * where they start rather than where the glyph happens to end; see the gap
 * below.
 *
 * Clicking it repeatedly is not entirely without consequence.
 */
function BrandMark({ compact = false }: { compact?: boolean }) {
  const bump = useEasterEgg();
  const setView = useNavStore((s) => s.setView);
  return (
    <button
      onClick={() => {
        setView("home");
        bump();
      }}
      data-brand-mark
      className={cn(
        "flex h-10 shrink-0 items-center text-left",
        // In the rail the mark is centred on the icons' axis, not aligned to
        // their left edge: it is 30px wide against their 18px, so sharing an
        // edge puts its weight 6px to the right of the column. That axis is
        // 27px from the rail's edge (8px rail padding + 10px button padding +
        // half an 18px icon), so a 30px mark starts 4px in. Fixed padding, not
        // centring, because the rail widens to 192px on hover.
        //
        // That arithmetic is this rail's, and a skin that changes the rail has
        // to answer for it: Nit's is 88px wide with the icons centred in it, so
        // the mark would sit 25px to the left of the column it is meant to head.
        // It re-centres the mark in `globals.css` rather than adding a second
        // number here — see `[data-brand-mark]`.
        //
        // The 6px gap continues the same sum. A label starts 48px from the
        // rail's edge (8 + 10 + an 18px icon + a 12px gap) and the 30px mark
        // ends at 42, so six pixels put the word on the labels' own left edge.
        compact ? "gap-1.5 pl-1" : "gap-2 px-2.5",
      )}
      aria-label="cloudify"
    >
      <Logo compact={compact} />
      {compact && (
        // Uncovered on the same wipe as an item's label, so the whole column of
        // text arrives as one motion. Hidden outright under Nit, whose rail
        // never widens and centres this button's whole content — an unpainted
        // word there would still push the glyph off the axis.
        <LogoWord className="whitespace-nowrap rail-wipe group-hover/rail:rail-wipe-open" />
      )}
    </button>
  );
}

/** Wordmark clicks. Seven of them do something; that is all you get told. */
function useEasterEgg() {
  return () => {
    const root = document.documentElement;
    const count = Number(root.dataset.spin ?? "0") + 1;
    root.dataset.spin = String(count);
    if (count < 7) return;
    root.dataset.spin = "0";
    root.animate(
      [{ filter: "hue-rotate(0deg)" }, { filter: "hue-rotate(360deg)" }],
      { duration: 1400, easing: "ease-in-out" },
    );
  };
}
