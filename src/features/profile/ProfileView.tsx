import { useEffect, useState } from "react";
import { ExternalLink, User as UserIcon } from "lucide-react";
import { scGetUserTracks, type Me, type Track } from "@/lib/tauri";
import { PlaylistTile, TileGrid } from "@/components/ArtTile";
import { TrackList } from "@/components/TrackList";
import { UserList } from "@/components/UserList";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type Tab = "tracks" | "playlists" | "likes" | "following";

/** Compact number formatting: 12500 → 12.5K. */
function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function ProfileView({ me }: { me: Me }) {
  const [tab, setTab] = useState<Tab>("tracks");
  const [uploads, setUploads] = useState<Track[]>([]);

  const likes = useLibraryStore((s) => s.likes);
  const own = useLibraryStore((s) => s.ownPlaylists);
  const followings = useLibraryStore((s) => s.followings);
  const loadLikes = useLibraryStore((s) => s.loadLikes);
  const loadPlaylists = useLibraryStore((s) => s.loadPlaylists);
  const loadFollowings = useLibraryStore((s) => s.loadFollowings);

  useEffect(() => {
    void loadLikes(me.id);
    void loadPlaylists(me.id);
    void loadFollowings(me.id);
  }, [me.id, loadLikes, loadPlaylists, loadFollowings]);

  useEffect(() => {
    let cancelled = false;
    scGetUserTracks(me.id)
      .then((tracks) => !cancelled && setUploads(tracks))
      .catch(() => !cancelled && setUploads([]));
    return () => {
      cancelled = true;
    };
  }, [me.id]);

  const avatar = artwork(me.avatar_url, "t300x300");

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "tracks", label: t.profile.tracks, count: uploads.length },
    { id: "playlists", label: t.library.playlists, count: own.items.length },
    { id: "likes", label: t.library.likes, count: likes.items.length },
    { id: "following", label: t.library.following, count: followings.items.length },
  ];

  return (
    <div className="stack-lg">
      {/* Header — the cover is the avatar, blown up and blurred behind it. */}
      <section className="panel panel-raised relative overflow-hidden rounded-[var(--radius-hero)]">
        {avatar && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-25 blur-2xl"
            style={{ backgroundImage: `url("${avatar}")` }}
          />
        )}
        <div className="relative flex flex-wrap items-end gap-5 p-6">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-28 w-28 shrink-0 rounded-full object-cover shadow-[var(--shadow-2)]"
            />
          ) : (
            <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-secondary">
              <UserIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="label text-xs font-semibold text-muted-foreground">
              {t.profile.you}
            </div>
            <h1
              className="truncate text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {me.username}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span>
                <b className="text-foreground">{formatCount(me.followers_count)}</b>{" "}
                {t.auth.followers}
              </span>
              <span>
                <b className="text-foreground">{formatCount(uploads.length)}</b>{" "}
                {t.profile.tracks}
              </span>
              <span>
                <b className="text-foreground">{formatCount(likes.items.length)}</b>{" "}
                {t.library.likes}
              </span>
              {me.permalink_url && (
                <a
                  href={me.permalink_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors duration-[var(--motion-fast)] hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  SoundCloud
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav className="flex gap-4 border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              tab === item.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="label">{item.label}</span>
            {item.count > 0 && (
              <span className="text-xs text-muted-foreground">{item.count}</span>
            )}
          </button>
        ))}
      </nav>

      {tab === "tracks" &&
        (uploads.length > 0 ? (
          <TrackList tracks={uploads} />
        ) : (
          <p className="text-sm text-muted-foreground">{t.profile.noTracks}</p>
        ))}

      {tab === "playlists" &&
        (own.items.length > 0 ? (
          <TileGrid>
            {own.items.map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </TileGrid>
        ) : (
          <p className="text-sm text-muted-foreground">{t.library.noPlaylists}</p>
        ))}

      {tab === "likes" &&
        (likes.items.length > 0 ? (
          <TrackList tracks={likes.items} />
        ) : (
          <p className="text-sm text-muted-foreground">{t.library.empty}</p>
        ))}

      {tab === "following" &&
        (followings.items.length > 0 ? (
          <UserList users={followings.items} />
        ) : (
          <p className="text-sm text-muted-foreground">{t.library.noFollowing}</p>
        ))}
    </div>
  );
}
