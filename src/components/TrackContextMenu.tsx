import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ExternalLink,
  Heart,
  Info,
  Link as LinkIcon,
  ListEnd,
  ListPlus,
  ListStart,
  Radio,
  Repeat2,
} from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useNavStore } from "@/stores/useNavStore";
import { useRepostStore } from "@/stores/useRepostStore";
import { toast } from "@/stores/useToastStore";
import { copyLink } from "@/lib/share";
import { openExternal } from "@/lib/open";
import { t } from "@/i18n";

/** Where a context menu was opened, in viewport coordinates. */
export interface MenuTarget {
  track: Track;
  x: number;
  y: number;
  /**
   * What `x`/`y` are.
   *
   * `"pointer"` — a right-click. The menu's top-left corner goes exactly there,
   * which is what every desktop does.
   *
   * `"beside"` — a button was pressed, and `x`/`y` are its right edge and its
   * top. The menu opens *next to* it: a hair to the right, tops level. This is
   * not the same as dropping a corner at the button's bottom-right, which is
   * what it used to do — that puts the menu diagonally away from what was
   * pressed, and diagonal reads as far even when it is a few pixels.
   */
  align?: "pointer" | "beside";
}

/** Menu width, used to keep it on screen near the right edge. */
const WIDTH = 224;
/** Ten rows, three rules and the padding. Only used to keep it on screen. */
const ESTIMATED_HEIGHT = 364;
/** Daylight between the button and the menu it opened.
 *
 * The menu's business, not the caller's: a caller hands over the edge of the
 * thing that was pressed and should not have to know how far a menu likes to
 * sit from it. A right-click gets none of it — there the corner belongs at the
 * pointer, exactly. */
const GAP = 6;
/** And between the menu and the window's edge. */
const MARGIN = 8;

/** Right-click menu for a track row or tile. */
export function TrackContextMenu({
  target,
  onClose,
  onAddToPlaylist,
}: {
  target: MenuTarget;
  onClose: () => void;
  onAddToPlaylist: (track: Track) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const addNext = usePlayerStore((s) => s.addNext);
  const addLast = usePlayerStore((s) => s.addLast);
  const startRadio = usePlayerStore((s) => s.startRadio);
  const downloadedIds = useDownloadsStore((s) => s.ids);
  const startDownload = useDownloadsStore((s) => s.start);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const liked = useLibraryStore((s) => s.likedIds.has(target.track.id));
  const toggleRepost = useRepostStore((s) => s.toggleTrack);
  const reposted = useRepostStore((s) => s.trackIds.has(target.track.id));
  const openTrack = useNavStore((s) => s.openTrack);

  const { track } = target;
  const isDownloaded = downloadedIds.has(track.id);

  useEffect(() => {
    const close = (e: Event) => {
      // A click inside the menu is a menu click; the items close it themselves
      // once they have run. Asked of the node rather than stopped on the way
      // up, because the menu is portalled out of the React tree it belongs to
      // and `stopPropagation` there no longer reaches this listener.
      if (e.type === "click" && root.current?.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    // Capture phase: a scroll inside any container should dismiss it too.
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);

  // Anchor first, then keep it on screen. Clamped at both ends, not just the
  // far one: a right-aligned menu near the left edge would otherwise be placed
  // at a negative offset and lose its first characters off the side.
  const beside = target.align === "beside";
  const left = Math.max(
    MARGIN,
    Math.min(beside ? target.x + GAP : target.x, window.innerWidth - WIDTH - MARGIN),
  );
  const top = Math.max(
    MARGIN,
    Math.min(target.y, window.innerHeight - ESTIMATED_HEIGHT - MARGIN),
  );

  function run(action: () => void) {
    action();
    onClose();
  }

  /*
   * Portalled to `<body>`, and this is not tidiness — it is the whole reason
   * the menu was landing a hundred pixels from the button that opened it.
   *
   * `position: fixed` is measured against the viewport only while no ancestor
   * has a `transform`, a `filter` or a `backdrop-filter`. Any of the three makes
   * that ancestor the containing block instead. Apple mode's content pane is
   * frosted glass, so it has one — and every `fixed` overlay rendered inside it
   * silently started measuring from the pane's top-left corner, which is exactly
   * the rail's width plus the gap: 100px across, 13 down. The numbers handed in
   * here come from `getBoundingClientRect`, which is always the viewport's, so
   * the two disagreed by precisely that.
   *
   * Out on `<body>` there is no such ancestor and the two agree again. It also
   * takes the menu out of the tile it belongs to, so a hovered tile's transform
   * cannot drag it about either.
   */
  return createPortal(
    <div
      ref={root}
      className="panel panel-raised pop-in fixed z-[80] flex w-56 flex-col p-1"
      style={{ left, top }}
      role="menu"
    >
      <Item
        Icon={Info}
        label={t.track.openTrack}
        onClick={() => run(() => openTrack(track))}
      />

      <div className="my-1 h-px bg-border" />

      <Item
        Icon={Heart}
        label={liked ? t.track.unlike : t.track.like}
        onClick={() => run(() => void toggleLike(track))}
      />
      <Item
        Icon={Repeat2}
        label={reposted ? t.track.unrepost : t.track.repost}
        onClick={() =>
          run(() =>
            void toggleRepost(track).catch(() =>
              toast(t.track.repostFailed, "error"),
            ),
          )
        }
      />
      <Item
        Icon={ListPlus}
        label={t.track.addToPlaylist}
        onClick={() => run(() => onAddToPlaylist(track))}
      />

      <div className="my-1 h-px bg-border" />

      <Item
        Icon={ListStart}
        label={t.track.playNext}
        onClick={() => run(() => addNext(track))}
      />
      <Item
        Icon={ListEnd}
        label={t.track.addToQueue}
        onClick={() => run(() => addLast(track))}
      />
      <Item
        Icon={Radio}
        label={t.track.startRadio}
        onClick={() => run(() => void startRadio(track))}
      />

      <div className="my-1 h-px bg-border" />

      <Item
        Icon={Download}
        label={isDownloaded ? t.track.downloaded : t.track.download}
        disabled={isDownloaded}
        onClick={() => run(() => void startDownload(track))}
      />

      {track.permalink_url && (
        <>
          <Item
            Icon={LinkIcon}
            label={t.track.copyLink}
            onClick={() => run(() => void copyLink(track.permalink_url!))}
          />
          <Item
            Icon={ExternalLink}
            label={t.track.openOnSc}
            onClick={() =>
              run(() => void openExternal(track.permalink_url!))
            }
          />
        </>
      )}
    </div>,
    document.body,
  );
}

function Item({
  Icon,
  label,
  onClick,
  disabled = false,
}: {
  Icon: typeof Radio;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      {label}
    </button>
  );
}
