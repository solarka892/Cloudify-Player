import { Repeat2 } from "lucide-react";
import type { Playlist, Track } from "@/lib/tauri";
import { useRepostStore } from "@/stores/useRepostStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The repost arrows, for a track or a playlist.
 *
 * Optimistic in the same way the heart is: the store flips the icon at once
 * and rolls back if SoundCloud refuses.
 */
export function RepostButton({
  track,
  playlist,
  size = "sm",
  className,
}: {
  track?: Track;
  playlist?: Playlist;
  size?: "sm" | "md";
  className?: string;
}) {
  const trackIds = useRepostStore((s) => s.trackIds);
  const playlistIds = useRepostStore((s) => s.playlistIds);
  const toggleTrack = useRepostStore((s) => s.toggleTrack);
  const togglePlaylist = useRepostStore((s) => s.togglePlaylist);

  const on = track ? trackIds.has(track.id) : !!playlist && playlistIds.has(playlist.id);
  const icon = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <button
      onClick={(e) => {
        // Repost buttons sit inside rows that are themselves play buttons.
        e.stopPropagation();
        const action = track
          ? toggleTrack(track)
          : playlist
            ? togglePlaylist(playlist)
            : null;
        void action?.catch(() => toast(t.track.repostFailed, "error"));
      }}
      aria-label={on ? t.track.unrepost : t.track.repost}
      title={on ? t.track.unrepost : t.track.repost}
      className={cn(
        "shrink-0 rounded-[var(--radius-round)] p-1.5 transition-[color,transform] duration-[var(--motion-fast)] hover:scale-110 active:scale-90",
        on ? "text-brand" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Repeat2 className={icon} />
    </button>
  );
}
