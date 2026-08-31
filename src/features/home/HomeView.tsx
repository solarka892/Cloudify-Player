import { useEffect, useState } from "react";
import { Play, Shuffle } from "lucide-react";
import { scMixedSelections, scStream, type Selection, type Track } from "@/lib/tauri";
import { PlaylistTile, SectionHeader, TileGrid, TrackTile } from "@/components/ArtTile";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useNavStore } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { t } from "@/i18n";
import { ArtFallback } from "@/components/ArtFallback";
import { artwork, cn } from "@/lib/utils";

/** How many items each home row shows before you go to the library. */
const ROW = 10;

/** Wide cards in the first shelf. Six fills two or three columns evenly. */
const QUICK = 6;

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

export function HomeView({ userId }: { userId: number }) {
  /**
   * Straight to the store, where a view used to be handed down as a callback.
   *
   * Every "see all" on this screen means a particular tab of the library, and
   * the prop could only name the view — so all three said "the library" and the
   * library opens on likes. The one under "recently played" therefore showed
   * likes, which is the one thing it does not mean.
   */
  const openLibrary = useNavStore((s) => s.openLibrary);
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
  /**
   * Whose cover the panel wears.
   *
   * The playing track's, when the app is already taking its colour from the
   * cover — the setting is "the interface follows what is playing", and a
   * banner that is the largest colour on the screen not following it was the
   * setting half-applied. It sat on the first liked track instead: a record
   * from whenever, picked by sort order, that the panel then announced in
   * display type.
   *
   * With the setting off, or with nothing playing, it goes back to that first
   * liked track — the panel still has to be *some* colour, and the alternative
   * is the flat one below.
   */
  const playing = usePlayerStore((s) => s.current);
  const fromArtwork = useSettingsStore((s) => s.theme.accentFromArtwork);
  const hero = (fromArtwork && playing?.artwork_url ? playing : tracks[0]) as
    | typeof playing
    | undefined;

  function playAll(shuffle: boolean) {
    if (tracks.length === 0) return;
    const queue = shuffle ? shuffled(tracks) : tracks;
    const first = queue[0];
    if (first) void playTrack(first, queue);
  }

  return (
    <div className="stack-lg">
      {/*
        The hero.

        It was a bordered panel with a greeting, two buttons and a 224px cover
        tilted into the corner at 20% — the largest object on the first screen,
        saying almost nothing. This is the same information given the room it
        was already taking: the cover becomes the panel rather than sitting in
        it, blurred and enlarged into a field of the record's own colour, and
        the greeting is set at display size on top of it.

        Blurred on purpose, and not to be pretty: a square cover stretched
        across a 3:1 banner is either cropped to a detail nobody recognises or
        squashed. Out of focus it stops being a picture and becomes what it is
        actually here for — the colour of what you were last listening to.

        The scrim runs left to right rather than top to bottom. The text is on
        the left, so that is the only side that has to be dark enough to read
        on; darkening the whole thing evenly would take the colour back out
        again, which is the entire point of the panel.
      */}
      <section className="relative isolate flex min-h-[11rem] flex-col justify-end overflow-hidden rounded-[var(--radius-hero)] p-6">
        {hero?.artwork_url && (
          <>
            <img
              src={artwork(hero.artwork_url, "t500x500") ?? undefined}
              alt=""
              aria-hidden
              // `scale-125` hides the pale edge a blur pulls in from outside the
              // element; `will-change` keeps the whole pair on one layer so the
              // blur is computed once rather than on every scrolled frame.
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-125 object-cover blur-[64px] saturate-[1.4] will-change-transform"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/80 to-background/25"
            />
          </>
        )}
        {/* No cover to borrow a colour from — a flat panel, as before. */}
        {!hero?.artwork_url && (
          <span aria-hidden className="panel absolute inset-0 -z-10 rounded-[var(--radius-hero)]" />
        )}

        <h1 className="type-display">{greeting()}</h1>
        <p className="type-label mt-1.5 tabular-nums text-muted-foreground">
          {tracks.length > 0
            ? `${t.home.inLikes}: ${tracks.length}`
            : t.home.emptyHint}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => playAll(false)}
            disabled={tracks.length === 0}
            className="type-label flex items-center gap-2 rounded-[var(--radius-round)] bg-brand px-5 py-2.5 font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-40"
          >
            <Play className="h-4 w-4 translate-x-[1px]" />
            {t.home.playLikes}
          </button>
          <button
            onClick={() => playAll(true)}
            disabled={tracks.length === 0}
            className="type-label flex items-center gap-2 rounded-[var(--radius-round)] bg-secondary px-5 py-2.5 font-medium text-secondary-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-40"
          >
            <Shuffle className="h-4 w-4" />
            {t.home.shuffle}
          </button>
        </div>
      </section>

      {likes.status === "loading" && tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {/*
        What you were just listening to, as wide cards rather than another row
        of squares.

        The home screen was five identical shelves of five identical covers —
        twenty-five squares, all the same size, all with the same two lines
        under them. Everything on it had the same weight, so nothing on it had
        any, and the eye had no reason to start anywhere in particular.

        This shelf gets a different shape on purpose. A wide card is a *known*
        record, read by its name; a square is a record you are being shown, read
        by its picture. Those are two different jobs and they should not look
        the same. Two of these across also means the eight most recent fit in
        the height one shelf of five used to take.
      */}
      {history.items.length > 0 && (
        <section className="stack">
          <SectionHeader
            title={t.home.recent}
            action={{ label: t.home.seeAll, onClick: () => openLibrary("history") }}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {history.items.slice(0, QUICK).map((track) => (
              <QuickCard key={track.id} track={track} queue={history.items} />
            ))}
          </div>
        </section>
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
          onSeeAll={() => openLibrary("likes")}
          tracks={tracks.slice(0, ROW)}
          queue={tracks}
        />
      )}

      {own.items.length > 0 && (
        <section className="stack">
          <SectionHeader
            title={t.library.ownPlaylists}
            action={{ label: t.home.seeAll, onClick: () => openLibrary("playlists") }}
          />
          <TileGrid>
            {own.items.slice(0, ROW).map((playlist, i) => (
              <PlaylistTile key={playlist.id} playlist={playlist} index={i} />
            ))}
          </TileGrid>
        </section>
      )}

      {/* SoundCloud's own curated rows. */}
      {selections.map((selection) => (
        <section key={selection.id} className="stack">
          <SectionHeader title={selection.title} />
          <TileGrid>
            {selection.playlists.slice(0, ROW).map((playlist, i) => (
              <PlaylistTile key={playlist.id} playlist={playlist} index={i} />
            ))}
          </TileGrid>
        </section>
      ))}
    </div>
  );
}

