import { ListMusic } from "lucide-react";
import type { Playlist } from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { ShareButton } from "./ShareButton";
import { useIncremental } from "@/hooks/useIncremental";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";
import { ArtFallback } from "./ArtFallback";

/** Playlists and albums; a click drills into the playlist's tracks. */
export function PlaylistList({ playlists }: { playlists: Playlist[] }) {
  const openPlaylist = useNavStore((s) => s.openPlaylist);
  const { visible, sentinel, hasMore } = useIncremental(playlists, 40);

  // No rules between rows, and no card around them — the same change the track
  // list made, for the same reason: forty hairlines draw a table nobody asked
  // for, and the covers are structure enough. Rows separate themselves by the
  // fill that appears under the pointer.
  return (
    <ul className="flex flex-col gap-0.5">
      {visible.map((playlist, index) => {
        const art = artwork(playlist.artwork_url);
        // The row and the share action are siblings, not nested buttons —
        // which would be invalid, and unclickable.
        return (
          <li
            key={playlist.id}
            // The index drives the stagger; capped, because a delay long enough
            // to notice on item forty is a list that takes a second to appear.
            style={{ "--i": Math.min(index, 14) } as React.CSSProperties}
            className="rise-in group/row flex items-center rounded-[var(--radius-control)] bg-row pr-2 transition-colors duration-[var(--motion-fast)] hover:bg-accent"
          >
            <button
              onClick={() => openPlaylist(playlist)}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
            >
              {art ? (
                <span className="art-frame block h-12 w-12 shrink-0 rounded-[var(--radius-control)]">
                  <img
                    src={art}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="artwork h-12 w-12 object-cover"
                  />
                </span>
              ) : (
                <ArtFallback
                  seed={playlist.id}
                  Glyph={ListMusic}
                  className="h-12 w-12 shrink-0 rounded-[var(--radius-control)]"
                />
              )}
              <div className="flex min-w-0 flex-col">
                <span className="type-body truncate">
                  {playlist.title}
                </span>
                <span className="type-label truncate text-muted-foreground">
                  {playlist.is_album ? t.library.album : t.library.playlist}
                  {playlist.owner && ` · ${playlist.owner}`}
                </span>
              </div>
              <span className="type-caption ml-auto shrink-0 text-muted-foreground">
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
