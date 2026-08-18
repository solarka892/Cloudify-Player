import { useState } from "react";
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2, VolumeX } from "lucide-react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { ArtFallback } from "@/components/ArtFallback";
import { LikeButton } from "@/components/LikeButton";
import { OfflineBadge } from "@/components/OfflineBadge";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useNavStore } from "@/stores/useNavStore";
import { useArtwork } from "@/hooks/useArtwork";
import { Scrub } from "./Scrub";

/**
 * The legend: the block in the corner of the sheet that says what the sheet
 * means, and carries the transport in the same frame.
 *
 * This is the app's signature, in the sense the manifesto uses the word — the one
 * element you would recognise a screenshot by. No other player has a legend,
 * because no other player has anything to declare: this one tints its rows from a
 * five-band ramp, and a map that tints without declaring is a map that lies.
 *
 * It is also where the player went. Not a bar across the bottom of the window —
 * that shape belongs to Spotify, to the SoundCloud website, and to five earlier
 * versions of this app — but a block pinned to the bottom-left of the sheet,
 * which is where a legend sits on a printed one.
 *
 * Everything in it is a control that was already here. The transport, the seek
 * bar, the volume and the queue come from `usePlayerStore` exactly as before;
 * what changed is the frame around them and the fact that the frame explains the
 * page it sits on.
 */
export function Legend() {
  const current = usePlayerStore((s) => s.current);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isLoading = usePlayerStore((s) => s.isLoading);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const next = usePlayerStore((s) => s.next);
  const prev = usePlayerStore((s) => s.prev);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const cycleRepeat = usePlayerStore((s) => s.cycleRepeat);
  const volume = usePlayerStore((s) => s.volume);
  const muted = usePlayerStore((s) => s.muted);
  const setVolume = usePlayerStore((s) => s.setVolume);
  const toggleMute = usePlayerStore((s) => s.toggleMute);
  const setNowPlaying = useNavStore((s) => s.setNowPlaying);
  const [showVolume, setShowVolume] = useState(false);
  const art = useArtwork(current, "t120x120");

  return (
    <aside
      aria-label={t.player.legend}
      className="panel flex w-[19rem] shrink-0 flex-col gap-2.5 p-3"
    >
      <span className="label">{t.player.legend}</span>

      {/* What is playing. Nothing at all when nothing is: an empty frame with a
          placeholder cover would be a promise the block cannot keep. */}
      {current ? (
        <>
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2.5">
            <button
              onClick={() => setNowPlaying(true)}
              aria-label={t.player.expand}
              className="art-frame h-14 w-14"
            >
              {art ? (
                <img src={art} alt="" />
              ) : (
                <ArtFallback seed={current.id} />
              )}
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="truncate">{current.title}</span>
                <OfflineBadge />
              </span>
              <span className="label truncate">{current.artist}</span>
            </div>
          </div>

          <Scrub />

          <div className="flex items-center gap-1">
            <Control onClick={prev} label={t.player.prev}>
              <SkipBack className="h-4 w-4" />
            </Control>
            {/* The one filled thing in the app. An accent used twice is a
                colour; used once it is a landmark. */}
            <button
              onClick={togglePlay}
              aria-label={isPlaying ? t.player.pause : t.player.play}
              className={cn(
                "brand-gradient flex h-8 w-8 items-center justify-center rounded-[var(--radius)] transition-opacity duration-[var(--t-state)] hover:opacity-90",
                // Waiting is opacity, because nothing in this language spins.
                isLoading && "animate-[pulse-ink_1s_ease-in-out_infinite]",
              )}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <Control onClick={next} label={t.player.next}>
              <SkipForward className="h-4 w-4" />
            </Control>

            <span className="ml-auto flex items-center gap-1">
              <Control
                onClick={toggleShuffle}
                label={t.player.shuffle}
                on={shuffle}
              >
                <Shuffle className="h-4 w-4" />
              </Control>
              <Control
                onClick={cycleRepeat}
                label={t.player.repeat}
                on={repeat !== "off"}
              >
                {repeat === "one" ? (
                  <Repeat1 className="h-4 w-4" />
                ) : (
                  <Repeat className="h-4 w-4" />
                )}
              </Control>
              <LikeButton track={current} />
            </span>
          </div>

          {/* Volume opens rather than sitting out: a second horizontal bar under
              the seek bar reads as a second progress bar, which is the mistake
              the old player made twice. */}
          <div className="flex items-center gap-2">
            <Control
              onClick={() => setShowVolume((v) => !v)}
              label={t.player.volume}
              on={showVolume}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Control>
            {showVolume && (
              <>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.currentTarget.value))}
                  aria-label={t.player.volume}
                  className="h-1 min-w-0 flex-1 accent-[var(--water)]"
                />
                <button
                  onClick={toggleMute}
                  className="readout text-ink-soft transition-colors duration-[var(--t-state)] hover:text-ink"
                >
                  {Math.round((muted ? 0 : volume) * 100)}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="label">{t.player.nothing}</p>
      )}

      <hr className="rule" />

      {/* The declaration. This is the part that makes the block a legend rather
          than a player with a label on it. */}
      <Ramp />
    </aside>
  );
}

/**
 * The ramp, and what it currently counts.
 *
 * Five bands, low ground to high, with the quantity named underneath. Rule 2 of
 * the language is that no symbol appears which the legend cannot name — this is
 * the legend keeping that promise, and it is why the bands on every row are
 * allowed to be coloured at all.
 */
function Ramp() {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{t.player.rampMeans}</span>
      <div className="grid h-2.5 grid-cols-5 gap-0.5">
        {[1, 2, 3, 4, 5].map((band) => (
          <span key={band} className={`band-${band} w-auto`} />
        ))}
      </div>
      <div className="readout flex justify-between text-ink-soft">
        <span>{t.player.rampLow}</span>
        <span>{t.player.rampHigh}</span>
      </div>
    </div>
  );
}

/**
 * A control in the legend: a contour, filled on hover, inked when it is on.
 *
 * No circles. Six filled discs in a row was what the old transport looked like,
 * and on a sheet a disc is a symbol with a meaning — a spot height — rather than
 * a decoration to put a glyph inside.
 */
function Control({
  onClick,
  label,
  on,
  children,
}: {
  onClick: () => void;
  label: string;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-[var(--radius)] transition-colors duration-[var(--t-state)] hover:bg-accent",
        on ? "text-water" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
