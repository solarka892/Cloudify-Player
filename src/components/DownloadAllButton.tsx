import { useState } from "react";
import { DownloadCloud } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Download every track in a list.
 *
 * Sequential on purpose: SoundCloud signs one stream URL per request and
 * parallel downloads of a whole likes list is the fastest way to get
 * rate-limited. Already-downloaded tracks are skipped, so re-running it after
 * a failure resumes rather than starting over.
 */
export function DownloadAllButton({
  tracks,
  label,
}: {
  tracks: Track[];
  label?: string;
}) {
  const ids = useDownloadsStore((s) => s.ids);
  const start = useDownloadsStore((s) => s.start);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const pending = tracks.filter((track) => !ids.has(track.id));

  async function run() {
    if (pending.length === 0) return;
    setProgress({ done: 0, total: pending.length });
    let failed = 0;

    for (const [index, track] of pending.entries()) {
      try {
        await start(track);
      } catch {
        failed += 1; // one bad track must not abort the batch
      }
      setProgress({ done: index + 1, total: pending.length });
    }

    setProgress(null);
    toast(
      failed === 0
        ? `${t.downloads.allDone}: ${pending.length}`
        : `${t.downloads.allDone}: ${pending.length - failed}, ${t.downloads.failedCount}: ${failed}`,
      failed === 0 ? "success" : "error",
    );
  }

  const running = progress !== null;

  return (
    <button
      onClick={() => void run()}
      disabled={running || pending.length === 0}
      title={t.downloads.all}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1.5 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-40",
        running ? "text-brand" : "text-muted-foreground",
      )}
    >
      <DownloadCloud className={cn("h-4 w-4", running && "animate-pulse")} />
      {running
        ? `${progress.done}/${progress.total}`
        : (label ?? `${t.downloads.all}${pending.length > 0 ? ` (${pending.length})` : ""}`)}
    </button>
  );
}
