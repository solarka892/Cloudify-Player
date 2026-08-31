import { useState } from "react";
import {
  ChevronDown,
  Download,
  ListMusic,
  Mic2,
  MoreHorizontal,
  Radio,
} from "lucide-react";
import type { Track } from "@/lib/tauri";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { LyricsPanel } from "./Lyrics";
import { QueuePanel } from "./QueuePanel";
import { Visualizer } from "./Visualizer";
import {
  PlayPauseButton,
  RepeatButton,
  NextButton,
  PrevButton,
  SeekBar,
  ShuffleButton,
  VolumeControl,
} from "./controls";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ShareButton } from "@/components/ShareButton";
import { Ambient } from "@/components/Ambient";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { AudioLines } from "lucide-react";
import { useDismiss } from "@/hooks/useDismiss";
import { useSwipeDown } from "@/hooks/useSwipeDown";
import { useCompact } from "@/hooks/useCompact";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useArtwork } from "@/hooks/useArtwork";
import { ArtFallback } from "@/components/ArtFallback";

type Side = "none" | "lyrics" | "queue";

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const RATES = [0.75, 1, 1.25, 1.5, 2];

/**
 * The width at which lyrics and the queue fit *beside* the player.
 *
 * Tailwind's `xl`. Below it they take the screen instead: the panel used to be
 * `hidden xl:flex`, so on anything narrower the buttons toggled a panel that was
 * never drawn and the feature looked broken rather than absent.
 */
const SIDE_BY_SIDE = "(min-width: 1280px)";

/**
 * Full-screen now-playing view: big artwork, transport, and a side panel for
 * lyrics or the queue.
 */
