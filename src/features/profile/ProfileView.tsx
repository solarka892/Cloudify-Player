import { useEffect, useRef, useState } from "react";
import { BadgeCheck, ExternalLink, MapPin, User as UserIcon } from "lucide-react";
import {
  scGetFollowers,
  scGetFollowings,
  scGetLikes,
  scGetPlaylists,
  scGetProfile,
  scGetUserTracks,
  type Playlist,
  type Profile,
  type Track,
  type User,
} from "@/lib/tauri";
import { PlaylistList } from "@/components/PlaylistList";
import { TrackList } from "@/components/TrackList";
import { UserList } from "@/components/UserList";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { ShareButton } from "@/components/ShareButton";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type Tab = "tracks" | "playlists" | "likes" | "followers" | "following";

/** Compact number formatting: 12500 → 12.5K. */
function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

interface Loaded {
  tracks: Track[];
  playlists: Playlist[];
  likes: Track[];
  followers: User[];
  following: User[];
}

const EMPTY: Loaded = {
  tracks: [],
  playlists: [],
  likes: [],
  followers: [],
  following: [],
};

/**
 * A user page, for the signed-in user and for anyone else.
 *
 * Each tab fetches only when it is first opened — a profile with 50k followers
 * should not pay for that list unless someone asks to see it.
 */
