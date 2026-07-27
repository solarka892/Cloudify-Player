import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { scSearchTracks, type Track } from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { t } from "@/i18n";

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; tracks: Track[] }
  | { status: "error"; message: string };

/** Wait this long after the last keystroke before hitting the API. */
const DEBOUNCE_MS = 350;

export function SearchView() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState({ status: "idle" });
      return;
    }

    // `cancelled` also guards against an earlier, slower request overwriting
    // the results of a later one.
    let cancelled = false;
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      scSearchTracks(q)
        .then((tracks) => !cancelled && setState({ status: "ok", tracks }))
        .catch(
          (e) => !cancelled && setState({ status: "error", message: String(e) }),
        );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t.search.placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-9 text-sm text-card-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label={t.search.clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <p className="text-sm text-muted-foreground">{t.search.hint}</p>
      )}

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">{t.search.loading}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-400">
          {t.search.error}: {state.message}
        </p>
      )}

      {state.status === "ok" && state.tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.search.empty}</p>
      )}

      {state.status === "ok" && state.tracks.length > 0 && (
        <TrackList tracks={state.tracks} />
      )}
    </section>
  );
}
