import { useCallback, useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import {
  scSearchPlaylists,
  scSearchTracks,
  scSearchUsers,
  type Playlist,
  type SearchPage,
  type Track,
  type User,
} from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { PlaylistList } from "@/components/PlaylistList";
import { UserList } from "@/components/UserList";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type Kind = "tracks" | "playlists" | "users";

type Results =
  | { kind: "tracks"; items: Track[] }
  | { kind: "playlists"; items: Playlist[] }
  | { kind: "users"; items: User[] };

type State =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ok";
      results: Results;
      nextOffset: number | null;
      total: number | null;
      loadingMore: boolean;
    }
  | { status: "error"; message: string };

/** Wait this long after the last keystroke before hitting the API. */
const DEBOUNCE_MS = 350;
const PAGE_SIZE = 50;

const KINDS: { id: Kind; label: string }[] = [
  { id: "tracks", label: t.search.kindTracks },
  { id: "playlists", label: t.search.kindPlaylists },
  { id: "users", label: t.search.kindUsers },
];

/** One search request, typed by kind. */
async function runSearch(
  kind: Kind,
  query: string,
  offset: number,
): Promise<{ results: Results; page: SearchPage<unknown> }> {
  if (kind === "tracks") {
    const page = await scSearchTracks(query, offset, PAGE_SIZE);
    return { results: { kind, items: page.items }, page };
  }
  if (kind === "playlists") {
    const page = await scSearchPlaylists(query, offset, PAGE_SIZE);
    return { results: { kind, items: page.items }, page };
  }
  const page = await scSearchUsers(query, offset, PAGE_SIZE);
  return { results: { kind, items: page.items }, page };
}

/** Append a page of results of the same kind. */
function concatResults(previous: Results, next: Results): Results {
  if (previous.kind === "tracks" && next.kind === "tracks")
    return { kind: "tracks", items: [...previous.items, ...next.items] };
  if (previous.kind === "playlists" && next.kind === "playlists")
    return { kind: "playlists", items: [...previous.items, ...next.items] };
  if (previous.kind === "users" && next.kind === "users")
    return { kind: "users", items: [...previous.items, ...next.items] };
  return next;
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("tracks");
  const [state, setState] = useState<State>({ status: "idle" });

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
      runSearch(kind, q, 0)
        .then(({ results, page }) => {
          if (cancelled) return;
          setState({
            status: "ok",
            results,
            nextOffset: page.next_offset,
            total: page.total,
            loadingMore: false,
          });
        })
        .catch(
          (e) => !cancelled && setState({ status: "error", message: String(e) }),
        );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, kind]);

  const loadMore = useCallback(() => {
    setState((current) => {
      if (current.status !== "ok" || current.nextOffset === null) return current;
      if (current.loadingMore) return current;

      const offset = current.nextOffset;
      void runSearch(kind, query.trim(), offset)
        .then(({ results, page }) =>
          setState((s) =>
            // Ignore the page if the query or kind moved on meanwhile.
            s.status === "ok" && s.nextOffset === offset
              ? {
                  ...s,
                  results: concatResults(s.results, results),
                  nextOffset: page.next_offset,
                  loadingMore: false,
                }
              : s,
          ),
        )
        .catch(() =>
          setState((s) =>
            s.status === "ok" ? { ...s, loadingMore: false } : s,
          ),
        );

      return { ...current, loadingMore: true };
    });
  }, [kind, query]);

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

      <div className="flex items-center gap-4 border-b border-border">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              kind === k.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}
        {state.status === "ok" && state.total != null && (
          <span className="ml-auto pb-2 text-xs text-muted-foreground">
            {state.total.toLocaleString()} {t.search.found}
          </span>
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

      {state.status === "ok" && (
        <>
          {state.results.items.length === 0 && (
            <p className="text-sm text-muted-foreground">{t.search.empty}</p>
          )}

          {state.results.kind === "tracks" && state.results.items.length > 0 && (
            <TrackList tracks={state.results.items} />
          )}
          {state.results.kind === "playlists" &&
            state.results.items.length > 0 && (
              <PlaylistList playlists={state.results.items} />
            )}
          {state.results.kind === "users" && state.results.items.length > 0 && (
            <UserList users={state.results.items} />
          )}

          {state.nextOffset !== null && (
            <button
              onClick={loadMore}
              disabled={state.loadingMore}
              className="self-center rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {state.loadingMore ? t.search.loading : t.search.loadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}
