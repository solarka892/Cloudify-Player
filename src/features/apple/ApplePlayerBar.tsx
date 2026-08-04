import { useState } from "react";
import { ChevronUp, ListMusic, Mic2, Music } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { useNavStore } from "@/stores/useNavStore";
import { LikeButton } from "@/components/LikeButton";
import { RepostButton } from "@/components/RepostButton";
import { ShareButton } from "@/components/ShareButton";
import { Ambient } from "@/components/Ambient";
import { AppleNowPlaying } from "./AppleNowPlaying";
import { QueuePanel } from "@/features/player/QueuePanel";
import { LyricsPanel } from "@/features/player/Lyrics";
import {
  PlayPauseButton,
  RepeatButton,
  NextButton,
  PrevButton,
  SeekBar,
  ShuffleButton,
  VolumeControl,
} from "@/features/player/controls";
import {
  TransportIcons,
  type TransportGlyphs,
} from "@/features/player/transport-icons";
import { useCompact } from "@/hooks/useCompact";
import { Glass } from "./Glass";
import {
  AppleBackward,
  AppleDownload,
  AppleForward,
  ApplePause,
  ApplePlay,
  AppleShare,
} from "./icons";
import type { Track } from "@/lib/tauri";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";

type Panel = "none" | "queue" | "lyrics";

/**
 * SF's transport, handed to the shared controls through their context. Two
 * triangles for backward and forward, not a triangle and a bar — that is what
 * Apple draws, and it is the difference you notice without being able to name.
 */
const APPLE_TRANSPORT: TransportGlyphs = {
  Play: ApplePlay,
  Pause: ApplePause,
  Prev: AppleBackward,
  Next: AppleForward,
};

/**
 * The player, iOS 26.
 *
 * A floating glass capsule rather than a bar across the bottom of the window,
 * which is the same change iOS 26 made to Music: the transport became an object
 * lying over the content instead of a strip under it. The transport glyphs are
 * bare and filled (see `apple.css`), the secondary actions are round glass
 * chips, and the whole thing clears every window edge.
 *
 * All the behaviour is the shared player's — this is a different arrangement of
 * `features/player/controls`, not a second implementation of playback.
 */