export function NowPlaying({ onClose }: { onClose: () => void }) {
  const { leaving, dismiss } = useDismiss(onClose);
  const swipe = useSwipeDown(dismiss);
  const current = usePlayerStore((s) => s.current);
  const rate = usePlayerStore((s) => s.rate);
  const setRate = usePlayerStore((s) => s.setRate);
  const sleepAt = usePlayerStore((s) => s.sleepAt);
  const setSleep = usePlayerStore((s) => s.setSleep);
  const startRadio = usePlayerStore((s) => s.startRadio);
  const radioLoading = usePlayerStore((s) => s.radioLoading);

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const startDownload = useDownloadsStore((s) => s.start);

  const visualizerOn = useSettingsStore((s) => s.audio.visualizer);
  const setAudio = useSettingsStore((s) => s.setAudio);
  const [side, setSide] = useState<Side>("none");
  const [showMore, setShowMore] = useState(false);
  const compact = useCompact();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  /**
   * Lyrics open *beside* the cover rather than in the side panel the queue uses.
   *
   * The arrangement the Apple shell had, and the reason it was worth keeping
   * when that shell went: words are the one thing here that wants the width. In
   * a 26rem column every line wraps two or three times and the song reads as a
   * paragraph; given the room to the left of the cover, a line is a line. The
   * queue is a list of short rows and is perfectly happy in the column.
   */
  const lyricsBeside = sideBySide && side === "lyrics";
  const toggleSide = (which: Exclude<Side, "none">) =>
    setSide(side === which ? "none" : which);

  const art = useArtwork(current, "t500x500");
  const palette = useSettingsStore((s) => s.artworkPalette);
  const light = useSettingsStore((s) => s.backdrop.playerLight);
  const lightStrength = useSettingsStore((s) => s.backdrop.playerLightStrength);
  const lightBrightness = useSettingsStore(
    (s) => s.backdrop.playerLightBrightness,
  );

  if (!current) return null;

  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];

  return (
    <div
      {...swipe}
      className={cn(
        // `safe-inset` because this is `fixed`: it is measured against the
        // viewport, so the app frame's own inset does not reach it.
        "safe-inset fixed inset-0 z-50 flex flex-col bg-background",
        leaving ? "view-exit" : "view-enter",
      )}
    >
      {/* The older lighting, kept as a choice: the cover blown up to fill the
          window and blurred. A wash of the record's colour over every pixel,
          which lights the corners as brightly as the middle and leaves the
          cover sitting *in* a field of itself — which is either the wrong thing
          entirely or exactly what someone wants, and there is no arguing that
          from here.

          The other setting draws nothing at all up here, so the glow further
          down has a dark room to fall into. */}
      {light === "blur" && art && (
        <>
          <div
            aria-hidden
            className="artwork art-frame pointer-events-none absolute inset-0 scale-125 bg-cover bg-center"
            style={{
              backgroundImage: `url("${art}")`,
              opacity: 0.55 * lightStrength,
              filter: `blur(64px) brightness(${lightBrightness})`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 bg-background/70"
            aria-hidden
          />
        </>
      )}

      <header className="relative z-10 flex items-center gap-2 p-4">
        <button
          onClick={dismiss}
          aria-label={t.player.collapse}
          className="rounded-[var(--radius-control)] p-2 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
        <span className="label text-xs font-semibold text-muted-foreground">
          {t.player.nowPlaying}
        </span>

        {/* On a phone these live in the row of chips down by the transport
            instead: the top corners of a 6" screen are the two places a thumb
            cannot go, and lyrics and the queue are things you reach for while
            listening rather than once on the way in. */}
        {!compact && (
          <div className="ml-auto flex items-center gap-1">
            <IconToggle
              active={side === "lyrics"}
              label={t.player.lyrics}
              onClick={() => toggleSide("lyrics")}
            >
              <Mic2 className="h-4 w-4" />
            </IconToggle>
            <IconToggle
              active={side === "queue"}
              label={t.player.queue}
              onClick={() => toggleSide("queue")}
            >
              <ListMusic className="h-4 w-4" />
            </IconToggle>
          </div>
        )}
      </header>

      <div
        className={cn(
          "relative z-10 flex min-h-0 flex-1 gap-6 px-6 pb-4",
          // Centred while the player is alone; spread, with more air between
          // them, once the words are sharing the window.
          lyricsBeside ? "gap-12" : "justify-center",
        )}
      >
        {lyricsBeside && (
          <div className="pop-in relative flex min-h-0 min-w-0 flex-1 flex-col justify-center">
            {/* The words fade out at both ends rather than being cut by one.

                A scrolling column has to stop somewhere, and stopping at a
                straight edge under the header reads as text hidden behind
                something — the eye takes the cut for an object. Fading it out
                says the same thing the cut was trying to: there is more, and it
                is on its way in.

                Both ends, because a fade at only the top would make the bottom
                edge the odd one. `currentColor` faded with `color-mix` again:
                a mask reads alpha, so no colour is named. */}
            <div
              className="no-scrollbar min-h-0 overflow-y-auto"
              style={{
                maskImage: "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, currentColor 35%, transparent) 4%, currentColor 12%, currentColor 88%, color-mix(in srgb, currentColor 35%, transparent) 96%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, color-mix(in srgb, currentColor 35%, transparent) 4%, currentColor 12%, currentColor 88%, color-mix(in srgb, currentColor 35%, transparent) 96%, transparent 100%)",
              }}
            >
              <LyricsPanel track={current} large />
            </div>
          </div>
        )}
        {/*
          The player column, laid out the way Apple mode lays it out — the
          arrangement and the sizes, not the look. Everything inside is still
          drawn from the ordinary skin tokens.

          Two things carry over. The column is a fixed 34rem rather than
          `flex-1`, so the cover does not drift about as the side panel opens
          and closes; and the cover is capped against the viewport *height*
          (`44vh`), because a width-capped square in a wide window came out
          small with dead space above and below it.
        */}
        <div className="flex min-h-0 w-full max-w-[40rem] shrink-0 flex-col justify-center gap-5">
          <div className="relative mx-auto w-full max-w-[min(38rem,54vh)]">
            {/* The same picture, behind the picture: scaled well past its own
                edges and blurred until it is no longer an image, only the light
                one would give off. Saturated on the way, because blur averages
                colour toward grey and a glow that has gone grey reads as a
                shadow rather than a light.

                Wide, but short of the whole window. A tight halo has an
                outline whatever its blur, and an outline is what gives away
                that this is a rectangle behind a square rather than light in a
                room — so it has to reach well past the cover. Reaching the far
                corners is the other failure: light everywhere is a tint, and a
                tinted screen has no source. Somewhere between, and this is it.

                Saturation is raised because blur dilutes colour toward grey,
                and dimming it dilutes it again. Both of those were tuned by
                eye, several times, in both directions.

                The mask is what makes it a glow rather than a blurred square,
                and it has six stops rather than two on purpose: a straight ramp
                from opaque to nothing still reads as a ring, because the eye
                finds the edge of a linear falloff. Easing it out over a long
                tail leaves nothing to find.
                Blur alone softens an edge; it does not remove one, so the light
                still ended on four sides at the same distance and the corners
                reached furthest — which is the shape of a rectangle, not of
                something shining. Radial falloff takes it to nothing evenly in
                every direction.

                `currentColor` rather than a colour: a mask reads alpha and
                ignores hue, so this only has to be opaque, and naming a colour
                here would be a colour in the source that paints nothing. */}
            {/* Under the glow, the sleeve's colours as lights of their own.

                A blurred cover glows with whatever the cover *is*, which fails
                on the ones that are nearly black: the light is black too, and
                the screen goes flat with the cover sitting in nothing. So there
                is always this underneath, built from what the sampler found on
                the sleeve — and on a black one it still finds the one thing
                there with any colour in it.

                All of them, not just the first. One colour behind a four-colour
                cover reads as a lamp someone pointed at it; several, set apart
                and overlapping, read as the picture giving light off. They are
                placed rather than centred for the same reason — light from a
                flat thing does not come from its middle.

                A cover with colour in it drowns this out with its own; a black
                one is left with a halo instead of a void. */}
            {light === "glow" && (
              <div
                aria-hidden
                className="glow-lights pointer-events-none absolute inset-0 -z-20 scale-[4]"
                style={{
                  ...glowVars(palette),
                  background: GLOW,
                  filter: `brightness(${lightBrightness})`,
                  // The layer is a rectangle, and its lights do not all fade to
                  // nothing before they reach its sides — a spot placed near one
                  // edge still has colour left when the element stops, and where
                  // it stops is a straight line. Most visible with the lyrics
                  // open, which pushes the cover right and leaves that line down
                  // the middle of the screen. This dissolves the layer's own
                  // edges, so there is no boundary for the light to end at.
                  maskImage: "radial-gradient(closest-side, currentColor 40%, color-mix(in srgb, currentColor 45%, transparent) 66%, color-mix(in srgb, currentColor 15%, transparent) 84%, transparent 100%)",
                  WebkitMaskImage: "radial-gradient(closest-side, currentColor 40%, color-mix(in srgb, currentColor 45%, transparent) 66%, color-mix(in srgb, currentColor 15%, transparent) 84%, transparent 100%)",
                  // Weaker than the cover's own light above it: this is the
                  // colour underneath rather than the source.
                  opacity: 0.55 * lightStrength,
                }}
              />
            )}
            {light === "glow" && art && (
              <img
                src={art}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 -z-10 h-full w-full scale-[3] object-cover"
                style={{
                  opacity: lightStrength,
                  filter: `blur(110px) saturate(1.8) brightness(${lightBrightness})`,
                  maskImage: "radial-gradient(closest-side, currentColor 8%, color-mix(in srgb, currentColor 72%, transparent) 26%, color-mix(in srgb, currentColor 42%, transparent) 44%, color-mix(in srgb, currentColor 20%, transparent) 62%, color-mix(in srgb, currentColor 8%, transparent) 80%, transparent 100%)",
                  WebkitMaskImage: "radial-gradient(closest-side, currentColor 8%, color-mix(in srgb, currentColor 72%, transparent) 26%, color-mix(in srgb, currentColor 42%, transparent) 44%, color-mix(in srgb, currentColor 20%, transparent) 62%, color-mix(in srgb, currentColor 8%, transparent) 80%, transparent 100%)",
                }}
              />
            )}
            {art ? (
              <span className="art-frame block aspect-square w-full rounded-[var(--radius-hero)] shadow-[var(--shadow-2)]">
                <img
                  src={art}
                  alt=""
                  className="artwork h-full w-full object-cover"
                />
              </span>
            ) : (
              <ArtFallback
                seed={current.id}
                className="aspect-square w-full rounded-[var(--radius-hero)]"
                glyphClassName="h-12 w-12"
              />
            )}
          </div>

          {/* Centred, under a centred cover, above a centred transport. It was
              left-aligned to give the eye a fixed edge to read down — which was
              the right call while three action buttons sat opposite it on the
              same line. They moved to the row below, and a lone left-aligned
              title under a centred column is just the one thing out of line. */}
          <div className="min-w-0 text-center">
            <h2
              className="truncate text-[1.375rem] font-bold leading-tight tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {current.title}
            </h2>
            {current.artist && (
              <p className="truncate text-[1.0625rem] leading-snug text-muted-foreground">
                {current.artist}
              </p>
            )}
          </div>

          {visualizerOn && (
            <Visualizer mode="bars" height={40} className="w-full opacity-80" />
          )}

          <SeekBar />

          <div className="flex items-center justify-center gap-5">
            <ShuffleButton />
            <PrevButton size="lg" />
            <PlayPauseButton size="lg" />
            <NextButton size="lg" />
            <RepeatButton />
          </div>

          {/* The last row, and the three things that were scattered.

              Liking, reposting and sharing sat up beside the title, where they
              competed with the one thing on this screen that is set in display
              type. Volume had a centred row of its own with nothing else in it.
              The overflow button had another. Three rows for three controls, on
              a screen whose whole argument is the cover.

              One row instead, and the overflow button in the middle of it —
              not the middle of the group, the middle of the *window*. Three
              columns with equal sides put it on the same axis the play button
              above stands on, whatever is either side of it: liking a track
              changes no width, but the volume slider and a running sleep timer
              both do, and a centred group would have drifted with them. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex items-center justify-end gap-1">
              <LikeButton track={current} size="md" />
              <RepostButton track={current} size="md" />
              <ShareButton url={current.permalink_url} size="md" />
            </div>

            {/* The long tail, behind one button.

                Six controls of six different widths — visualiser, radio,
                download, five speed chips, a sleep timer — wrapped onto two rows
                and read as a pile of tags stuck under a player. Not one of them
                is reached for often, and together they were the loudest thing on
                the screen after the cover. One button now, and a menu behind it.

                The button says something when the menu is shut: a sleep timer
                that is running is the one setting in here that the app is doing
                something about, so it lights. */}
            <div className="relative shrink-0">
              <button
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-label={t.player.more}
                title={t.player.more}
                className={cn(
                  // No label and no frame. It was a bordered chip with a word
                  // in it beside three bare glyphs — the widest thing in the
                  // row and the one saying least, drawn as the most important.
                  "flex items-center gap-1.5 rounded-[var(--radius-control)] p-1.5 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground",
                  sleepAt
                    ? "text-brand"
                    : showMore
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                <MoreHorizontal className="h-4 w-4" />
                {/* The one thing still worth words here: a sleep timer counting
                    down is the app doing something rather than offering to. */}
                {sleepAt
                  ? `${Math.max(0, Math.round((sleepAt - Date.now()) / 60000))}${t.player.minutesShort}`
                  : null}
              </button>

              {showMore && (
                <div className="panel pop-in absolute bottom-full right-0 mb-2 flex w-60 flex-col gap-0.5 p-1.5">
                  {/* A switch, not a one-way door. It was only drawn while the
                      visualiser was off — which turned it on and then removed the
                      only thing that could turn it off again. The row stays and
                      says which way it is by its colour, like every other state
                      in this app. */}
                  <MenuRow
                    icon={<AudioLines className="h-4 w-4" />}
                    label={t.audio.visualizer}
                    active={visualizerOn}
                    onClick={() => setAudio({ visualizer: !visualizerOn })}
                  />

                  <MenuRow
                    icon={<Radio className="h-4 w-4" />}
                    label={t.player.radio}
                    disabled={radioLoading}
                    onClick={() => {
                      void startRadio(current);
                      setShowMore(false);
                    }}
                  />

                  <MenuRow
                    icon={<Download className="h-4 w-4" />}
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
                    active={isDownloaded}
                    onClick={() => void startDownload(current)}
                  />

                  <MenuGroup label={t.player.speed}>
                    {RATES.map((r) => (
                      <Chip key={r} active={rate === r} onClick={() => setRate(r)}>
                        {r}×
                      </Chip>
                    ))}
                  </MenuGroup>

                  <MenuGroup label={t.player.sleep}>
                    {SLEEP_OPTIONS.map((min) => (
                      <Chip
                        key={min}
                        onClick={() => {
                          setSleep(min);
                          setShowMore(false);
                        }}
                      >
                        {min}
                      </Chip>
                    ))}
                    {sleepAt && (
                      <Chip
                        onClick={() => {
                          setSleep(null);
                          setShowMore(false);
                        }}
                        className="text-destructive"
                      >
                        ×
                      </Chip>
                    )}
                  </MenuGroup>
                </div>
              )}
            </div>
            {/* Narrower here, and with its own trailing padding dropped.

                Both are about balance rather than the slider. The row reads as
                a line with the overflow button at its centre, and the eye wants
                the same amount of it on either side — three glyphs to the left
                against an icon and a slider to the right. At the player bar's
                width that slider ran half again as long as the glyphs, and the
                row looked hung off its own middle. */}
            <div className="flex justify-start">
              <VolumeControl className="w-24 pr-0" />
            </div>
          </div>

          {/* The two panels, where the thumb is. Full-width rows rather than
              chips: these are the ones reached for mid-song, and they open a
              whole screen, so they should not be the smallest targets on it. */}
          {compact && (
            <div className="flex items-center gap-2">
              <PanelButton
                active={side === "lyrics"}
                label={t.player.lyrics}
                onClick={() => toggleSide("lyrics")}
              >
                <Mic2 className="h-4 w-4" />
              </PanelButton>
              <PanelButton
                active={side === "queue"}
                label={t.player.queue}
                onClick={() => toggleSide("queue")}
              >
                <ListMusic className="h-4 w-4" />
              </PanelButton>
            </div>
          )}

        </div>

        {/*
          Lyrics or the queue: beside the player where both fit, over it where
          they do not.

          `xl`, not `lg`: the player column is a fixed 34rem, and 34 plus this
          panel's 26 does not fit inside a 1024px window without one of them
          being squeezed — which would move the cover, the one thing the eye is
          anchored to. Below that the panel used to be `hidden`, so on a phone
          both buttons did nothing at all.
        */}
        {side !== "none" &&
          !lyricsBeside &&
          (sideBySide ? (
            <aside className="panel pop-in flex w-[26rem] shrink-0 flex-col overflow-hidden">
              {side === "queue" ? (
                <QueuePanel onClose={() => setSide("none")} />
              ) : (
                <LyricsSurface track={current} />
              )}
            </aside>
          ) : (
            <div className="pop-in absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-xl">
              <header className="flex items-center gap-2 p-4">
                <button
                  onClick={() => setSide("none")}
                  aria-label={t.player.collapse}
                  className="rounded-[var(--radius-control)] p-2 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
                >
                  <ChevronDown className="h-5 w-5" />
                </button>
                {/* Only for lyrics: the queue names itself in its own header. */}
                {side === "lyrics" && (
                  <span className="label text-xs font-semibold text-muted-foreground">
                    {t.player.lyrics}
                  </span>
                )}
              </header>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {side === "queue" ? (
                  <QueuePanel />
                ) : (
                  <LyricsSurface track={current} />
                )}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/** The lyrics surface: a scrolling transcript over its own soft lighting. */
function LyricsSurface({ track }: { track: Track }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <Ambient />
      <div className="relative h-full overflow-y-auto">
        <LyricsPanel track={track} />
      </div>
    </div>
  );
}

/** A full-width toggle for one of the panels. Compact layout only. */
/**
 * A row in the overflow menu: an icon, a label, and the whole width as target.
 *
 * Deliberately not a chip. These were chips, side by side, and six chips of six
 * widths is a shape the eye has to parse before it can read any of them; a
 * column of rows is read top to bottom without being looked at.
 */

/** Where each of the sleeve's colours is hung, in order of prominence. */
const GLOW_SPOTS = ["50% 46%", "28% 30%", "73% 34%", "46% 74%"] as const;

/**
 * The lights, as one gradient that never changes.
 *
 * Every colour is `var(--glow-N)` rather than the colour itself, and that is
 * the whole trick: a gradient is a string, and swapping one string for another
 * cannot be animated — there is no halfway between them. Keep the string and
 * change what the names point at, and the browser cross-fades each colour on
 * its own. See the `@property` block in `globals.css`.
 */
const GLOW = GLOW_SPOTS.map(
  (spot, i) =>
    `radial-gradient(circle at ${spot}, var(--glow-${i + 1}) 0%, ` +
    `color-mix(in srgb, var(--glow-${i + 1}) 30%, transparent) 34%, transparent 70%)`,
).join(", ");

/**
 * The sleeve's colours, as the variables the gradient above reads.
 *
 * Falls back to the accent when the sampler found nothing — a greyscale sleeve,
 * or a cover the CDN would not let us read. Spots with no colour to put in them
 * are set transparent rather than left alone: an unset one would keep the
 * previous track's colour and the glow would accumulate sleeves.
 */
function glowVars(palette: string[] | null): React.CSSProperties {
  const colours = palette?.length ? palette : ["var(--brand)"];
  const vars: Record<string, string> = {};
  GLOW_SPOTS.forEach((_, i) => {
    vars[`--glow-${i + 1}`] = colours[i] ?? "transparent";
  });
  return vars as React.CSSProperties;
}

function MenuRow({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-1.5 text-left text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-50",
        active ? "text-brand" : "text-foreground",
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

/** A named row of choices — speed, sleep — under a caption. */
function MenuGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 pb-1 pt-2">
      <div className="label pb-1 text-[0.625rem] text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** One choice inside a [[MenuGroup]]. Numbers, so `.readout`. */
function Chip({
  active,
  onClick,
  className,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "readout rounded-[var(--radius-control)] border border-border px-1.5 py-0.5 text-[11px] transition-colors duration-[var(--motion-fast)] hover:bg-accent",
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function PanelButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-control)] border py-2.5 text-sm font-medium transition-colors duration-[var(--motion-fast)]",
        active
          ? "border-brand/40 bg-brand/10 text-brand"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function IconToggle({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[var(--motion-fast)] hover:bg-accent",
        active ? "text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
