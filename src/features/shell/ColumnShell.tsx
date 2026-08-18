import { useCallback, useEffect, useState } from "react";
import { ChevronUp, Clock, ListMusic, Music } from "lucide-react";
import { Ambient } from "@/components/Ambient";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ShareButton } from "@/components/ShareButton";
import { Logo } from "@/components/Logo";
import { OfflineBadge } from "@/components/OfflineBadge";
import { QueuePanel } from "@/features/player/QueuePanel";
import { AppleNowPlaying } from "@/features/apple/AppleNowPlaying";
import { AppleDock } from "@/features/apple/AppleNav";
import { GLYPHS } from "@/features/apple/nav-glyphs";
import { Glass } from "@/features/apple/Glass";
import {
  AppleBackward,
  AppleDownload,
  AppleForward,
  AppleHeart,
  ApplePause,
  ApplePlay,
  AppleRepost,
  AppleShare,
  AppleSpeakerHigh,
  AppleSpeakerLow,
} from "@/features/apple/icons";
import {
  NextButton,
  PlayPauseButton,
  PrevButton,
  RepeatButton,
  SeekBar,
  ShuffleButton,
} from "@/features/player/controls";
import {
  TransportIcons,
  type TransportGlyphs,
} from "@/features/player/transport-icons";
import { NAV_ITEMS, type ViewId } from "@/components/shell/nav-items";
import { useCompact } from "@/hooks/useCompact";
import { useArtwork } from "@/hooks/useArtwork";
import { useWheelStep } from "@/hooks/useWheelStep";
import { setViewScroller, scrollViewToTop } from "@/lib/scroll";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useNavStore } from "@/stores/useNavStore";
import { useNitStore } from "@/stores/useNitStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The application frame: one column down the left, everything else to the
 * right of it.
 *
 * # Why the bar had to go
 *
 * Every previous arrangement in this app — and in Spotify, in SoundCloud's own
 * site, in most of the clients either of them inspired — was the same three
 * boxes: navigation down the left, content in the middle, a transport strip
 * across the bottom. It is a perfectly good shape. It is also the reason the
 * app kept reading as a version of something else no matter what colour it was
 * painted, because silhouette is what you recognise from across a room, and
 * ours was somebody else's.
 *
 * So the strip is gone and the player moved into the column. What that buys is
 * not novelty:
 *
 *   - **The cover gets to be large, permanently.** In a bottom bar it is a
 *     48px thumbnail because that is all the height there is. Here it is the
 *     full width of the column and the first thing on the screen. For an app
 *     whose entire subject is records, having the record visible is not a
 *     decoration.
 *   - **Content gets the whole height.** No 76px strip across the bottom of
 *     every screen, and no reserved padding under every list to clear it.
 *   - **One column, one place to look.** Navigation and the transport were at
 *     opposite corners; now everything that is *about the app* is on the left
 *     and everything that is *content* is on the right.
 *
 * What it costs, honestly: the seek bar is a column wide rather than a window
 * wide, so scrubbing is coarser. That is the trade, and for a player where most
 * seeking is "go back a bit" it is the right way round.
 *
 * # What it does not change
 *
 * The transport, the seek bar, the queue and the full-screen player are the
 * same components as before, rearranged. This is a new frame around work that
 * already existed, not a second implementation of playback — the same rule the
 * shell it replaces was written under.
 *
 * A phone-shaped window keeps the floating dock: a fixed left column is exactly
 * what does not work at 360px wide.
 */

/** SF-idiom transport glyphs, handed to the shared controls by context. */
const TRANSPORT: TransportGlyphs = {
  Play: ApplePlay,
  Pause: ApplePause,
  Prev: AppleBackward,
  Next: AppleForward,
};

/**
 * Wide enough for the record to have a column of its own.
 *
 * Below this the window cannot afford 21rem of it: at 1000px the content would
 * be left with a third of the window, and a cover that squeezes the library is
 * not worth having on screen. There the record folds back into a bar along the
 * bottom, which is the arrangement this whole design is trying to get away from
 * — kept only where the better one does not fit.
 */
