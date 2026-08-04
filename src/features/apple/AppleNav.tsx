import { Glass } from "./Glass";
import {
  AppleBell,
  AppleEnvelope,
  AppleGear,
  AppleHouse,
  AppleMagnifier,
  ApplePersonCircle,
  AppleSquareStack,
  type Glyph,
} from "./icons";
import { Logo } from "@/components/Logo";
import {
  COMPACT_NAV_ITEMS,
  NAV_ITEMS,
  type ViewId,
} from "@/components/shell/nav-items";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useMessagesStore } from "@/stores/useMessagesStore";
import { useNotificationsStore } from "@/stores/useNotificationsStore";
import { useNavStore } from "@/stores/useNavStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Navigation, the way iPadOS 26 and Tahoe do it: a glass sidebar floating
 * inside the window on a wide screen, a floating glass dock on a narrow one.
 *
 * Neither touches the window's edge. That is the structural change in iOS 26 —
 * chrome stopped being a strip welded to the frame and became an object lying
 * over the content, which is why the wallpaper reads all the way round it.
 */

interface NavProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
}

/**
 * The section glyphs, in SF Symbols' idiom rather than lucide's.
 *
 * Keyed off the shared `NAV_ITEMS` rather than replacing it, so the sections,
 * their order and their labels stay in one place — this only swaps the drawing.
 */
const GLYPHS: Record<ViewId, Glyph> = {
  home: AppleHouse,
  search: AppleMagnifier,
  library: AppleSquareStack,
  messages: AppleEnvelope,
  notifications: AppleBell,
  profile: ApplePersonCircle,
  settings: AppleGear,
};

