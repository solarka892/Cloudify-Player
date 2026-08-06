import { useState } from "react";
import {
  ChevronDown,
  Download,
  ListMusic,
  Mic2,
  Moon,
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
import { useCompact } from "@/hooks/useCompact";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";
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
  const [showSleep, setShowSleep] = useState(false);
  const compact = useCompact();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE);
  const toggleSide = (which: Exclude<Side, "none">) =>
    setSide(side === which ? "none" : which);

  if (!current) return null;

  const art = artwork(current.artwork_url, "t500x500");
  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-background",
        leaving ? "view-exit" : "view-enter",
      )}
    >
      {/* The cover, blown up and blurred, is the room's lighting. */}
      {art && (
        <div
          aria-hidden
          className="artwork pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-40 blur-3xl"
          style={{ backgroundImage: `url("${art}")` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-background/70" aria-hidden />

      <header className="pt-safe relative z-10 flex items-center gap-2 p-4">
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

      <div className="relative z-10 flex min-h-0 flex-1 justify-center gap-6 px-6 pb-4">
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
        <div className="flex min-h-0 w-full max-w-[34rem] shrink-0 flex-col justify-center gap-6">
          <div className="mx-auto w-full max-w-[min(30rem,44vh)]">
            {art ? (
              <img
                src={art}
                alt=""
                className="artwork aspect-square w-full rounded-[var(--radius-hero)] object-cover shadow-[var(--shadow-2)]"
              />
            ) : (
              <ArtFallback
                seed={current.id}
                className="aspect-square w-full rounded-[var(--radius-hero)]"
                glyphClassName="h-12 w-12"
              />
            )}
          </div>

          {/* Title left, the track's own three actions right — a centred title
              with the actions in the row below left the eye no fixed edge to
              read down, and the actions sat among controls they have nothing to
              do with. */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
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
            <div className="flex shrink-0 items-center gap-1 pt-0.5">
              <LikeButton track={current} size="md" />
              <RepostButton track={current} size="md" />
              <ShareButton url={current.permalink_url} size="md" />
            </div>
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

          <div className="flex justify-center">
            <VolumeControl />
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

          {/* Everything else: the long tail, on its own line. */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!visualizerOn && (
              <button
                onClick={() => setAudio({ visualizer: true })}
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
              >
                <AudioLines className="h-3.5 w-3.5" />
                {t.player.enableVisualizer}
              </button>
            )}

            <button
              onClick={() => void startRadio(current)}
              disabled={radioLoading}
              title={t.player.radio}
              className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <Radio className="h-3.5 w-3.5" />
              {t.player.radio}
            </button>

            <button
              onClick={() => void startDownload(current)}
              disabled={isDownloaded || !!downloading}
              title={t.player.download}
              className={cn(
                "flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-60",
                isDownloaded ? "text-brand" : "text-muted-foreground",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              {isDownloaded
                ? t.player.downloaded
                : downloading
                  ? `${Math.round(
                      downloading.total
                        ? (downloading.received / downloading.total) * 100
                        : 0,
                    )}%`
                  : t.player.download}
            </button>

            {/* Playback speed */}
            <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border p-0.5">
              {RATES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRate(r)}
                  className={cn(
                    "rounded-[calc(var(--radius-control)*0.8)] px-1.5 py-0.5 font-mono text-[11px] transition-colors duration-[var(--motion-fast)]",
                    rate === r
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}×
                </button>
              ))}
            </div>

            {/* Sleep timer */}
            <div className="relative">
              <button
                onClick={() => setShowSleep((v) => !v)}
                title={t.player.sleep}
                className={cn(
                  "flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground",
                  sleepAt ? "text-brand" : "text-muted-foreground",
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                {sleepAt
                  ? `${Math.max(0, Math.round((sleepAt - Date.now()) / 60000))}${t.player.minutesShort}`
                  : t.player.sleep}
              </button>
              {showSleep && (
                <div className="panel absolute bottom-full left-0 mb-2 flex flex-col p-1">
                  {SLEEP_OPTIONS.map((min) => (
                    <button
                      key={min}
                      onClick={() => {
                        setSleep(min);
                        setShowSleep(false);
                      }}
                      className="whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-left text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent"
                    >
                      {min} {t.player.minutes}
                    </button>
                  ))}
                  {sleepAt && (
                    <button
                      onClick={() => {
                        setSleep(null);
                        setShowSleep(false);
                      }}
                      className="whitespace-nowrap rounded-[var(--radius-control)] px-3 py-1.5 text-left text-xs text-destructive transition-colors duration-[var(--motion-fast)] hover:bg-accent"
                    >
                      {t.player.sleepCancel}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
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
          (sideBySide ? (
            <aside className="panel pop-in flex w-[26rem] shrink-0 flex-col overflow-hidden">
              {side === "queue" ? (
                <QueuePanel onClose={() => setSide("none")} />
              ) : (
                <LyricsSurface track={current} />
              )}
            </aside>
          ) : (
            <div className="pop-in pt-safe pb-safe absolute inset-0 z-30 flex flex-col bg-background/95 backdrop-blur-xl">
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