/**
 * One wide card: the cover, the name, the artist, and the whole thing is the
 * button.
 *
 * No hover-revealed play glyph. On a square tile the picture is the subject and
 * a play button has to be introduced over it; here the row *is* the control,
 * the way a track in a list is, and adding an affordance to a thing that is
 * already entirely clickable only tells the user they were wrong about it.
 */
function QuickCard({ track, queue }: { track: Track; queue: Track[] }) {
  const playTrack = usePlayerStore((s) => s.playTrack);
  const active = usePlayerStore((s) => s.current?.id === track.id);
  const art = artwork(track.artwork_url, "t120x120");

  return (
    <button
      onClick={() => void playTrack(track, queue)}
      className={cn(
        "group/quick flex items-center gap-3 overflow-hidden rounded-[var(--radius)] pr-3 text-left transition-colors duration-[var(--motion-fast)]",
        active ? "bg-accent" : "bg-secondary/60 hover:bg-accent",
      )}
    >
      {art ? (
        <span className="art-frame block h-14 w-14 shrink-0">
          <img src={art} alt="" loading="lazy" className="artwork h-full w-full object-cover" />
        </span>
      ) : (
        <ArtFallback seed={track.id} className="h-14 w-14 shrink-0" glyphClassName="h-5 w-5" />
      )}
      <span className="min-w-0 py-2">
        <span className={cn("type-label block truncate font-medium", active && "text-brand")}>
          {track.title}
        </span>
        {track.artist && (
          <span className="type-caption block truncate text-muted-foreground">
            {track.artist}
          </span>
        )}
      </span>
    </button>
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
        {tracks.map((track, i) => (
          <TrackTile key={track.id} track={track} queue={queue} index={i} />
        ))}
      </TileGrid>
    </section>
  );
}
