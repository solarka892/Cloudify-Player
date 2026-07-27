import { Settings } from "lucide-react";
import { Logo } from "@/components/Logo";
import { NAV_ITEMS, type ViewId } from "./nav-items";
import { useLibraryStore } from "@/stores/useLibraryStore";
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

interface NavProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
}

/** Icon-only column. Widens to show labels on hover. */
export function NavRail({ view, onNavigate }: NavProps) {
  return (
    <nav className="group/rail flex h-full w-14 shrink-0 flex-col gap-1 overflow-hidden border-r border-border p-2 transition-[width] duration-[var(--motion-slow)] hover:w-48">
      <BrandMark compact />
      {NAV_ITEMS.map(({ id, label, Icon }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          title={label}
          className={cn(
            "flex h-10 shrink-0 items-center gap-3 rounded-md px-2.5 text-sm transition-colors duration-[var(--motion-fast)]",
            view === id
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="h-[18px] w-[18px] shrink-0" />
          <span className="label truncate opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/rail:opacity-100">
            {label}
          </span>
        </button>
      ))}
    </nav>
  );
}

/** Horizontal tabs across the top, closest to soundcloud.com. */
export function NavTop({ view, onNavigate }: NavProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-4">
      <BrandMark />
      <div className="ml-4 flex items-center gap-1">
        {NAV_ITEMS.filter((i) => i.id !== "settings").map(
          ({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
                view === id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="label">{label}</span>
            </button>
          ),
        )}
      </div>
      <button
        onClick={() => onNavigate("settings")}
        title={t.nav.settings}
        className={cn(
          "ml-auto rounded-md p-2 transition-colors duration-[var(--motion-fast)]",
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

/** Wide column with the playlist list inline, closest to Spotify. */
export function NavSidebar({ view, onNavigate }: NavProps) {
  const playlists = useLibraryStore((s) => s.ownPlaylists);
  const liked = useLibraryStore((s) => s.likedPlaylists);
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const all = [...playlists.items, ...liked.items];

  return (
    <nav className="flex h-full w-60 shrink-0 flex-col gap-1 border-r border-border p-3">
      <BrandMark />
      <div className="mt-2 flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors duration-[var(--motion-fast)]",
              view === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
            <span className="label">{label}</span>
          </button>
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
                  className="w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent/60 hover:text-foreground"
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

/** The wordmark. Clicking it repeatedly is not entirely without consequence. */
function BrandMark({ compact = false }: { compact?: boolean }) {
  const bump = useEasterEgg();
  return (
    <button
      onClick={bump}
      className="flex h-10 shrink-0 items-center gap-2 px-1.5 text-left"
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
