import { Pause, Play } from "lucide-react";
import type { ActiveDownload } from "@/stores/useDownloadsStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * A running download, in the place its button was.
 *
 * The button used to stay put and pulse, with the percentage hidden in a
 * tooltip — so a download in progress looked like a button being coy rather
 * than like work happening, and there was no way to tell a slow one from a
 * stuck one without hovering and waiting.
 *
 * The ring is the progress and the glyph inside it is what a press does:
 * pause while it runs, resume while it holds. `conic-gradient` rather than an
 * SVG arc — one element, one repaint, and it takes the same accent token
 * everything else in the row does.
 *
 * HLS tracks report against an estimate rather than a byte total (segment
 * sizes are not known ahead of time), so the number can jump. It is still the
 * honest one, and it is what `Progress` sends.
 */
export function DownloadRing({
  download,
  onToggle,
  className,
}: {
  download: ActiveDownload;
  onToggle: () => void;
  className?: string;
}) {
  const percent = download.total
    ? Math.min(100, Math.round((download.received / download.total) * 100))
    : null;
  const label = download.paused ? t.downloads.resume : t.downloads.pause;

  return (
    <button
      onClick={(e) => {
        // The whole row is a play button; this must not reach it.
        e.stopPropagation();
        onToggle();
      }}
      aria-label={label}
      title={percent === null ? label : `${label} · ${percent}%`}
      // The ring itself, so a skin can restyle the sweep without knowing how
      // it is drawn.
      data-download-ring=""
      data-paused={download.paused || undefined}
      data-indeterminate={percent === null || undefined}
      className={cn(
        "press relative flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius-round)] text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground",
        className,
      )}
      style={
        {
          // A ring with a hole: the sweep to the current angle, then the track
          // colour, masked to a 2px band.
          "--sweep": `${percent ?? 12}%`,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="download-ring" />
      {download.paused ? (
        <Play className="press-glyph relative h-3 w-3 translate-x-[0.5px]" />
      ) : (
        <Pause className="press-glyph relative h-3 w-3" />
      )}
    </button>
  );
}