export function ProfileView({
  userId,
  isSelf = false,
}: {
  userId: number;
  isSelf?: boolean;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("tracks");
  const [data, setData] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState<Tab | null>(null);
  /**
   * Which tabs have been fetched, whatever came back. Emptiness cannot stand in
   * for this: a tab that legitimately has nothing in it — the common case for
   * "tracks" on a listener's own profile — would be indistinguishable from one
   * that has not loaded, and the fetch would repeat without end.
   */
  const fetched = useRef(new Set<Tab>());

  const following = useLibraryStore((s) => s.followingIds.has(userId));
  const toggleFollow = useLibraryStore((s) => s.toggleFollow);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setData(EMPTY);
    setTab("tracks");
    fetched.current = new Set();
    scGetProfile(userId)
      .then((p) => !cancelled && setProfile(p))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Lazy per tab: fetch the first time a tab is shown, then keep it.
  useEffect(() => {
    let cancelled = false;
    if (fetched.current.has(tab)) return;
    fetched.current.add(tab);

    const fetcher: Record<Tab, () => Promise<Partial<Loaded>>> = {
      tracks: async () => ({ tracks: await scGetUserTracks(userId) }),
      playlists: async () => ({ playlists: await scGetPlaylists(userId) }),
      likes: async () => ({ likes: await scGetLikes(userId) }),
      followers: async () => ({ followers: await scGetFollowers(userId) }),
      following: async () => ({ following: await scGetFollowings(userId) }),
    };

    setLoading(tab);
    fetcher[tab]()
      .then((patch) => !cancelled && setData((d) => ({ ...d, ...patch })))
      // A tab that failed is worth another try when the user comes back to it.
      .catch(() => fetched.current.delete(tab))
      .finally(() => !cancelled && setLoading(null));

    return () => {
      cancelled = true;
    };
  }, [tab, userId]);

  const avatar = artwork(profile?.avatar_url ?? null, "t300x300");
  const banner = profile?.banner_url ?? null;

  const tabs: { id: Tab; label: string; count: number | null | undefined }[] = [
    { id: "tracks", label: t.profile.tracks, count: profile?.track_count },
    { id: "playlists", label: t.profile.playlists, count: profile?.playlist_count },
    { id: "likes", label: t.library.likes, count: profile?.likes_count },
  ];

  return (
    <div className="stack-lg">
      {/* Header: banner, avatar, identity, counts. */}
      <section className="panel panel-raised relative overflow-hidden rounded-[var(--radius-hero)]">
        {banner ? (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-40 bg-cover bg-center"
            style={{ backgroundImage: `url("${banner}")` }}
          />
        ) : (
          avatar && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-25 blur-2xl"
              style={{ backgroundImage: `url("${avatar}")` }}
            />
          )
        )}
        {banner && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-transparent to-[var(--card)]"
          />
        )}

        <div
          className={cn(
            "relative flex flex-wrap items-end gap-5 p-6",
            banner && "pt-28",
          )}
        >
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
              {isSelf ? t.profile.you : t.nav.profile}
            </div>
            <h1
              className="flex items-center gap-2 truncate text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {profile?.username ?? "…"}
              {profile?.verified && (
                <BadgeCheck className="h-5 w-5 shrink-0 text-brand" />
              )}
            </h1>

            {profile?.full_name && (
              <p className="text-sm text-muted-foreground">{profile.full_name}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <Stat
                value={profile?.followers_count}
                label={t.profile.followers}
                active={tab === "followers"}
                onClick={() => setTab("followers")}
              />
              <Stat
                value={profile?.followings_count}
                label={t.profile.following}
                active={tab === "following"}
                onClick={() => setTab("following")}
              />
              <Stat
                value={profile?.track_count}
                label={t.profile.tracks}
                active={tab === "tracks"}
                onClick={() => setTab("tracks")}
              />
              {(profile?.city || profile?.country_code) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {[profile.city, profile.country_code]
                    .filter(Boolean)
                    .join(", ")}
                </span>
              )}
              {profile?.permalink_url && (
                <a
                  href={profile.permalink_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 transition-colors duration-[var(--motion-fast)] hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  SoundCloud
                </a>
              )}
            </div>

            {profile?.description && (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
                {profile.description}
              </p>
            )}
          </div>

          {profile && (
            <ShareButton url={profile.permalink_url} withLabel className="self-start" />
          )}

          {!isSelf && profile && (
            <button
              onClick={() =>
                void toggleFollow({
                  id: profile.id,
                  username: profile.username,
                  avatar_url: profile.avatar_url,
                  permalink_url: profile.permalink_url,
                  followers_count: profile.followers_count,
                  track_count: profile.track_count,
                }).catch(() => toast(t.profile.followFailed, "error"))
              }
              className={cn(
                "shrink-0 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold transition-[opacity,transform] duration-[var(--motion-fast)] hover:opacity-90 active:scale-95",
                following
                  ? "border border-border bg-secondary text-secondary-foreground"
                  : "brand-gradient text-brand-foreground",
              )}
            >
              {following ? t.profile.unfollow : t.profile.follow}
            </button>
          )}
        </div>
      </section>

      <nav className="flex gap-4 overflow-x-auto border-b border-border">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-1 pb-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              tab === item.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="label">{item.label}</span>
            {item.count != null && item.count > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCount(item.count)}
              </span>
            )}
          </button>
        ))}
      </nav>

      {loading === tab && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {tab === "tracks" && data.tracks.length > 0 && (
        <>
          <div className="flex justify-end">
            <DownloadAllButton tracks={data.tracks} />
          </div>
          <TrackList tracks={data.tracks} />
        </>
      )}
      {tab === "tracks" && loading !== tab && data.tracks.length === 0 && (
        <Empty>{t.profile.noTracks}</Empty>
      )}

      {tab === "playlists" &&
        (data.playlists.length > 0 ? (
          <PlaylistList playlists={data.playlists} />
        ) : (
          loading !== tab && <Empty>{t.library.noPlaylists}</Empty>
        ))}

      {tab === "likes" && data.likes.length > 0 && (
        <>
          <div className="flex justify-end">
            <DownloadAllButton tracks={data.likes} />
          </div>
          <TrackList tracks={data.likes} />
        </>
      )}
      {tab === "likes" && loading !== tab && data.likes.length === 0 && (
        <Empty>{t.library.empty}</Empty>
      )}

      {tab === "followers" &&
        (data.followers.length > 0 ? (
          <UserList users={data.followers} />
        ) : (
          loading !== tab && <Empty>{t.library.noFollowing}</Empty>
        ))}

      {tab === "following" &&
        (data.following.length > 0 ? (
          <UserList users={data.following} />
        ) : (
          loading !== tab && <Empty>{t.library.noFollowing}</Empty>
        ))}
    </div>
  );
}

/** A header count. Clicking it opens the matching list, like on the website. */
function Stat({
  value,
  label,
  active,
  onClick,
}: {
  value: number | null | undefined;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-[var(--radius-control)] px-1.5 py-0.5 transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground",
        active && "text-foreground",
      )}
    >
      <b className="text-foreground">{formatCount(value)}</b> {label}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