export function ApplePlayerBar() {
  const current = usePlayerStore((s) => s.current);
  const [panel, setPanel] = useState<Panel>("none");
  const expanded = useNavStore((s) => s.nowPlaying);
  const setExpanded = useNavStore((s) => s.setNowPlaying);
  const compact = useCompact();

  const downloadedIds = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const startDownload = useDownloadsStore((s) => s.start);

  if (!current) return null;

  if (compact) {
    return (
      <TransportIcons.Provider value={APPLE_TRANSPORT}>
        {expanded && <AppleNowPlaying onClose={() => setExpanded(false)} />}
        <CompactBar track={current} onExpand={() => setExpanded(true)} />
      </TransportIcons.Provider>
    );
  }

  const art = artwork(current.artwork_url, "t120x120");
  const isDownloaded = downloadedIds.has(current.id);
  const downloading = active[current.id];
  const progress = downloading?.total
    ? (downloading.received / downloading.total) * 100
    : null;

  return (
    <TransportIcons.Provider value={APPLE_TRANSPORT}>
      {expanded && <AppleNowPlaying onClose={() => setExpanded(false)} />}

      <div className="relative">
        {panel !== "none" && (
          // A sheet, floating clear of the capsule it belongs to.
          <Glass
            chrome
            className="pop-in absolute bottom-full right-0 mb-3 flex h-[26rem] w-[21rem] flex-col overflow-hidden"
          >
            {panel === "queue" ? (
              <QueuePanel onClose={() => setPanel("none")} />
            ) : (
              <div className="relative min-h-0 flex-1 overflow-hidden">
                <Ambient />
                <div className="relative h-full overflow-y-auto">
                  <LyricsPanel track={current} compact />
                </div>
              </div>
            )}
          </Glass>
        )}

        <Glass chrome className="flex h-[4.75rem] items-center gap-4 px-4">
          {/* Track */}
          <div className="flex w-60 min-w-0 items-center gap-3">
            <button
              onClick={() => setExpanded(true)}
              aria-label={t.player.expand}
              className="group/art relative h-12 w-12 shrink-0"
            >
              {art ? (
                <img
                  src={art}
                  alt=""
                  className="h-12 w-12 rounded-[0.5rem] object-cover"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-[0.5rem] bg-[var(--ios-fill-3)]">
                  <Music className="h-5 w-5 text-[var(--ios-label-2)]" />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center rounded-[0.5rem] bg-black/45 opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/art:opacity-100">
                <ChevronUp className="h-5 w-5 text-white" />
              </span>
            </button>

            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[0.9375rem] font-medium">
                {current.title}
              </span>
              {current.artist && (
                <span className="truncate text-[0.8125rem] text-[var(--ios-label-2)]">
                  {current.artist}
                </span>
              )}
            </div>
          </div>

          {/* Transport. Centred glyphs, largest in the middle. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <ShuffleButton />
            <PrevButton />
            <PlayPauseButton />
            <NextButton />
            <RepeatButton />
          </div>

          <div className="min-w-0 flex-1">
            <SeekBar />
          </div>

          {/* Secondary actions, each on its own glass. */}
          <div className="flex shrink-0 items-center gap-1.5">
            <LikeButton track={current} className="lg-chip h-8 w-8" />
            <RepostButton track={current} className="lg-chip h-8 w-8" />
            <ShareButton
              url={current.permalink_url}
              className="lg-chip h-8 w-8"
              Icon={AppleShare}
            />
            <button
              onClick={() => void startDownload(current)}
              disabled={isDownloaded || !!downloading}
              aria-label={t.player.download}
              data-on={isDownloaded ? "true" : undefined}
              title={
                isDownloaded
                  ? t.player.downloaded
                  : progress != null
                    ? `${Math.round(progress)}%`
                    : t.player.download
              }
              className="lg-chip relative h-8 w-8"
            >
              <AppleDownload className="h-4 w-4" />
              {progress != null && (
                <span
                  className="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full bg-brand"
                  style={{ width: `${Math.max(4, progress)}%` }}
                />
              )}
            </button>
            <Chip
              on={panel === "lyrics"}
              label={t.player.lyrics}
              onClick={() => setPanel(panel === "lyrics" ? "none" : "lyrics")}
            >
              <Mic2 className="h-4 w-4" />
            </Chip>
            <Chip
              on={panel === "queue"}
              label={t.player.queue}
              onClick={() => setPanel(panel === "queue" ? "none" : "queue")}
            >
              <ListMusic className="h-4 w-4" />
            </Chip>
          </div>

          <VolumeControl />
        </Glass>
      </div>
    </TransportIcons.Provider>
  );
}

/**
 * The phone-width player: a launcher for the full-screen view, plus the two
 * controls worth reaching for without opening it. Everything else lives in
 * `NowPlaying`; cramming a seek bar into 360px would mean sub-30px targets.
 */
function CompactBar({ track, onExpand }: { track: Track; onExpand: () => void }) {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const art = artwork(track.artwork_url, "t120x120");
  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <Glass chrome className="relative flex items-center gap-2 overflow-hidden p-2">
      {/* Progress as a hairline along the bottom edge: a 2px target cannot be
          dragged, but it answers "how far in am I". */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--ios-fill-3)]">
        <span
          className="progress-fill block h-full bg-foreground"
          style={{ width: `${progress}%` }}
        />
      </span>

      <button
        onClick={onExpand}
        aria-label={t.player.expand}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-full px-1 text-left"
      >
        {art ? (
          <img
            src={art}
            alt=""
            className="h-11 w-11 shrink-0 rounded-[0.5rem] object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.5rem] bg-[var(--ios-fill-3)]">
            <Music className="h-5 w-5 text-[var(--ios-label-2)]" />
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[0.9375rem] font-medium">
            {track.title}
          </span>
          {track.artist && (
            <span className="truncate text-[0.8125rem] text-[var(--ios-label-2)]">
              {track.artist}
            </span>
          )}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <PlayPauseButton />
        <NextButton />
      </div>
    </Glass>
  );
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
      data-on={on ? "true" : undefined}
      className="lg-chip h-8 w-8"
    >
      {children}
    </button>
  );
}
