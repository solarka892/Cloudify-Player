import { useState } from "react";
import { ChevronUp, Download, ListMusic, Mic2 } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useNavStore } from "@/stores/useNavStore";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ShareButton } from "@/components/ShareButton";
import { Ambient } from "@/components/Ambient";
import { Marquee } from "@/components/Marquee";
import { NowPlaying } from "./NowPlaying";
import { QueuePanel } from "./QueuePanel";
import { LyricsPanel } from "./Lyrics";
import {
  PlayPauseButton,
  RepeatButton,
  NextButton,
  PrevButton,
  SeekBar,
  ShuffleButton,
  VolumeControl,
} from "./controls";
import { useCompact } from "@/hooks/useCompact";
import type { Track } from "@/lib/tauri";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useArtwork } from "@/hooks/useArtwork";
import { ArtFallback } from "@/components/ArtFallback";

type Panel = "none" | "queue" | "lyrics";

/** The always-visible transport strip at the bottom of the window. */
export function PlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const [panel, setPanel] = useState<Panel>("none");
  const expanded = useNavStore((s) => s.nowPlaying);
  const setExpanded = useNavStore((s) => s.setNowPlaying);
  const compact = useCompact();
  // The bar answers to the same setting the full-screen player does: with the
  // blur chosen, the wallpaper is the app's lighting, and a solid slab across
  // the bottom is the one place it stops.
  const light = useSettingsStore((s) => s.backdrop.playerLight);

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const startDownload = useDownloadsStore((s) => s.start);

  const art = useArtwork(current, "t120x120");

  if (!current) return null;

  if (compact) {
    return (
      <>
        {expanded && <NowPlaying onClose={() => setExpanded(false)} />}
        <CompactBar track={current} onExpand={() => setExpanded(true)} />
      </>
    );
  }

  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];
  const progress = downloading?.total
    ? (downloading.received / downloading.total) * 100
    : null;

  return (
    <>
      {expanded && <NowPlaying onClose={() => setExpanded(false)} />}

      <div className="relative">
        {panel !== "none" && (
          // Narrow, and clear of both the window edge and the bar it sits on:
          // a floating panel that touches either reads as part of the chrome
          // rather than as something laid over it.
          <div className="panel panel-raised pop-in absolute bottom-full right-6 mb-3 flex h-[26rem] w-[20rem] flex-col overflow-hidden">
            {panel === "queue" ? (
              <QueuePanel onClose={() => setPanel("none")} />
            ) : (
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <Ambient />
                <div className="relative h-full overflow-y-auto">
                  {/* Smaller type: at this width the full-size lines would wrap
                      every few words and sit against the panel's edges. */}
                  <LyricsPanel track={current} compact />
                </div>
              </div>
            )}
          </div>
        )}

        <footer
          className={cn(
            "player-bar panel panel-liquid panel-chrome flex h-20 w-full items-center gap-4 rounded-none border-0 px-4",
            light === "blur" && "player-bar-see-through",
          )}
        >
          {/* Track. Fixed width, and the row cannot have it both ways.

              Sized to its contents, the transport starts wherever the title
              ends — so it lands somewhere new on every track, and the most-hit
              control in the app is never twice in the same place. Fixed, it
              stands still and a short title leaves a little air before the
              buttons. Air is the cheaper of the two: you do not aim at it.

              208px: it was 288 when four action buttons lived in here beside
              the title, and they are on the right now. The narrower it is the
              further left the transport starts, and the less air a short title
              leaves in front of it — the floor is the artwork plus something
              readable, and a title too long for what is left scrolls rather
              than truncating. See `Marquee`. */}
          <div className="flex w-52 min-w-0 items-center gap-3">
            <button
              onClick={() => setExpanded(true)}
              aria-label={t.player.expand}
              className="group/art relative h-12 w-12 shrink-0"
            >
              {art ? (
                <span className="art-frame block h-12 w-12 rounded-[var(--radius-control)]">
                  <img
                    src={art}
                    alt=""
                    className="artwork h-12 w-12 object-cover"
                  />
                </span>
              ) : (
                <ArtFallback
                  seed={current.id}
                  className="h-12 w-12 rounded-[var(--radius-control)]"
                  glyphClassName="h-5 w-5"
                />
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-control)] art-overlay opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/art:opacity-100">
                <ChevronUp className="h-5 w-5" />
              </span>
            </button>

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-1.5">
                <Marquee className="text-sm font-medium">{current.title}</Marquee>
              </span>
              {current.artist && (
                <span className="truncate text-xs text-muted-foreground">
                  {current.artist}
                </span>
              )}
            </div>

          </div>

          {/* Transport */}
          <div className="flex shrink-0 items-center gap-1">
            <ShuffleButton />
            <PrevButton />
            <PlayPauseButton />
            <NextButton />
            <RepeatButton />
          </div>

          {/* The one skin with a thread along the top edge of the window hides
              this: two progress bars disagreeing about where time lives is
              worse than either alone. What takes its place is `PlayerReadout`,
              which is a reading rather than a control. */}
          <div data-seekbar className="min-w-0 flex-1">
            <SeekBar />
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {/* What this does to the track, then what it opens. Hidden below
                `lg`, where the row genuinely runs out of width and the
                full-screen player is one click away. */}
            <div className="hidden shrink-0 items-center lg:flex">
              <LikeButton track={current} />
              <RepostButton track={current} />
              <ShareButton url={current.permalink_url} />

              <button
                onClick={() => void startDownload(current)}
                disabled={isDownloaded || !!downloading}
                aria-label={t.player.download}
                title={
                  isDownloaded
                    ? t.player.downloaded
                    : progress != null
                      ? `${Math.round(progress)}%`
                      : t.player.download
                }
                className={cn(
                  "relative shrink-0 rounded-[var(--radius-control)] p-1.5 transition-colors duration-[var(--motion-fast)] hover:bg-accent",
                  isDownloaded
                    ? "text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Download className="h-4 w-4" />
                {progress != null && (
                  <span
                    className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-[var(--radius-round)] bg-brand"
                    style={{ width: `${Math.max(4, progress)}%` }}
                  />
                )}
              </button>
            </div>

            <PanelToggle
              active={panel === "lyrics"}
              label={t.player.lyrics}
              onClick={() => setPanel(panel === "lyrics" ? "none" : "lyrics")}
            >
              <Mic2 className="h-4 w-4" />
            </PanelToggle>
            <PanelToggle
              active={panel === "queue"}
              label={t.player.queue}
              onClick={() => setPanel(panel === "queue" ? "none" : "queue")}
            >
              <ListMusic className="h-4 w-4" />
            </PanelToggle>
          </div>

          <VolumeControl />
        </footer>
      </div>
    </>
  );
}

/**
 * The phone-width player: a launcher for the full-screen view, plus the two
 * controls worth reaching for without opening it.
 *
 * Everything the wide bar carries — seeking, shuffle, repeat, volume, queue,
 * lyrics, download — lives in `NowPlaying`, which is already a full-screen
 * layout. Cramming any of it into 360px would mean sub-30px targets, so tapping
 * the bar opens that instead. Volume is left out entirely: the hardware buttons
 * do it better, and the OS shows its own slider.
 */
function CompactBar({ track, onExpand }: { track: Track; onExpand: () => void }) {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const art = useArtwork(track, "t120x120");
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <footer className="panel panel-liquid panel-chrome relative w-full rounded-none border-x-0 border-b-0">
      {/* Progress as a hairline along the top edge rather than a seek bar: a
          2px target cannot be dragged, but it answers "how far in am I". */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-border">
        <div className="progress-fill h-full bg-brand" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center gap-2 px-2 py-2">
        {/* One big target for the artwork and the titles together — the whole
            left side of the bar opens the player. */}
        <button
          onClick={onExpand}
          aria-label={t.player.expand}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] px-1 text-left"
        >
          {art ? (
            <span className="art-frame block h-11 w-11 shrink-0 rounded-[var(--radius-control)]">
              <img
                src={art}
                alt=""
                className="artwork h-11 w-11 object-cover"
              />
            </span>
          ) : (
            <ArtFallback
              seed={track.id}
              className="h-11 w-11 shrink-0 rounded-[var(--radius-control)]"
              glyphClassName="h-5 w-5"
            />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <Marquee className="text-sm font-medium">{track.title}</Marquee>
            </span>
            {track.artist && (
              <span className="truncate text-xs text-muted-foreground">
                {track.artist}
              </span>
            )}
          </span>
        </button>

        {/* Glyphs rather than a filled disc, and both at a thumb's size with a
            gap between them: they were touching, and one of the two was 32px. */}
        <div className="flex shrink-0 items-center gap-1">
          <PlayPauseButton variant="plain" />
          <NextButton size="lg" />
        </div>
      </div>
    </footer>
  );
}

function PanelToggle({
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
        "flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[var(--motion-fast)] hover:bg-accent",
        active ? "text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
