import { ListMusic } from "lucide-react";
import type { Playlist } from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";

/** Playlists and albums; a click drills into the playlist's tracks. */
export function PlaylistList({ playlists }: { playlists: Playlist[] }) {
  const openPlaylist = useNavStore((s) => s.openPlaylist);

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {playlists.map((playlist) => {
        const art = artwork(playlist.artwork_url);
        return (
          <li key={playlist.id}>
            <button
              onClick={() => openPlaylist(playlist)}
              className="flex w-full items-center gap-3 bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              {art ? (
                <img
                  src={art}
                  alt=""
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
          </li>
        );
      })}
    </ul>
  );
}
