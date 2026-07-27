import { useEffect, useState } from "react";
import { HardDriveDownload, Radio, RefreshCw, Search, Trash2 } from "lucide-react";
import { scStationTracks, type Track } from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { PlaylistList } from "@/components/PlaylistList";
import { UserList } from "@/components/UserList";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { useLibraryStore, type Section } from "@/stores/useLibraryStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type SectionId =
  | "likes"
  | "playlists"
  | "albums"
  | "stations"
  | "history"
  | "downloads"
  | "following";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "likes", label: t.library.likes },
  { id: "playlists", label: t.library.playlists },
  { id: "albums", label: t.library.albums },
  { id: "stations", label: t.library.stations },
  { id: "history", label: t.library.history },
  { id: "downloads", label: t.library.downloads },
  { id: "following", label: t.library.following },
];

/** Case-insensitive substring match over a title-ish field. */
function useFilter<T>(items: T[], key: (item: T) => string) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? items.filter((item) => key(item).toLowerCase().includes(needle))
    : items;
  return { query, setQuery, filtered };
}

/** Search box shown above a filterable section. */
function FilterBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="w-full rounded-[var(--radius-control)] border border-border bg-card py-1.5 pl-8 pr-2 text-sm outline-none transition-[box-shadow] duration-[var(--motion-fast)] focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

export function LibraryView({ userId }: { userId: number }) {
  const [section, setSection] = useState<SectionId>("likes");

  return (
    <div className="flex w-full flex-col gap-3">
      <nav className="flex gap-4 overflow-x-auto border-b border-border">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-1 pb-2 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
              section === s.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="label">{s.label}</span>
          </button>
        ))}
      </nav>

      {section === "likes" && <LikesSection userId={userId} />}
      {section === "playlists" && <PlaylistsSection userId={userId} albums={false} />}
      {section === "albums" && <PlaylistsSection userId={userId} albums />}
      {section === "stations" && <StationsSection userId={userId} />}
      {section === "history" && <HistorySection userId={userId} />}
      {section === "downloads" && <DownloadsSection />}
      {section === "following" && <FollowingSection userId={userId} />}
    </div>
  );
}

function LikesSection({ userId }: { userId: number }) {
  const likes = useLibraryStore((s) => s.likes);
  const load = useLibraryStore((s) => s.loadLikes);
  const refresh = useLibraryStore((s) => s.refreshLikes);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  const { query, setQuery, filtered } = useFilter(likes.items, (t) =>
    `${t.title} ${t.artist ?? ""}`,
  );

  return (
    <Shell
      section={likes}
      count={filtered.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.empty}
      tools={
        <>
          <FilterBox
            value={query}
            onChange={setQuery}
            placeholder={t.library.searchLikes}
          />
          <DownloadAllButton tracks={filtered} />
        </>
      }
    >
      <TrackList tracks={filtered} />
    </Shell>
  );
}

/** Playlists and albums are the same endpoint, split by the `is_album` flag. */
function PlaylistsSection({
  userId,
  albums,
}: {
  userId: number;
  albums: boolean;
}) {
  const own = useLibraryStore((s) => s.ownPlaylists);
  const liked = useLibraryStore((s) => s.likedPlaylists);
  const load = useLibraryStore((s) => s.loadPlaylists);
  const refresh = useLibraryStore((s) => s.refreshPlaylists);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const match = (p: { title: string; owner: string | null }) =>
    !needle ||
    `${p.title} ${p.owner ?? ""}`.toLowerCase().includes(needle);

  const mine = own.items.filter((p) => p.is_album === albums && match(p));
  const theirs = liked.items.filter((p) => p.is_album === albums && match(p));

  return (
    <Shell
      section={own}
      count={mine.length + theirs.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.noPlaylists}
      tools={
        <FilterBox
          value={query}
          onChange={setQuery}
          placeholder={t.library.searchPlaylists}
        />
      }
    >
      <div className="flex flex-col gap-4">
        {mine.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="label text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.library.ownPlaylists}
            </h3>
            <PlaylistList playlists={mine} />
          </div>
        )}
        {theirs.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="label text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.library.likedPlaylists}
            </h3>
            <PlaylistList playlists={theirs} />
          </div>
        )}
      </div>
    </Shell>
  );
}

function HistorySection({ userId }: { userId: number }) {
  const history = useLibraryStore((s) => s.history);
  const load = useLibraryStore((s) => s.loadHistory);
  const refresh = useLibraryStore((s) => s.refreshHistory);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  const { query, setQuery, filtered } = useFilter(history.items, (t) =>
    `${t.title} ${t.artist ?? ""}`,
  );

  return (
    <Shell
      section={history}
      count={filtered.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.noHistory}
      tools={
        <>
          <FilterBox
            value={query}
            onChange={setQuery}
            placeholder={t.library.searchTracks}
          />
          <DownloadAllButton tracks={filtered} />
        </>
      }
    >
      <TrackList tracks={filtered} />
    </Shell>
  );
}

/**
 * Stations: an endless stream seeded by an artist you follow, or by a track
 * you like. Picking one replaces the queue.
 */