/** The wordmark, which goes home like a logo in the corner should. */
function HomeMark({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const setView = useNavStore((s) => s.setView);
  return (
    <button onClick={() => setView("home")} aria-label="cloudify" className={className}>
      {children}
    </button>
  );
}

/** Unread count for a section; 0 for the ones that never carry one. */
function useBadge(id: ViewId): number {
  const messages = useMessagesStore((s) => s.unread);
  const notifications = useNotificationsStore((s) => s.unreadCount());
  if (id === "messages") return messages;
  if (id === "notifications") return notifications;
  return 0;
}

/**
 * The red count iOS puts on a tab.
 *
 * Deliberately `--ios-red` rather than the accent: on Apple's platforms a
 * badge is always red, whatever the app's tint, and an orange one reads as a
 * decoration instead of as a number that wants attention.
 */
function AppleBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-[5px] text-[11px] font-semibold leading-none text-white",
        className,
      )}
      style={{ background: "var(--ios-red)" }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * The rail: the sidebar collapsed to its glyphs, widening under the pointer.
 *
 * iPadOS collapses its sidebar to exactly this column of glyphs. The
 * widen-on-hover is a desktop affordance on top of it, and the rail **takes the
 * width** while it is open rather than floating over the content — an absolutely
 * positioned panel avoided the reflow but read as one layer climbing over
 * another, which is worse than the reflow it was avoiding.
 *
 * The icon sits in a box exactly as wide as the collapsed rail's content, so the
 * selected pill is symmetrical around it. Left to the flex row, the label — which
 * is present but transparent when collapsed — pushed the icon off-centre and the
 * highlight ran further to the right of the glyph than to the left of it.
 *
 * Each label fades in only after the width has finished travelling. Cross-fading
 * it with the growth paints the text half-clipped, which is the thing that makes
 * a widening rail feel cheap.
 */
export function AppleRail({ view, onNavigate }: NavProps) {
  return (
    <Glass className="group/rail nav-in-x flex w-[4.25rem] shrink-0 flex-col gap-1 overflow-hidden p-2.5 transition-[width] duration-[var(--motion-slow)] hover:w-[13.5rem]">
      <HomeMark className="mb-2 flex h-10 w-12 shrink-0 items-center justify-center">
        <Logo compact />
      </HomeMark>

      {NAV_ITEMS.map((item) => (
        <AppleRailItem
          key={item.id}
          item={item}
          active={view === item.id}
          onNavigate={onNavigate}
        />
      ))}
    </Glass>
  );
}

function AppleRailItem({
  item: { id, label },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const Icon = GLYPHS[id];
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      title={label}
      aria-current={active ? "page" : undefined}
      className="lg-nav-item flex h-11 shrink-0 items-center text-[0.9375rem]"
    >
      <span className="relative flex w-12 shrink-0 items-center justify-center">
        <Icon className="h-[21px] w-[21px]" />
        {/* On the glyph, not at the row's end: the rail widens on hover and a
            trailing badge would slide across with it. */}
        <AppleBadge count={badge} className="absolute -right-0.5 -top-1" />
      </span>
      <span className="whitespace-nowrap pr-3 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/rail:opacity-100 group-hover/rail:delay-[var(--motion-slow)]">
        {label}
      </span>
    </button>
  );
}

/**
 * The top bar: a floating glass toolbar with the sections along it.
 *
 * The macOS 26 shape — a bar that sits inside the window with the content
 * passing under it — rather than a title bar welded to the frame. Settings goes
 * to the right, where a toolbar's utility items live.
 */
export function AppleTopBar({ view, onNavigate }: NavProps) {
  return (
    <Glass
      chrome
      capsule
      className="nav-in-y flex h-14 shrink-0 items-center gap-1 px-3"
    >
      <HomeMark className="mr-2 shrink-0 px-1">
        <Logo />
      </HomeMark>

      {NAV_ITEMS.filter((i) => i.id !== "settings").map((item) => (
        <AppleTopItem
          key={item.id}
          item={item}
          active={view === item.id}
          onNavigate={onNavigate}
        />
      ))}

      <button
        onClick={() => onNavigate("settings")}
        title={t.nav.settings}
        aria-label={t.nav.settings}
        aria-current={view === "settings" ? "page" : undefined}
        className="lg-nav-item ml-auto flex h-9 w-9 shrink-0 items-center justify-center"
      >
        <AppleGear className="h-[18px] w-[18px]" />
      </button>
    </Glass>
  );
}

function AppleTopItem({
  item: { id, label },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const Icon = GLYPHS[id];
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      className="lg-nav-item flex shrink-0 items-center gap-2 px-3 py-1.5 text-[0.9375rem]"
    >
      <Icon className="h-[18px] w-[18px]" />
      <span>{label}</span>
      <AppleBadge count={badge} />
    </button>
  );
}

/** The sidebar. Sections as pills, then the user's playlists under them. */
export function AppleSidebar({ view, onNavigate }: NavProps) {
  const playlists = useLibraryStore((s) => s.ownPlaylists);
  const liked = useLibraryStore((s) => s.likedPlaylists);
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const all = [...playlists.items, ...liked.items];

  return (
    <Glass className="nav-in-x flex w-[15rem] shrink-0 flex-col gap-0.5 p-3">
      <HomeMark className="mb-2 px-2">
        <Logo />
      </HomeMark>

      {NAV_ITEMS.map((item) => (
        <AppleSidebarItem
          key={item.id}
          item={item}
          active={view === item.id}
          onNavigate={onNavigate}
        />
      ))}

      {all.length > 0 && (
        <>
          {/* A sidebar heading in iOS is quiet and sits above its group, the
              same inversion the settings page uses. */}
          <div className="mt-5 px-2.5 pb-1 text-[0.8125rem] text-[var(--ios-label-2)]">
            {t.library.playlists}
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
            {all.map((playlist) => (
              <li key={playlist.id}>
                <button
                  onClick={() => openPlaylist(playlist)}
                  className="lg-nav-item w-full truncate px-2.5 py-1.5 text-left text-[0.9375rem]"
                >
                  {playlist.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Glass>
  );
}

function AppleSidebarItem({
  item: { id, label },
  active,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const Icon = GLYPHS[id];
  const badge = useBadge(id);

  return (
    <button
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      className="lg-nav-item flex h-9 shrink-0 items-center gap-3 px-2.5 text-[0.9375rem]"
    >
      <Icon className="h-[19px] w-[19px] shrink-0" />
      <span className="truncate">{label}</span>
      <AppleBadge count={badge} className="ml-auto" />
    </button>
  );
}

/**
 * The dock, for a narrow window.
 *
 * A capsule, floating clear of the bottom edge, with the content scrolling
 * behind it. Labels stay — iOS 26's own tab bars kept them — at the 10px they
 * are on the device, and the current tab is the accent rather than a brighter
 * grey.
 */
export function AppleDock({ view, onNavigate }: NavProps) {
  return (
    <Glass
      chrome
      capsule
      className="nav-in-y flex items-stretch gap-0.5 p-1.5"
    >
      {COMPACT_NAV_ITEMS.map(({ id, label }) => {
        const Icon = GLYPHS[id];
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            aria-current={view === id ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1",
              view === id ? "text-brand" : "text-[var(--ios-label-2)]",
            )}
          >
            <Icon className="h-[22px] w-[22px] shrink-0" />
            <span className="w-full truncate text-center text-[10px] leading-tight">
              {label}
            </span>
          </button>
        );
      })}
    </Glass>
  );
}
