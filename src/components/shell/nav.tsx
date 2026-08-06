import { Settings } from "lucide-react";
import { Logo } from "@/components/Logo";
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
    <div className="nav-in-x relative h-full w-14 shrink-0">
      <nav className="group/rail panel absolute inset-y-0 left-0 z-20 flex w-14 flex-col gap-1 overflow-hidden rounded-none border-y-0 border-l-0 p-2 transition-[width] duration-[var(--motion-slow)] hover:w-48">
        <BrandMark compact />
        {NAV_ITEMS.map((item) => (
          <RailItem
            key={item.id}
            item={item}
            active={view === item.id}
            onNavigate={onNavigate}
          />
        ))}
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
      {/* Fades in only after the width has finished travelling, so the
          label is never painted half-clipped. */}
      <span className="label whitespace-nowrap opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/rail:opacity-100 group-hover/rail:delay-[var(--motion-slow)]">
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
 * `pt-safe` because `MainActivity` draws edge to edge and this is the topmost
 * thing on the screen.
 */
export function NavCompactHeader({ view, onNavigate }: NavProps) {
  const unreadMessages = useBadge("messages");
  const unreadNotifications = useBadge("notifications");

  return (
    <header className="nav-in-y pt-safe relative z-20 flex shrink-0 items-center gap-1 border-b border-border px-2">
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
 * `pb-safe` keeps the tabs clear of the gesture bar; see `styles`.
 */
export function NavBottom({ view, onNavigate }: NavProps) {
  return (
    <nav className="nav-in-y pb-safe flex shrink-0 items-stretch border-t border-border bg-card/80 backdrop-blur-lg">
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
                  className="w-full truncate rounded-[var(--radius)] px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent/60 hover:text-foreground"
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
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 text-left",
        // In the rail the mark is centred on the icons' axis, not aligned to
        // their left edge: it is 30px wide against their 18px, so sharing an
        // edge puts its weight 6px to the right of the column. That axis is
        // 27px from the rail's edge (8px rail padding + 10px button padding +
        // half an 18px icon), so a 30px mark starts 4px in. Fixed padding, not
        // centring, because the rail widens to 192px on hover.
        compact ? "pl-1" : "px-2.5",
      )}
      aria-label="cloudify"
    >
      <Logo compact={compact} />
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
