import { ListMusic } from "lucide-react";
import type { Playlist } from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { ShareButton } from "./ShareButton";
import { useIncremental } from "@/hooks/useIncremental";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";

/** Playlists and albums; a click drills into the playlist's tracks. */
export function PlaylistList({ playlists }: { playlists: Playlist[] }) {
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const { visible, sentinel, hasMore } = useIncremental(playlists, 40);

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
      {visible.map((playlist) => {
        const art = artwork(playlist.artwork_url);
        // The row and the share action are siblings, not nested buttons —
        // which would be invalid, and unclickable.
        return (
          <li
            key={playlist.id}
            className="group/row flex items-center bg-row pr-2 transition-[background-color] duration-[var(--motion-fast)] hover:bg-accent"
          >
            <button
              onClick={() => openPlaylist(playlist)}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
            >
              {art ? (
                <img
                  src={art}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-10 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary">
                  <ListMusic className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {playlist.title}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {playlist.is_album ? t.library.album : t.library.playlist}
                  {playlist.owner && ` · ${playlist.owner}`}
                </span>
              </div>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {playlist.track_count} {t.library.tracksShort}
              </span>
            </button>
            <ShareButton
              url={playlist.permalink_url}
              className="opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/row:opacity-100"
            />
          </li>
        );
      })}
      {hasMore && <div ref={sentinel} className="h-8" aria-hidden />}
    </ul>
  );
}