const WIDE_QUERY = "(min-width: 1180px)";

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener("change", onChange);
    setWide(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/** The sections. Narrow — it holds eight words and nothing else. */
const NAV_COLUMN = "13.5rem";

/** The record. Wide enough for a cover you can read a sleeve by. */
const RECORD_COLUMN = "21rem";

export function ColumnShell({
  view,
  onNavigate,
  children,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  children: React.ReactNode;
  /**
   * Accepted and ignored. The other shell is handed a player to slot into its
   * bottom bar; this one has no bottom bar, and its player is part of the
   * column rather than a guest in it. Kept in the signature so `App` can pick a
   * shell without knowing which kind it got.
   */
  player?: React.ReactNode;
}) {
  const compact = useCompact();
  const wide = useWide();
  const showBackdrop = useSettingsStore((s) => s.backdrop.mode !== "none");
  const detail = useNavStore((s) => s.detail);
  const expanded = useNavStore((s) => s.nowPlaying);
  const setExpanded = useNavStore((s) => s.setNowPlaying);

  const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null);
  const scroller = useCallback((el: HTMLElement | null) => {
    setScrollerEl(el);
    setViewScroller(el);
  }, []);
  useWheelStep(scrollerEl);

  useEffect(() => {
    scrollViewToTop();
  }, [view, detail]);

  return (
    <TransportIcons.Provider value={TRANSPORT}>
      {expanded && <AppleNowPlaying onClose={() => setExpanded(false)} />}

      <div className="relative flex h-full w-full overflow-hidden bg-background text-foreground">
        {showBackdrop && <div className="app-backdrop" aria-hidden />}
        <Ambient className="fixed z-[1]" />

        {compact ? (
          <CompactFrame view={view} onNavigate={onNavigate} scroller={scroller}>
            {children}
          </CompactFrame>
        ) : (
          <>
            <aside
              className="relative z-10 flex shrink-0 flex-col gap-5 p-4"
              style={{ width: NAV_COLUMN }}
            >
              <Column view={view} onNavigate={onNavigate} />
            </aside>

            {/*
              The content, and no box around it.

              The shell it replaces put the page inside a rounded glass pane, so
              the window held a panel holding a panel holding a list. One of
              those layers had to go and it was this one: a frame around
              *everything* frames nothing, and the covers below are rectangles
              enough.
            */}
            <main
              ref={scroller}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto"
            >
              <div className="w-full px-7 py-6">{children}</div>
            </main>

            {wide && <NowPlayingPanel />}
          </>
        )}

        {/* Not wide enough for the column, not narrow enough for the dock. */}
        {!compact && !wide && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3">
            <div className="pointer-events-auto">
              <MiniBar />
            </div>
          </div>
        )}
      </div>
    </TransportIcons.Provider>
  );
}

