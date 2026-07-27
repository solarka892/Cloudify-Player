import { DownloadCloud, Square } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Download every track in a list.
 *
 * Sequential and paced on purpose: SoundCloud signs one stream URL per request,
 * and firing hundreds back to back gets the `client_id` throttled — which also
 * kills playback, not just the downloads. The store spaces them out, backs off
 * when failures stack up, and gives up after five refusals in a row.
 *
 * Already-downloaded tracks are skipped, so re-running after a failure resumes.
 */
export function DownloadAllButton({
  tracks,
  label,
}: {
  tracks: Track[];
  label?: string;
}) {
  const ids = useDownloadsStore((s) => s.ids);
  const active = useDownloadsStore((s) => s.active);
  const running = useDownloadsStore((s) => s.bulkRunning);
  const startBulk = useDownloadsStore((s) => s.startBulk);
  const stopBulk = useDownloadsStore((s) => s.stopBulk);

  const pending = tracks.filter((track) => !ids.has(track.id));
  const inFlight = Object.keys(active).length;

  async function run() {
    if (pending.length === 0) return;
    const total = pending.length;
    const { done, failed } = await startBulk(pending);

    if (failed === 0) {
      toast(`${t.downloads.allDone}: ${done}`, "success");
    } else if (done + failed < total) {
      // Stopped early — either by the user or by the backoff giving up.
      toast(
        `${t.downloads.stopped}: ${done}, ${t.downloads.failedCount}: ${failed}`,
        "error",
      );
    } else {
      toast(
        `${t.downloads.allDone}: ${done}, ${t.downloads.failedCount}: ${failed}`,
        "error",
      );
    }
  }

  if (running) {
    return (
      <button
        onClick={stopBulk}
        title={t.downloads.stop}
        className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-destructive px-2.5 py-1.5 text-xs text-destructive"
      >
        <Square className="h-3.5 w-3.5 fill-current" />
        {t.downloads.stop}
        {inFlight > 0 && <span className="tabular-nums opacity-70">·</span>}
      </button>
    );
  }

  return (
    <button
      onClick={() => void run()}
      disabled={pending.length === 0}
      title={t.downloads.all}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground disabled:opacity-40",
      )}
    >
      <DownloadCloud className="h-4 w-4" />
      {label ?? `${t.downloads.all}${pending.length > 0 ? ` (${pending.length})` : ""}`}
    </button>
  );
}