function StationsSection({ userId }: { userId: number }) {
  const followings = useLibraryStore((s) => s.followings);
  const likes = useLibraryStore((s) => s.likes);
  const loadFollowings = useLibraryStore((s) => s.loadFollowings);
  const loadLikes = useLibraryStore((s) => s.loadLikes);
  const playTrack = usePlayerStore((s) => s.playTrack);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadFollowings(userId);
    void loadLikes(userId);
  }, [userId, loadFollowings, loadLikes]);

  async function start(seed: "track" | "artist", seedId: number, key: string) {
    setBusy(key);
    setError(null);
    try {
      const tracks = await scStationTracks(seed, seedId, 50);
      const first = tracks[0];
      if (first) await playTrack(first, tracks);
      else setError(t.library.noHistory);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const artists = followings.items.slice(0, 24);
  const seeds = likes.items.slice(0, 12);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t.library.stationsHint}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}

      {artists.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="label text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.library.following}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {artists.map((user) => (
              <StationCard
                key={`artist-${user.id}`}
                art={artwork(user.avatar_url, "t120x120")}
                title={user.username}
                round
                busy={busy === `artist-${user.id}`}
                onStart={() => void start("artist", user.id, `artist-${user.id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {seeds.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="label text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.library.likes}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {seeds.map((track) => (
              <StationCard
                key={`track-${track.id}`}
                art={artwork(track.artwork_url, "t120x120")}
                title={track.title}
                subtitle={track.artist}
                busy={busy === `track-${track.id}`}
                onStart={() => void start("track", track.id, `track-${track.id}`)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StationCard({
  art,
  title,
  subtitle,
  round = false,
  busy,
  onStart,
}: {
  art: string | null;
  title: string;
  subtitle?: string | null;
  round?: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <button
      onClick={onStart}
      disabled={busy}
      title={t.library.startStation}
      className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-2 text-left transition-transform duration-[var(--motion-fast)] hover:-translate-y-0.5 disabled:opacity-60"
    >
      {art ? (
        <img
          src={art}
          alt=""
          className={cn(
            "h-11 w-11 shrink-0 object-cover",
            round ? "rounded-full" : "rounded-[var(--radius-control)]",
          )}
        />
      ) : (
        <span
          className={cn(
            "h-11 w-11 shrink-0 bg-secondary",
            round ? "rounded-full" : "rounded-[var(--radius-control)]",
          )}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle && (
          <span className="block truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

/** The offline library. Everything here plays with no connection. */
function DownloadsSection() {
  const items = useDownloadsStore((s) => s.items);
  const active = useDownloadsStore((s) => s.active);
  const status = useDownloadsStore((s) => s.status);
  const load = useDownloadsStore((s) => s.load);
  const remove = useDownloadsStore((s) => s.remove);

  useEffect(() => {
    void load();
  }, [load]);

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const pending = Object.values(active);
  const tracks: Track[] = needle
    ? items.filter((i) =>
        `${i.title} ${i.artist ?? ""}`.toLowerCase().includes(needle),
      )
    : items;
  const totalMb = items.reduce((sum, i) => sum + i.bytes, 0) / 1_000_000;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <HardDriveDownload className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          {items.length > 0
            ? `${items.length} · ${totalMb.toFixed(1)} ${t.downloads.size}`
            : t.downloads.hint}
        </span>
        <FilterBox
          value={query}
          onChange={setQuery}
          placeholder={t.library.searchTracks}
        />
        <button
          onClick={() => void load()}
          disabled={status === "loading"}
          aria-label={t.library.refresh}
          className="ml-auto rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={cn("h-4 w-4", status === "loading" && "animate-spin")}
          />
        </button>
      </div>

      {pending.length > 0 && (
        <ul className="panel flex flex-col divide-y divide-border overflow-hidden">
          {pending.map((job) => {
            const percent = job.total
              ? Math.round((job.received / job.total) * 100)
              : null;
            return (
              <li key={job.trackId} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {job.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {job.error ? t.downloads.failed : `${percent ?? 0}%`}
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-[var(--motion-fast)]",
                      job.error ? "bg-destructive" : "brand-gradient",
                    )}
                    style={{ width: `${percent ?? 5}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tracks.length > 0 ? (
        <div className="flex flex-col gap-1">
          <TrackList tracks={tracks} />
          <div className="flex flex-wrap gap-1 pt-1">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => void remove(item.id)}
                title={`${t.downloads.remove}: ${item.title}`}
                className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:border-destructive hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                <span className="max-w-32 truncate">{item.title}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        pending.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.downloads.empty}</p>
        )
      )}
    </div>
  );
}

function FollowingSection({ userId }: { userId: number }) {
  const followings = useLibraryStore((s) => s.followings);
  const load = useLibraryStore((s) => s.loadFollowings);
  const refresh = useLibraryStore((s) => s.refreshFollowings);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  const { query, setQuery, filtered } = useFilter(
    followings.items,
    (u) => u.username,
  );

  return (
    <Shell
      section={followings}
      count={filtered.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.noFollowing}
      tools={
        <FilterBox
          value={query}
          onChange={setQuery}
          placeholder={t.library.searchPeople}
        />
      }
    >
      <UserList users={filtered} />
    </Shell>
  );
}

/** Shared count / refresh / loading / error / empty chrome around a section. */
function Shell({
  section,
  count,
  onRefresh,
  emptyLabel,
  tools,
  children,
}: {
  section: Section<unknown>;
  count: number;
  onRefresh: () => void;
  emptyLabel: string;
  /** Search box, bulk actions — anything section-specific. */
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  const loading = section.status === "loading";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {tools}
        <span className="text-sm text-muted-foreground">
          {count > 0 ? count : ""}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label={t.library.refresh}
          title={t.library.refresh}
          className="rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* On refresh the cached list stays on screen; the spinner is the signal. */}
      {loading && count === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {section.status === "error" && (
        <p className="text-sm text-destructive">
          {t.library.error}: {section.error}
        </p>
      )}

      {section.status === "ok" && count === 0 && (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}

      {count > 0 && children}
    </div>
  );
}
