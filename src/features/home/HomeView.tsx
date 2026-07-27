import { useEffect, useState } from "react";
import { Play, Shuffle } from "lucide-react";
import { scMixedSelections, scStream, type Selection, type Track } from "@/lib/tauri";
import { PlaylistTile, SectionHeader, TileGrid, TrackTile } from "@/components/ArtTile";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";

/** How many items each home row shows before you go to the library. */
const ROW = 10;

/** Greeting keyed to the wall clock — small touch, sets the tone. */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return t.home.night;
  if (h < 12) return t.home.morning;
  if (h < 18) return t.home.day;
  return t.home.evening;
}

/** Fisher–Yates on a copy; the caller's list is a store value. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function HomeView({
  userId,
  onNavigate,
}: {
  userId: number;
  onNavigate: (view: "library" | "search") => void;
}) {
  const likes = useLibraryStore((s) => s.likes);
  const own = useLibraryStore((s) => s.ownPlaylists);
  const history = useLibraryStore((s) => s.history);
  const loadLikes = useLibraryStore((s) => s.loadLikes);
  const loadPlaylists = useLibraryStore((s) => s.loadPlaylists);
  const loadHistory = useLibraryStore((s) => s.loadHistory);
  const playTrack = usePlayerStore((s) => s.playTrack);

  // Feed and curated rows are home-only, so they live here rather than in the
  // library store — nothing else needs them cached.
  const [feed, setFeed] = useState<Track[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);

  useEffect(() => {
    void loadLikes(userId);
    void loadPlaylists(userId);
    void loadHistory(userId);
  }, [userId, loadLikes, loadPlaylists, loadHistory]);

  useEffect(() => {
    let cancelled = false;
    // Both are best-effort: home still works if either endpoint moves.
    scStream(60)
      .then((tracks) => !cancelled && setFeed(tracks))
      .catch(() => undefined);
    scMixedSelections(6)
      .then((rows) => !cancelled && setSelections(rows))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const tracks = likes.items;
  const hero = tracks[0];

  function playAll(shuffle: boolean) {
    if (tracks.length === 0) return;
    const queue = shuffle ? shuffled(tracks) : tracks;
    const first = queue[0];
    if (first) void playTrack(first, queue);
  }

  return (
    <div className="stack-lg">
      {/* Hero */}
      <section className="panel panel-raised relative overflow-hidden rounded-[var(--radius-hero)] p-6">
        {hero?.artwork_url && (
          <img
            src={artwork(hero.artwork_url, "t500x500") ?? undefined}
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rotate-12 rounded-[var(--radius-hero)] opacity-20 blur-[2px]"
          />
        )}
        <div className="relative">
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {greeting()}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tracks.length > 0
              ? `${t.home.inLikes}: ${tracks.length}`
              : t.home.emptyHint}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => playAll(false)}
              disabled={tracks.length === 0}
              className="brand-gradient flex items-center gap-2 rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-white transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-40"
            >
              <Play className="h-4 w-4 translate-x-[1px]" />
              {t.home.playLikes}
            </button>
            <button
              onClick={() => playAll(true)}
              disabled={tracks.length === 0}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-40"
            >
              <Shuffle className="h-4 w-4" />
              {t.home.shuffle}
            </button>
          </div>
        </div>
      </section>

      {likes.status === "loading" && tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {history.items.length > 0 && (
        <Row
          title={t.home.recent}
          onSeeAll={() => onNavigate("library")}
          tracks={history.items.slice(0, ROW)}
          queue={history.items}
        />
      )}

      {feed.length > 0 && (
        <Row
          title={t.home.feed}
          tracks={feed.slice(0, ROW)}
          queue={feed}
        />
      )}

      {tracks.length > 0 && (
        <Row
          title={t.home.fromLikes}
          onSeeAll={() => onNavigate("library")}
          tracks={tracks.slice(0, ROW)}
          queue={tracks}
        />
      )}

      {own.items.length > 0 && (
        <section className="stack">
          <SectionHeader
            title={t.library.ownPlaylists}
            action={{ label: t.home.seeAll, onClick: () => onNavigate("library") }}
          />
          <TileGrid>
            {own.items.slice(0, ROW).map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </TileGrid>
        </section>
      )}

      {/* SoundCloud's own curated rows. */}
      {selections.map((selection) => (
        <section key={selection.id} className="stack">
          <SectionHeader title={selection.title} />
          <TileGrid>
            {selection.playlists.slice(0, ROW).map((playlist) => (
              <PlaylistTile key={playlist.id} playlist={playlist} />
            ))}
          </TileGrid>
        </section>
      ))}
    </div>
  );
}

function Row({
  title,
  onSeeAll,
  tracks,
  queue,
}: {
  title: string;
  onSeeAll?: () => void;
  tracks: Track[];
  queue: Track[];
}) {
  return (
    <section className="stack">
      <SectionHeader
        title={title}
        action={onSeeAll ? { label: t.home.seeAll, onClick: onSeeAll } : undefined}
      />
      <TileGrid>
        {tracks.map((track) => (
          <TrackTile key={track.id} track={track} queue={queue} />
        ))}
      </TileGrid>
    </section>
  );
}
