import { useState } from "react";
import { ChevronUp, Download, ListMusic, Mic2, Music } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useNavStore } from "@/stores/useNavStore";
import { LikeButton } from "@/components/LikeButton";
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
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

type Panel = "none" | "queue" | "lyrics";

/** The always-visible transport strip at the bottom of the window. */
export function PlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const [panel, setPanel] = useState<Panel>("none");
  const expanded = useNavStore((s) => s.nowPlaying);
  const setExpanded = useNavStore((s) => s.setNowPlaying);

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const startDownload = useDownloadsStore((s) => s.start);

  if (!current) return null;

  const art = artwork(current.artwork_url, "t120x120");
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
          <div className="panel panel-raised pop-in absolute bottom-full right-4 mb-2 flex h-[26rem] w-[24rem] flex-col overflow-hidden">
            {panel === "queue" ? (
              <QueuePanel onClose={() => setPanel("none")} />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <LyricsPanel track={current} />
              </div>
            )}
          </div>
        )}

        <footer className="panel panel-liquid panel-chrome flex h-20 w-full items-center gap-4 rounded-none border-x-0 border-b-0 px-4">
          {/* Track */}
          <div className="flex w-64 min-w-0 items-center gap-3">
            <button
              onClick={() => setExpanded(true)}
              aria-label={t.player.expand}
              className="group/art relative h-12 w-12 shrink-0"
            >
              {art ? (
                <img
                  src={art}
                  alt=""
                  className="h-12 w-12 rounded-[var(--radius-control)] object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-control)] bg-secondary">
                  <Music className="h-5 w-5 text-muted-foreground" />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-[var(--radius-control)] bg-black/50 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/art:opacity-100">
                <ChevronUp className="h-5 w-5 text-white" />
              </span>
            </button>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">{current.title}</span>
              {current.artist && (
                <span className="truncate text-xs text-muted-foreground">
                  {current.artist}
                </span>
              )}
            </div>

            <LikeButton track={current} />

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
                  className="absolute inset-x-1 bottom-0.5 h-0.5 rounded-full bg-brand"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              )}
            </button>
          </div>

          {/* Transport */}
          <div className="flex shrink-0 items-center gap-1">
            <ShuffleButton />
            <PrevButton />
            <PlayPauseButton />
            <NextButton />
            <RepeatButton />
          </div>

          <div className="min-w-0 flex-1">
            <SeekBar />
          </div>

          <div className="flex shrink-0 items-center gap-1">
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
