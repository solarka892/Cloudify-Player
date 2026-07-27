import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { TrackList } from "@/components/TrackList";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export function LibraryView({ userId }: { userId: number }) {
  const tracks = useLibraryStore((s) => s.tracks);
  const status = useLibraryStore((s) => s.status);
  const error = useLibraryStore((s) => s.error);
  const loadLikes = useLibraryStore((s) => s.loadLikes);
  const refreshLikes = useLibraryStore((s) => s.refreshLikes);

  // Cached in the store: this is a no-op after the first load, so switching
  // tabs doesn't re-fetch the whole (paginated, slow) likes list.
  useEffect(() => {
    void loadLikes(userId);
  }, [userId, loadLikes]);

  const loading = status === "loading";

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">
          {t.library.likes}
          {status === "ok" && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {tracks.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => void refreshLikes(userId)}
          disabled={loading}
          aria-label={t.library.refresh}
          title={t.library.refresh}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* On refresh the cached list stays on screen; the spinner is the signal. */}
      {loading && tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {status === "error" && (
        <p className="text-sm text-red-400">
          {t.library.error}: {error}
        </p>
      )}

      {status === "ok" && tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.empty}</p>
      )}

      {tracks.length > 0 && <TrackList tracks={tracks} />}
    </section>
  );
}