/** The column: the mark, the sections, and the player at the foot of it. */
function Column({
  view,
  onNavigate,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  return (
    <>
      <Logo />

      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <ColumnItem
            key={item.id}
            id={item.id}
            label={item.label}
            active={view === item.id}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

    </>
  );
}

function ColumnItem({
  id,
  label,
  active,
  onNavigate,
}: {
  id: ViewId;
  label: string;
  active: boolean;
  onNavigate: (view: ViewId) => void;
}) {
  const Icon = GLYPHS[id];
  return (
    <button
      onClick={() => onNavigate(id)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "type-body flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-left transition-colors duration-[var(--motion-fast)]",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * The record, kept on screen.
 *
 * This is the part that is not borrowed. Every player either buries the cover
 * in a 48px thumbnail on a strip along the bottom, or hides the good view
 * behind a click — Spotify, SoundCloud, Yandex and this app's own previous five
 * arrangements all do one or the other. The full-size view exists in all of
 * them and is the best screen any of them has, and it is the one you are never
 * looking at.
 *
 * So it is not a screen here. It is a column, always open, and the artwork's
 * own colour is thrown behind it as a halo: the record lights the corner of the
 * room it is playing in. Nothing else in the window is allowed to be that
 * colourful, which is what makes it read as the subject rather than as
 * decoration.
 *
 * It costs 21rem of a wide window, and that is the whole argument against it.
 * Below `xl` it folds away and the cover goes back to being a button — a column
 * that squeezes the content it sits beside is worse than no column.
 */
function NowPlayingPanel() {
  const current = usePlayerStore((s) => s.current);
  const setExpanded = useNavStore((s) => s.setNowPlaying);
  const art = useArtwork(current, "t500x500");

  const later = useNitStore((s) => s.later);
  const loadLater = useNitStore((s) => s.loadLater);
  const saveLater = useNitStore((s) => s.saveLater);
  const dropLater = useNitStore((s) => s.dropLater);

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const startDownload = useDownloadsStore((s) => s.start);

  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    void loadLater();
  }, [loadLater]);

  if (!current) return null;

  const saved = later.some((item) => item.track_id === current.id);
  const isDownloaded = downloadedIds.has(current.id);

  return (
    <aside
      className="relative z-10 flex shrink-0 flex-col justify-end gap-4 overflow-hidden p-5"
      style={{ width: RECORD_COLUMN }}
    >
      {/*
        The halo.

        Two layers, and the second is what stops it looking like a blurred
        photograph: a wide soft field of the cover's colour, and over it a
        gradient back to the page. Without the gradient the column has a hard
        edge of someone else's album art down the middle of the window; with it
        the colour simply runs out.
      */}
      {art && (
        <>
          <img
            src={art}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-150 object-cover opacity-70 blur-[80px] saturate-[1.8] will-change-transform"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/55 to-background/25"
          />
        </>
      )}

      {queueOpen && (
        <>
          <button
            type="button"
            aria-label={t.player.close}
            onClick={() => setQueueOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <Glass
            chrome
            className="pop-in absolute bottom-24 right-5 z-30 flex h-[26rem] w-[21rem] flex-col overflow-hidden"
          >
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </Glass>
        </>
      )}

      <button
        onClick={() => setExpanded(true)}
        aria-label={t.player.expand}
        className="group/art relative block w-full overflow-hidden rounded-[var(--radius-hero)] shadow-[var(--shadow-2)]"
      >
        {art ? (
          <img src={art} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <span className="flex aspect-square w-full items-center justify-center bg-secondary">
            <Music className="h-10 w-10 text-muted-foreground" />
          </span>
        )}
        <span className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/45 to-transparent p-2 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/art:opacity-100">
          <ChevronUp className="h-5 w-5 text-white" />
        </span>
      </button>

      {/* Big, and bold, and allowed two lines. A track title truncated to one
          line at 13px is the detail that says "this is a list row"; this is not
          a list row, it is the thing you are listening to. */}
      <div className="min-w-0">
        <span className="flex min-w-0 items-start gap-1.5">
          <span className="type-title line-clamp-2">{current.title}</span>
          <OfflineBadge />
        </span>
        {current.artist && (
          <span className="type-body mt-0.5 block truncate text-muted-foreground">
            {current.artist}
          </span>
        )}
      </div>

      <SeekBar compact />

      {/* `np-transport` is the hook that makes play the accent disc — see
          `apple.css`. It is on the row rather than the button so the rule can
          stay scoped to the two places a landmark belongs. */}
      <div className="np-transport flex items-center justify-between">
        <ShuffleButton />
        <PrevButton />
        <PlayPauseButton size="lg" />
        <NextButton />
        <RepeatButton />
      </div>

      <div className="flex items-center justify-between">
        <LikeButton track={current} className="lg-action h-8 w-8" Icon={AppleHeart} />
        <RepostButton track={current} className="lg-action h-8 w-8" Icon={AppleRepost} />
        <ShareButton
          url={current.permalink_url}
          className="lg-action h-8 w-8"
          Icon={AppleShare}
        />
        <button
          onClick={() => void startDownload(current)}
          disabled={isDownloaded}
          aria-label={t.player.download}
          data-on={isDownloaded ? "true" : undefined}
          title={isDownloaded ? t.player.downloaded : t.player.download}
          className="lg-action h-8 w-8"
        >
          <AppleDownload className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            if (saved) void dropLater(current.id);
            else void saveLater(current, "manual");
          }}
          aria-label={saved ? t.later.remove : t.later.add}
          title={saved ? t.later.remove : t.later.add}
          data-on={saved ? "true" : undefined}
          className="lg-action h-8 w-8"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          onClick={() => setQueueOpen((v) => !v)}
          aria-label={t.player.queue}
          title={t.player.queue}
          data-on={queueOpen ? "true" : undefined}
          className="lg-action h-8 w-8"
        >
          <ListMusic className="h-4 w-4" />
        </button>
      </div>

      <ColumnVolume />
    </aside>
  );
}

/** Volume, along the foot of the column. */
function ColumnVolume() {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);

  const level = muted ? 0 : volume;
  const Glyph = level === 0 ? AppleSpeakerLow : AppleSpeakerHigh;

  return (
    <div className="flex items-center gap-2.5">
      <button
        onClick={toggleMute}
        aria-label={t.player.mute}
        className="shrink-0 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
      >
        <Glyph className="h-4 w-4" />
      </button>
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-[var(--ios-fill-3)]">
          <div
            className="h-full rounded-[var(--radius-round)] bg-foreground"
            style={{ width: `${level * 100}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={level}
          onChange={(e) => setVolume(Number(e.currentTarget.value))}
          aria-label={t.player.volume}
          className="relative h-5 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[var(--radius-round)]
            [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:opacity-0"
        />
      </div>
    </div>
  );
}

/**
 * The record as a strip, for the two widths that cannot hold the column.
 *
 * Deliberately the plainest thing in the app. It is the arrangement the design
 * is trying to leave behind, kept because a window 900px wide has nowhere else
 * to put a transport — so it does its job and asks for no attention at all.
 */
function MiniBar() {
  const current = usePlayerStore((s) => s.current);
  const setExpanded = useNavStore((s) => s.setNowPlaying);
  const art = useArtwork(current, "t120x120");

  if (!current) return null;

  return (
    <Glass chrome className="pointer-events-auto flex items-center gap-3 p-2">
      <button
        onClick={() => setExpanded(true)}
        aria-label={t.player.expand}
        className="shrink-0"
      >
        {art ? (
          <img src={art} alt="" className="h-11 w-11 rounded-[0.5rem] object-cover" />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-[0.5rem] bg-secondary">
            <Music className="h-5 w-5 text-muted-foreground" />
          </span>
        )}
      </button>
      <span className="min-w-0 flex-1">
        <span className="type-label block truncate font-medium">
          {current.title}
        </span>
        {current.artist && (
          <span className="type-caption block truncate text-muted-foreground">
            {current.artist}
          </span>
        )}
      </span>
      <PrevButton />
      <PlayPauseButton />
      <NextButton />
    </Glass>
  );
}

/** A phone-shaped window: the dock stays, a column does not fit. */
function CompactFrame({
  view,
  onNavigate,
  scroller,
  children,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  scroller: (el: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  // Only to know how much room the floating stack below needs.
  const current = usePlayerStore((s) => s.current);

  return (
    <>
      <main
        ref={scroller}
        className="relative z-10 min-h-0 flex-1 overflow-y-auto"
      >
        <div
          className="mx-auto w-full max-w-3xl px-4 pt-4"
          style={{
            paddingBottom: `calc(${current ? "10.5rem" : "6.5rem"} + var(--safe-bottom))`,
          }}
        >
          {children}
        </div>
      </main>

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-3"
        style={{ paddingBottom: "calc(0.75rem + var(--safe-bottom))" }}
      >
        <MiniBar />
        <div className="pointer-events-auto">
          <AppleDock view={view} onNavigate={onNavigate} />
        </div>
      </div>
    </>
  );
}
