import { useState } from "react";
import { Moon, Radio } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { LyricsPanel } from "@/features/player/Lyrics";
import { QueuePanel } from "@/features/player/QueuePanel";
import {
  NextButton,
  PlayPauseButton,
  PrevButton,
  RepeatButton,
  ShuffleButton,
} from "@/features/player/controls";
import { formatTime } from "@/features/player/time";
import { useCompact } from "@/hooks/useCompact";
import { useEffect } from "react";
import { Glass } from "./Glass";
import {
  AppleChevronDown,
  AppleDownload,
  AppleEllipsis,
  AppleList,
  AppleQuote,
  AppleShare,
  AppleSpeakerHigh,
  AppleSpeakerLow,
} from "./icons";
import { useDismiss } from "@/hooks/useDismiss";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type Panel = "none" | "lyrics" | "queue";

/**
 * Width at which the queue can float beside the player without reaching it.
 *
 * The player column is centred and up to 34rem wide, so a 21rem panel pinned to
 * the left edge only clears it on a genuinely wide window. Below this the queue
 * swaps in for the artwork instead — a floating panel that overlaps the transport
 * is worse than one that replaces the cover.
 */
const QUEUE_BESIDE_QUERY = "(min-width: 1280px)";

function useRoomBesidePlayer(): boolean {
  const [wide, setWide] = useState(
    () => window.matchMedia(QUEUE_BESIDE_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(QUEUE_BESIDE_QUERY);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    media.addEventListener("change", onChange);
    setWide(media.matches);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return wide;
}

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * Now Playing, iOS 26 Music.
 *
 * The shared full-screen view centres everything and lines the secondary
 * actions up in a row of bordered chips. Apple's is a different composition, and
 * the differences are the whole point of the mode:
 *
 *   - The cover *is* the room. Blurred and saturated to fill the screen, under a
 *     scrim heavy enough that white text is safe over any artwork — which is why
 *     this view fixes its own palette instead of following the theme's. Deriving
 *     the text colour per-cover is what Apple does; a scrim is what makes one
 *     colour correct for every cover.
 *   - Title and artist are **left-aligned**, with the like and share actions on
 *     the same line. Centring them is the tell of every third-party player.
 *   - The scrubber counts *down* on the right. iOS shows time remaining, not
 *     total; a total belongs on a progress bar, not a transport.
 *   - Lyrics open *beside* the cover, filling the width to its left, because the
 *     cover is what the eye holds on to while the words move. The queue floats
 *     in the empty half of the window for the same reason, and only falls back
 *     to taking the cover's place on a window too narrow to hold both.
 *
 * Everything with behaviour behind it is the shared player's; this is a
 * different arrangement of `features/player`, not a second implementation.
 */
export function AppleNowPlaying({ onClose }: { onClose: () => void }) {
  const { leaving, dismiss } = useDismiss(onClose);
  const current = usePlayerStore((s) => s.current);
  const rate = usePlayerStore((s) => s.rate);
  const setRate = usePlayerStore((s) => s.setRate);
  const sleepAt = usePlayerStore((s) => s.sleepAt);
  const setSleep = usePlayerStore((s) => s.setSleep);
  const startRadio = usePlayerStore((s) => s.startRadio);
  const radioLoading = usePlayerStore((s) => s.radioLoading);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const startDownload = useDownloadsStore((s) => s.start);

  const [panel, setPanel] = useState<Panel>("none");
  const [showMore, setShowMore] = useState(false);
  // Where the queue goes. There is no room beside the player on a phone-shaped
  // window, so there it swaps in for the artwork the way lyrics do — the
  // alternative is a chip that does nothing at that width.
  const compact = useCompact();
  const roomBeside = useRoomBesidePlayer() && !compact;
  const queueBeside = panel === "queue" && roomBeside;
  const queueInPlace = panel === "queue" && !roomBeside;

  if (!current) return null;

  const art = artwork(current.artwork_url, "t500x500");
  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];

  return (
    <div
      className={cn(
        "lg-on-artwork fixed inset-0 z-50 flex flex-col overflow-hidden bg-black",
        leaving ? "view-exit" : "view-enter",
      )}
    >
      {art && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 scale-[1.15] bg-cover bg-center blur-[72px] saturate-[1.6]"
          style={{ backgroundImage: `url("${art}")` }}
        />
      )}
      {/* The scrim. Fixed, not themed: it is what makes white text safe over a
          cover this view has never seen. */}
      <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden />

      {/*
        Close, positioned out of the flow.

        It used to be a full-width row above the content, with the content pulled
        back up under it by a negative margin to stay centred in the window. That
        row had no background but it still took pointer events — so it sat
        invisibly over the top ~68px of whatever the content put there, and the
        queue's own close and clear buttons, which live exactly that far down,
        could not be clicked at all. Taking the button out of the flow removes
        both the overlap and the negative margin that caused it.
      */}
      <button
        onClick={dismiss}
        aria-label={t.player.collapse}
        className="lg-chip absolute left-4 top-4 z-30 h-9 w-9"
      >
        <AppleChevronDown className="h-5 w-5" />
      </button>

      {/*
        The column is sized off the *height*, not the width.

        A fixed max-width centred in a desktop window left the artwork small
        with voids above and below it; capping the artwork against `vh` instead
        makes it as large as the window's shortest axis allows, and the controls
        keep their own size underneath. `min-h-0` so a long queue cannot push
        the transport off the bottom.
      */}
      {/* The queue floats in the empty half of the window rather than sitting in
          the row: laid out beside the player it pushed the cover off centre every
          time it opened, and the cover is the thing the eye is anchored to. */}
      {queueBeside && (
        <Glass
          chrome
          className="pop-in absolute left-10 top-1/2 z-20 flex max-h-[74vh] w-[21.5rem] -translate-y-1/2 flex-col overflow-hidden"
        >
          <QueuePanel onClose={() => setPanel("none")} />
        </Glass>
      )}

      {/*
        With lyrics open the window splits: words on the left, the whole player —
        cover, title, transport, volume — on the right. The player keeps its own
        width and the words take everything else, so opening lyrics moves the
        player aside rather than rebuilding it.

        `items-stretch` (the default) rather than `items-center`, and the reason is
        load-bearing: centring made these items' heights content-based, so
        `flex-1` on the words resolved against the *words* — all of them — and the
        row grew past the window. Stretched, both items get the row's height, and
        `min-h-0` is what lets the words scroll inside theirs.
      */}
      <div
        className={cn(
          "relative z-10 flex min-h-0 flex-1 px-10 py-10",
          panel === "lyrics" ? "gap-12" : "justify-center",
        )}
      >
        {/*
          The words, and nothing around them.

          A sibling of the player rather than something inside it: the whole
          player — cover, title, transport — moves to the right and the words take
          the left. The scrollbar is hidden because the list scrolls itself to the
          line being sung; a thumb here is a control nobody reaches for and one
          more line in a view whose entire point is that there are none.
        */}
        {panel === "lyrics" && (
          <div
            className="min-w-0 flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden"
            style={{
              scrollbarWidth: "none",
              maskImage:
                "linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, transparent 0, #000 10%, #000 90%, transparent 100%)",
            }}
          >
            <LyricsPanel track={current} large />
          </div>
        )}

      <div className="flex min-h-0 w-full max-w-[34rem] shrink-0 flex-col justify-center gap-6">
        {/* The cover — or the queue, on a window with nowhere to float it. */}
        {queueInPlace ? (
          <Glass chrome className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <QueuePanel onClose={() => setPanel("none")} />
          </Glass>
        ) : (
          <div className="mx-auto w-full max-w-[min(30rem,44vh)]">
            <Cover art={art} playing={isPlaying} />
          </div>
        )}

        {/* Title, left-aligned, with the two actions that belong to the track. */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2
              className="truncate text-[1.375rem] font-bold leading-tight tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {current.title}
            </h2>
            {current.artist && (
              <p className="truncate text-[1.0625rem] leading-snug text-[var(--ios-label-2)]">
                {current.artist}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <LikeButton track={current} className="lg-chip h-9 w-9" />
            <ShareButton
              url={current.permalink_url}
              className="lg-chip h-9 w-9"
              Icon={AppleShare}
            />
          </div>
        </div>

        <Scrubber />

        {/* Transport, as one cluster. Shuffle and repeat pushed out to the
            column's edges read as two unrelated controls that happen to share a
            row; next to the skips they read as part of the transport, which is
            what they are. */}
        <div className="flex items-center justify-center gap-5">
          <ShuffleButton />
          <NudgeGap />
          <PrevButton size="lg" />
          <PlayPauseButton size="lg" />
          <NextButton size="lg" />
          <NudgeGap />
          <RepeatButton />
        </div>

        <Volume />

        {/* Lyrics, queue, and everything else behind an ellipsis — which is
            where iOS puts the long tail. */}
        <div className="relative flex items-center justify-center gap-6">
          <Chip
            on={panel === "lyrics"}
            label={t.player.lyrics}
            onClick={() => setPanel(panel === "lyrics" ? "none" : "lyrics")}
          >
            <AppleQuote className="h-[18px] w-[18px]" />
          </Chip>
          <Chip
            on={panel === "queue"}
            label={t.player.queue}
            onClick={() => setPanel(panel === "queue" ? "none" : "queue")}
          >
            <AppleList className="h-[18px] w-[18px]" />
          </Chip>
          <Chip
            on={showMore}
            label={t.player.more}
            onClick={() => setShowMore((v) => !v)}
          >
            <AppleEllipsis className="h-[18px] w-[18px]" />
          </Chip>

          {showMore && (
            <Glass
              chrome
              className="pop-in absolute bottom-full left-1/2 z-30 mb-3 w-[19.5rem] -translate-x-1/2 p-2"
            >
              <MenuRow
                label={t.player.radio}
                disabled={radioLoading}
                onClick={() => {
                  void startRadio(current);
                  setShowMore(false);
                }}
              >
                <Radio className="h-[18px] w-[18px]" />
              </MenuRow>

              <MenuRow
                label={
                  isDownloaded
                    ? t.player.downloaded
                    : downloading
                      ? `${Math.round(
                          downloading.total
                            ? (downloading.received / downloading.total) * 100
                            : 0,
                        )}%`
                      : t.player.download
                }
                disabled={isDownloaded || !!downloading}
                onClick={() => void startDownload(current)}
              >
                <AppleDownload className="h-[18px] w-[18px]" />
              </MenuRow>

              <div className="my-1 h-[0.5px] bg-[var(--ios-separator)]" />

              {/* Speed, as a segmented row rather than a submenu. */}
              <div className="px-2 pb-1 pt-0.5 text-[0.8125rem] text-[var(--ios-label-2)]">
                {t.player.speed}
              </div>
              <div
                data-segmented
                className="mx-1 mb-1 flex gap-1 rounded-[var(--radius-control)] border border-border p-1"
              >
                {RATES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRate(r)}
                    className={cn(
                      "flex-1 rounded-[var(--radius-control)] py-1 text-center text-[0.75rem] tabular-nums",
                      rate === r
                        ? "bg-secondary text-secondary-foreground"
                        : "text-[var(--ios-label-2)]",
                    )}
                  >
                    {r}×
                  </button>
                ))}
              </div>

              <div className="my-1 h-[0.5px] bg-[var(--ios-separator)]" />

              <div className="px-2 pb-1 text-[0.8125rem] text-[var(--ios-label-2)]">
                {t.player.sleep}
              </div>
              <div className="flex flex-wrap gap-1 px-1 pb-1">
                {SLEEP_OPTIONS.map((min) => (
                  <button
                    key={min}
                    onClick={() => {
                      setSleep(min);
                      setShowMore(false);
                    }}
                    className="lg-chip h-8 flex-1 px-2 text-[0.8125rem] tabular-nums"
                  >
                    {min}
                  </button>
                ))}
              </div>
              {sleepAt && (
                <MenuRow
                  label={t.player.sleepCancel}
                  destructive
                  onClick={() => {
                    setSleep(null);
                    setShowMore(false);
                  }}
                >
                  <Moon className="h-[18px] w-[18px]" />
                </MenuRow>
              )}
            </Glass>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

/**
 * The scrubber, counting down.
 *
 * Its own component rather than the shared `SeekBar` because the difference is
 * the arrangement — elapsed on the left, *remaining* on the right, times under
 * the bar instead of beside it. Seeking is still the store's.
 */
function Scrubber() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const current = usePlayerStore((s) => s.current);
  const seek = usePlayerStore((s) => s.seek);

  // Fall back to the metadata duration (ms → s) until the audio reports its own.
  const total = duration || (current ? current.duration / 1000 : 0);
  const done = Math.min(position, total);
  const progress = total > 0 ? (done / total) * 100 : 0;

  return (
    <div className="w-full">
      <div className="group/seek relative">
        <div className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--ios-fill-3)]">
          <div
            className="seek-fill h-full rounded-full bg-[var(--foreground)]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={total || 0}
          step={0.5}
          value={done}
          onChange={(e) => seek(Number(e.currentTarget.value))}
          aria-label={t.player.seek}
          className="relative h-5 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--foreground)] [&::-webkit-slider-thumb]:opacity-0"
        />
      </div>
      <div className="mt-1 flex justify-between text-[0.6875rem] tabular-nums text-[var(--ios-label-2)]">
        <span>{formatTime(done)}</span>
        <span>-{formatTime(Math.max(0, total - done))}</span>
      </div>
    </div>
  );
}

/** Volume, between a quiet speaker and a loud one. */
function Volume() {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);

  return (
    <div className="flex items-center gap-3 px-1">
      <AppleSpeakerLow className="h-3.5 w-3.5 shrink-0 text-[var(--ios-label-2)]" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.currentTarget.value))}
        aria-label={t.player.volume}
        className="h-1 flex-1 cursor-pointer accent-[var(--foreground)]"
      />
      <AppleSpeakerHigh className="h-[18px] w-[18px] shrink-0 text-[var(--ios-label-2)]" />
    </div>
  );
}

