import { useEffect } from "react";
import {
  Download,
  ExternalLink,
  Heart,
  Link as LinkIcon,
  ListEnd,
  ListPlus,
  ListStart,
  Radio,
} from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";

/** Where a context menu was opened, in viewport coordinates. */
export interface MenuTarget {
  track: Track;
  x: number;
  y: number;
}

/** Menu width, used to keep it on screen near the right edge. */
const WIDTH = 224;
const ESTIMATED_HEIGHT = 260;

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
  const addNext = usePlayerStore((s) => s.addNext);
  const addLast = usePlayerStore((s) => s.addLast);
  const startRadio = usePlayerStore((s) => s.startRadio);
  const downloadedIds = useDownloadsStore((s) => s.ids);
  const startDownload = useDownloadsStore((s) => s.start);
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const liked = useLibraryStore((s) => s.likedIds.has(target.track.id));

  const { track } = target;
  const isDownloaded = downloadedIds.has(track.id);

  useEffect(() => {
    const close = () => onClose();
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

  // Flip near the edges so the menu is always fully visible.
  const left = Math.min(target.x, window.innerWidth - WIDTH - 8);
  const top = Math.min(target.y, window.innerHeight - ESTIMATED_HEIGHT);

  function run(action: () => void) {
    action();
    onClose();
  }

  return (
    <div
      className="panel panel-raised fixed z-[80] flex w-56 flex-col p-1"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      role="menu"
    >
      <Item
        Icon={Heart}
        label={liked ? t.track.unlike : t.track.like}
        onClick={() => run(() => void toggleLike(track))}
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
            onClick={() =>
              run(() => {
                void navigator.clipboard.writeText(track.permalink_url!);
                toast(t.track.linkCopied, "success");
              })
            }
          />
          <Item
            Icon={ExternalLink}
            label={t.track.openOnSc}
            onClick={() =>
              run(() => window.open(track.permalink_url!, "_blank"))
            }
          />
        </>
      )}
    </div>
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
