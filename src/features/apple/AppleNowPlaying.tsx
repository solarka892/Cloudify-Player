import { useState } from "react";
import { Moon, Radio } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
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
  AppleHeart,
  AppleList,
  AppleQuote,
  AppleRepost,
  AppleShare,
  AppleSpeakerHigh,
  AppleSpeakerLow,
} from "./icons";
import { useDismiss } from "@/hooks/useDismiss";
import { useSwipeDown } from "@/hooks/useSwipeDown";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useArtwork } from "@/hooks/useArtwork";

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
 *   - Title and artist have the line to themselves, centred on the same axis as
 *     everything below them.
 *   - The column is five blocks, not six floors: the transport keeps the volume
 *     under it as one group, and the track's own actions sit in the bottom row
 *     with the view's. Everything below the cover used to be a row of its own
 *     holding two or three controls, and the height that cost came straight off
 *     the cover, which is the thing the view is for.
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
  // Pulling the sheet down closes it, the way every music app on the platform
  // has since the gesture existed.
  const swipe = useSwipeDown(dismiss);
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

  const art = useArtwork(current, "t500x500");

  if (!current) return null;

  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];

  return (
    <div
      {...swipe}
      className={cn(
        "lg-on-artwork safe-inset fixed inset-0 z-50 flex flex-col overflow-hidden bg-black",
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
      {/* `top-4` measures from the safe area, not from the window: the root
          above carries `safe-inset`, so on a phone whose status bar is taller
          than 36px this button is no longer under the clock. */}
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

      {/* `--np-cover` is how wide the artwork came out, published so the things
          under it can line up with it instead of guessing. It is not a constant:
          the cover is capped against the window's *height*, so on a short window
          it is the height that decides, and anything hard-coded to 30rem would
          hang off the sides exactly when the cover shrank. */}
      <div
        className="flex min-h-0 w-full max-w-[34rem] shrink-0 flex-col justify-center gap-6"
        style={{ "--np-cover": "min(30rem, 44vh)" } as React.CSSProperties}
      >
        {/* The cover — or the queue, on a window with nowhere to float it. */}
        {queueInPlace ? (
          <Glass chrome className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <QueuePanel onClose={() => setPanel("none")} />
          </Glass>
        ) : (
          <div className="mx-auto w-full max-w-[var(--np-cover)]">
            <Cover art={art} playing={isPlaying} />
          </div>
        )}

        {/* Title and artist, centred, across the full width.

            They were left-aligned while the track's actions sat beside them —
            a line with something at each end has to start at an edge. With the
            actions moved down to the bottom row there is nothing left to align
            *to*, and everything else in the column below is centred on the same
            axis: the transport, the chips, the volume's own symmetry. A single
            left-aligned line among them read as the one thing that had not been
            told where the middle was. */}
        <div className="min-w-0 text-center">
          <h2
            className="type-title truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {current.title}
          </h2>
          {current.artist && (
            <p className="type-body truncate text-[var(--ios-label-2)]">
              {current.artist}
            </p>
          )}
        </div>

        {/*
          The controls, as one block: scrub, transport, volume.

          Half the column's gap between the three of them. They are one thing —
          where the track is, what it is doing, how loud — and at the column's
          full 24px they stood apart like three unrelated rows, with the widest
          hole of the lot between the elapsed time and the buttons. The gap there
          is also the one that measures smallest and *looks* largest: a line of
          11px numerals leaves its own leading below it and a 44px button carries
          another dozen pixels of padding inside its edge, so the daylight
          between what you actually see is roughly double what the rule says.

          Shuffle and repeat pushed out to the column's edges read as two
          unrelated controls that happen to share a row; next to the skips they
          read as part of the transport, which is what they are.

          The volume is not here at all any more, and the reason is worth
          keeping. Beside the buttons it filled the right half of the line and
          left the left half empty — a centred cluster with weight on one side
          is the one arrangement spacing cannot save. Under them, full width, it
          was symmetrical and still wrong: a long thin capsule with a fill, four
          centimetres below another long thin capsule with a fill. Two progress
          bars, one of which does not measure progress. It lives on a chip in
          the row below now; see `VolumeChip`.
        */}
        <div className="flex flex-col gap-3">
          {/* Only as wide as the cover. The column is 34rem and the artwork is
              usually a good deal less than that, so a full-width scrubber ran
              out past the picture on both sides — a bar wider than the thing it
              belongs to, which is the one proportion in this view the eye
              actually notices.

              The title above is left alone deliberately: it is text, not a bar,
              and capping it would only truncate longer names sooner. */}
          <div className="mx-auto w-full max-w-[var(--np-cover)]">
            <Scrubber />
          </div>

          <div className="flex items-center justify-center gap-5">
            <ShuffleButton />
            <NudgeGap />
            <PrevButton size="lg" />
            <PlayPauseButton size="lg" />
            <NextButton size="lg" />
            <NudgeGap />
            <RepeatButton />
          </div>
        </div>

        {/*
          Everything that is not the transport, in one evenly spaced row: what
          this track can have done to it, then what this view can show.

          These were briefly two groups with a wider gap between them. It read as
          a hole where a seventh button had failed to render, and that is the
          trap with grouping by space alone — the gap has to be large enough to
          mean something, and at that size it stops being a row. Six identical
          chips at one pitch are a toolbar, which is what this is; the ordering
          already puts like next to repost and lyrics next to the queue, and it
          carries the grouping on its own without spending anything on it.
        */}
        <div className="relative flex items-center justify-center gap-4">
          <LikeButton track={current} className="lg-action h-10 w-10" Icon={AppleHeart} />
          <RepostButton track={current} className="lg-action h-10 w-10" Icon={AppleRepost} />
          <ShareButton
            url={current.permalink_url}
            className="lg-action h-10 w-10"
            Icon={AppleShare}
          />
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

          <VolumeChip />

          {showMore && (
            <>
              {/*
                The way out, and nothing else.

                It used to dim the screen as well, and that dimming was doing a
                real job at the time: the menu was a 62% pane laid across the
                title and the scrubber, and without something between them you
                read half a title through it and could not tell which layer you
                were meant to be looking at. The menu is now a near-opaque sheet
                (see `.lg.pop-in` in `apple.css`), so it hides what is under it
                by itself, and a scrim on top of that is a second answer to a
                question already answered — it only darkens the artwork, which
                is the thing this whole view is built to show.

                The layer stays, invisible, because dismissal is the other half
                of what it was for. Without it the only way out is a second
                press on the ellipsis, which is the one place nobody looks.
              */}
              <button
                type="button"
                aria-label={t.player.close}
                onClick={() => setShowMore(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <Glass
                chrome
                className="pop-in absolute bottom-full left-1/2 z-30 mb-3 w-[19.5rem] -translate-x-1/2 p-1.5"
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

              <Rule />

              {/* Speed, as a segmented row rather than a submenu: five values,
                  one of them current, is what a segmented control is for, and a
                  submenu would hide the answer to "how fast is it now". */}
              <Section label={t.player.speed}>
                <div data-segmented className="flex">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r)}
                      className={cn(
                        "type-label flex-1 py-1 text-center tabular-nums",
                        rate === r
                          ? "bg-secondary text-secondary-foreground"
                          : "text-[var(--ios-label-2)]",
                      )}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
              </Section>

              {/* Sleep is five *actions*, not five states, so it deliberately
                  does not wear the segmented track above: nothing here is
                  "currently selected", and a knob sliding between them would
                  claim otherwise. Equal columns rather than `flex-1`, so five
                  labels of different widths still make an even row. */}
              <Section label={t.player.sleep}>
                <div className="grid grid-cols-5 gap-1">
                  {SLEEP_OPTIONS.map((min) => (
                    <button
                      key={min}
                      onClick={() => {
                        setSleep(min);
                        setShowMore(false);
                      }}
                      className="rounded-[0.4375rem] bg-[var(--ios-fill-3)] type-label py-1.5 tabular-nums transition-colors duration-[var(--motion-fast)] hover:bg-[var(--ios-fill-1)]"
                    >
                      {min}
                    </button>
                  ))}
                </div>
              </Section>

              {sleepAt && (
                <>
                  <Rule />
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
                </>
              )}
              </Glass>
            </>
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
        <div className="seek-track pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-[var(--ios-fill-3)]">
          <div
            className="seek-fill h-full rounded-[var(--radius-round)] bg-[var(--foreground)]"
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
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[var(--radius-round)]
            [&::-webkit-slider-thumb]:bg-[var(--foreground)] [&::-webkit-slider-thumb]:opacity-0"
        />
      </div>
      <div className="readout type-micro mt-1 flex justify-between text-[var(--ios-label-2)]">
        <span>{formatTime(done)}</span>
        <span>-{formatTime(Math.max(0, total - done))}</span>
      </div>
    </div>
  );
}

/**
 * Volume, between a quiet speaker and a loud one.
 *
 * Built like `Scrubber` rather than left as a native range: a thin capsule with
 * a fill and no visible thumb. The default control paints a fat white knob that
 * nothing else in the view has, and two bars a few pixels apart in two different
 * idioms is the kind of mismatch that reads as unfinished long before anyone
 * works out which one is wrong.
 *
 * The two glyphs are what keep it from being read as a second progress bar. They
 * are drawn at the same size, not at the sizes their marks suggest: the quiet
 * speaker fills less than half its box, so matched by height it comes out a
 * third the weight of the loud one and looks like a stray arrowhead.
 */
/** How much one notch of the wheel moves the volume. */
const WHEEL_STEP = 0.05;

/**
 * Volume, folded into a chip.
 *
 * It was a full-width slider under the transport, and the trouble was never
 * where it sat — it was what it looked like. A long thin capsule with a fill,
 * a few centimetres under the scrubber, which is also a long thin capsule with
 * a fill. The eye reads two progress bars and has to work out which of them is
 * time. Making them *less* alike would have been the other way out, but a
 * volume slider is not something you look at; it is something you reach for
 * about once an hour, and a control that is only occasionally wanted should not
 * be the second-largest object on the screen.
 *
 * So it is a chip like its neighbours, and the slider comes out on a click. The
 * wheel works on the chip itself, which is how most people set volume on a
 * desktop anyway — that is the path with no clicks at all, and the popover is
 * there for the pointer.
 */
function VolumeChip() {
  const [open, setOpen] = useState(false);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const level = muted ? 0 : volume;
  const Glyph = level === 0 ? AppleSpeakerLow : AppleSpeakerHigh;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onWheel={(e) => {
          const next = level + (e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
          setVolume(Math.min(1, Math.max(0, next)));
        }}
        aria-label={t.player.volume}
        title={t.player.volume}
        data-on={open ? "true" : undefined}
        className="lg-action h-10 w-10"
      >
        <Glyph className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <>
          {/* Invisible, and the way out — the same arrangement the ellipsis
              menu uses. */}
          <button
            type="button"
            aria-label={t.player.close}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <Glass
            chrome
            className="pop-in absolute bottom-full left-1/2 z-30 mb-3 w-56 -translate-x-1/2 px-3 py-2.5"
          >
            <Volume />
          </Glass>
        </>
      )}
    </div>
  );
}

function Volume() {
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const level = muted ? 0 : volume;

  return (
    <div className="flex items-center gap-3 px-1">
      <AppleSpeakerLow className="h-[18px] w-[18px] shrink-0 text-[var(--ios-label-2)]" />
      <div className="relative flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-[var(--radius-round)] bg-[var(--ios-fill-3)]">
          <div
            className="h-full rounded-[var(--radius-round)] bg-[var(--foreground)]"
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
            [&::-webkit-slider-thumb]:bg-[var(--foreground)] [&::-webkit-slider-thumb]:opacity-0"
        />
      </div>
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
      // The state goes out as an attribute, not as a colour class: `.lg-action`
      // colours "on" itself, and an unlayered rule beats a utility. A
      // `text-brand` here would look right until someone read the stylesheet
      // and wondered which of the two was in charge — and it would have been
      // silently losing.
      data-on={on ? "true" : undefined}
      className="lg-action h-10 w-10"
    >
      {children}
    </button>
  );
}

/**
 * The line between two parts of a menu.
 *
 * Inset to where the labels start, not run wall to wall. A full-width rule
 * chops the menu into slabs; one that begins under the text reads as a pause in
 * a list, which is what it is. iOS insets every separator in a grouped list for
 * the same reason.
 */
function Rule() {
  return <div className="mx-2.5 my-1.5 h-[0.5px] bg-[var(--ios-separator)]" />;
}

/**
 * A captioned group inside the menu.
 *
 * Exists to hold the alignment. The caption, the rows above it and the control
 * under it were each carrying their own horizontal padding — 2, 2.5 and 1 — so
 * nothing in the menu lined up with anything else. One box owns the inset now
 * and its contents inherit it.
 */
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2.5 pb-1 pt-0.5">
      <div className="type-caption pb-1.5 text-[var(--ios-label-2)]">
        {label}
      </div>
      {children}
    </div>
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
        "flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] type-body px-2.5 py-2 text-left disabled:opacity-40",
        destructive && "text-[var(--ios-red)]",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 opacity-70">{children}</span>
    </button>
  );
}