/**
 * The cover.
 *
 * Paused artwork shrinks. iOS does this, and it is the clearest state indicator
 * in the whole view — worth keeping in both arrangements, which is why this is a
 * component rather than the same markup twice.
 */
function Cover({ art, playing }: { art: string | null; playing: boolean }) {
  if (!art) {
    return (
      <div className="aspect-square w-full rounded-[1.5rem] bg-[var(--ios-fill-3)]" />
    );
  }
  return (
    <img
      src={art}
      alt=""
      className={cn(
        "aspect-square w-full rounded-[1.5rem] object-cover shadow-[0_28px_80px_rgb(0_0_0/0.6)] transition-transform duration-[var(--motion-slow)]",
        playing ? "scale-100" : "scale-[0.88]",
      )}
    />
  );
}

/** Two pixels of daylight between the skips and the modes. */
function NudgeGap() {
  return <span className="w-1 shrink-0" aria-hidden />;
}

function Chip({
  on,
  label,
  onClick,
  children,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("lg-chip h-10 w-10", on && "text-brand")}
    >
      {children}
    </button>
  );
}

function MenuRow({
  label,
  onClick,
  disabled = false,
  destructive = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        // An iOS menu row: label left, glyph right, full-width target.
        "flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-[0.9375rem] disabled:opacity-40",
        destructive && "text-[var(--ios-red)]",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 opacity-70">{children}</span>
    </button>
  );
}
