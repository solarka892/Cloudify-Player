import { useState } from "react";
import {
  ChevronDown,
  Download,
  ListMusic,
  Mic2,
  Moon,
  Radio,
} from "lucide-react";
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
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type Side = "none" | "lyrics" | "queue";

const SLEEP_OPTIONS = [15, 30, 45, 60, 90];
const RATES = [0.75, 1, 1.25, 1.5, 2];

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
          className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-40 blur-3xl"
          style={{ backgroundImage: `url("${art}")` }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-background/70" aria-hidden />

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

        <div className="ml-auto flex items-center gap-1">
          <IconToggle
            active={side === "lyrics"}
            label={t.player.lyrics}
            onClick={() => setSide(side === "lyrics" ? "none" : "lyrics")}
          >
            <Mic2 className="h-4 w-4" />
          </IconToggle>
          <IconToggle
            active={side === "queue"}
            label={t.player.queue}
            onClick={() => setSide(side === "queue" ? "none" : "queue")}
          >
            <ListMusic className="h-4 w-4" />
          </IconToggle>
        </div>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 gap-6 px-6 pb-4">
        {/* Artwork + transport */}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-6">
          <div className="relative w-full max-w-sm">
            {art ? (
              <img
                src={art}
                alt=""
                className="aspect-square w-full rounded-[var(--radius-hero)] object-cover shadow-[var(--shadow-2)]"
              />
            ) : (
              <div className="aspect-square w-full rounded-[var(--radius-hero)] bg-secondary" />
            )}
          </div>

          <div className="w-full max-w-xl text-center">
            <h2
              className="truncate text-2xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {current.title}
            </h2>
            {current.artist && (
              <p className="truncate text-sm text-muted-foreground">
                {current.artist}
              </p>
            )}
          </div>

          {visualizerOn ? (
            <Visualizer mode="bars" height={48} className="w-full max-w-xl opacity-80" />
          ) : (
            <button
              onClick={() => setAudio({ visualizer: true })}
              className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <AudioLines className="h-3.5 w-3.5" />
              {t.player.enableVisualizer}
            </button>
          )}

          <div className="w-full max-w-xl">
            <SeekBar />
          </div>

          <div className="flex items-center gap-2">
            <ShuffleButton />
            <PrevButton size="lg" />
            <PlayPauseButton size="lg" />
            <NextButton size="lg" />
            <RepeatButton />
          </div>

          {/* Secondary actions */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <LikeButton track={current} size="md" />
            <RepostButton track={current} size="md" />
            <ShareButton url={current.permalink_url} size="md" />
            <VolumeControl />

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

        {/* Side panel */}
        {side !== "none" && (
          <aside className="panel pop-in hidden w-[26rem] shrink-0 overflow-hidden lg:flex lg:flex-col">
            {side === "queue" ? (
              <QueuePanel onClose={() => setSide("none")} />
            ) : (
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <Ambient />
                <div className="relative h-full overflow-y-auto">
                  <LyricsPanel track={current} />
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
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
