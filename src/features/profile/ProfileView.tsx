import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  ExternalLink,
  MapPin,
  MessageSquare,
  Radio,
  User as UserIcon,
} from "lucide-react";
import {
  scGetAlbums,
  scGetFollowers,
  scGetFollowings,
  scGetLikes,
  scGetPlaylists,
  scGetProfile,
  scGetRelatedArtists,
  scGetReposts,
  scGetTopTracks,
  scGetUserTracks,
  scStationTracks,
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
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { openExternal } from "@/lib/open";
import { artwork, cn } from "@/lib/utils";

type Tab =
  | "tracks"
  | "top"
  | "albums"
  | "playlists"
  | "reposts"
  | "likes"
  | "related"
  | "followers"
  | "following";

/** Compact number formatting: 12500 → 12.5K. */
function formatCount(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** How much of any one profile tab to fetch. One page of SoundCloud's own. */
const TAB_LIMIT = 200;

interface Loaded {
  tracks: Track[];
  top: Track[];
  albums: Playlist[];
  playlists: Playlist[];
  /** Reposts mix tracks and sets, the way the website's tab does. */
  repostTracks: Track[];
  repostPlaylists: Playlist[];
  likes: Track[];
  related: User[];
  followers: User[];
  following: User[];
}

const EMPTY: Loaded = {
  tracks: [],
  top: [],
  albums: [],
  playlists: [],
  repostTracks: [],
  repostPlaylists: [],
  likes: [],
  related: [],
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
  const openThread = useNavStore((s) => s.openThread);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const [stationBusy, setStationBusy] = useState(false);

  /** Start this artist's endless station, the way the website's play button does. */
  async function startStation() {
    setStationBusy(true);
    try {
      const tracks = await scStationTracks("artist", userId, 50);
      const first = tracks[0];
      if (first) await playTrack(first, tracks);
    } catch (e) {
      toast(String(e), "error");
    } finally {
      setStationBusy(false);
    }
  }

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

    // Every one of these is capped at `TAB_LIMIT`.
    //
    // The backend walks `next_href` until the collection runs out, and a page
    // is 200 items — so an untethered "likes" tab on an account with 1.3k of
    // them was seven sequential round trips before anything appeared. Nobody
    // scrolls to the bottom of someone else's likes; they look at the top of
    // the list and move on. The user's own library is the place that still
    // fetches everything, because it is cached and searched.
    const fetcher: Record<Tab, () => Promise<Partial<Loaded>>> = {
      tracks: async () => ({ tracks: await scGetUserTracks(userId, TAB_LIMIT) }),
      top: async () => ({ top: await scGetTopTracks(userId, TAB_LIMIT) }),
      albums: async () => ({ albums: await scGetAlbums(userId, TAB_LIMIT) }),
      playlists: async () => ({
        playlists: await scGetPlaylists(userId, TAB_LIMIT),
      }),
      reposts: async () => {
        const mixed = await scGetReposts(userId, TAB_LIMIT);
        return {
          repostTracks: mixed.tracks,
          repostPlaylists: mixed.playlists,
        };
      },
      likes: async () => ({ likes: await scGetLikes(userId, TAB_LIMIT) }),
      related: async () => ({ related: await scGetRelatedArtists(userId) }),
      followers: async () => ({
        followers: await scGetFollowers(userId, TAB_LIMIT),
      }),
      following: async () => ({
        following: await scGetFollowings(userId, TAB_LIMIT),
      }),
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
    { id: "top", label: t.profile.topTracks, count: null },
    { id: "albums", label: t.profile.albums, count: null },
    { id: "playlists", label: t.profile.playlists, count: profile?.playlist_count },
    { id: "reposts", label: t.profile.reposts, count: null },
    { id: "likes", label: t.library.likes, count: profile?.likes_count },
    { id: "related", label: t.profile.relatedArtists, count: null },
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
                <button
                  onClick={() => void openExternal(profile.permalink_url!)}
                  className="inline-flex items-center gap-1 transition-colors duration-[var(--motion-fast)] hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  SoundCloud
                </button>
              )}
            </div>

            {profile?.description && (
              <p className="mt-3 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
                {profile.description}
              </p>
            )}
          </div>

          {/* One row, so the buttons share a baseline and a height. As three
              separate `self-start` children with their own paddings they sat
              at three different heights against each other. */}
          {profile && (
            <div className="flex shrink-0 items-center gap-2 self-start">
              <ShareButton url={profile.permalink_url} withLabel />

              <button
                onClick={() => void startStation()}
                disabled={stationBusy}
                title={t.library.startStation}
                aria-label={t.library.startStation}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <Radio className="h-4 w-4" />
              </button>

              {!isSelf && (
                <button
                  onClick={() =>
                    openThread({
                      id: profile.id,
                      username: profile.username,
                      avatar_url: profile.avatar_url,
                      permalink_url: profile.permalink_url,
                      followers_count: profile.followers_count,
                      track_count: profile.track_count,
                    })
                  }
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 text-sm font-medium transition-colors duration-[var(--motion-fast)] hover:bg-accent"
                >
                  <MessageSquare className="h-4 w-4" />
                  {t.profile.message}
                </button>
              )}
            </div>
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
                "h-9 shrink-0 self-start rounded-[var(--radius-control)] px-4 text-sm font-semibold transition-[opacity,transform] duration-[var(--motion-fast)] hover:opacity-90 active:scale-95",
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

      {tab === "top" && data.top.length > 0 && <TrackList tracks={data.top} />}
      {tab === "top" && loading !== tab && data.top.length === 0 && (
        <Empty>{t.profile.noTracks}</Empty>
      )}

      {tab === "albums" &&
        (data.albums.length > 0 ? (
          <PlaylistList playlists={data.albums} />
        ) : (
          loading !== tab && <Empty>{t.profile.noAlbums}</Empty>
        ))}

      {tab === "playlists" &&
        (data.playlists.length > 0 ? (
          <PlaylistList playlists={data.playlists} />
        ) : (
          loading !== tab && <Empty>{t.library.noPlaylists}</Empty>
        ))}

      {tab === "reposts" && (
        <>
          {data.repostTracks.length > 0 && (
            <TrackList tracks={data.repostTracks} />
          )}
          {data.repostPlaylists.length > 0 && (
            <PlaylistList playlists={data.repostPlaylists} />
          )}
          {loading !== tab &&
            data.repostTracks.length === 0 &&
            data.repostPlaylists.length === 0 && (
              <Empty>{t.profile.noReposts}</Empty>
            )}
        </>
      )}

      {tab === "related" &&
        (data.related.length > 0 ? (
          <UserList users={data.related} />
        ) : (
          loading !== tab && <Empty>{t.library.noFollowing}</Empty>
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
