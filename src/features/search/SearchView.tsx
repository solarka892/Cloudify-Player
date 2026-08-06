import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Search, SlidersHorizontal, X } from "lucide-react";
import {
  scResolve,
  scSearchAlbums,
  scSearchAll,
  scSearchPlaylists,
  scSearchSuggest,
  scSearchTracks,
  scSearchUsers,
  type Playlist,
  type SearchFilters,
  type SearchMixed,
  type SearchPage,
  type Track,
  type User,
} from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { PlaylistList } from "@/components/PlaylistList";
import { UserList } from "@/components/UserList";
import { useNavStore } from "@/stores/useNavStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type Kind = "all" | "tracks" | "playlists" | "albums" | "users";

type Results =
  | { kind: "all"; items: SearchMixed[] }
  | { kind: "tracks"; items: Track[] }
  | { kind: "playlists"; items: Playlist[] }
  | { kind: "albums"; items: Playlist[] }
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
const RECENT_KEY = "cloudify.recentSearches";
const RECENT_MAX = 8;

const KINDS: { id: Kind; label: string }[] = [
  { id: "all", get label() {
    return t.search.kindAll;
  } },
  { id: "tracks", get label() {
    return t.search.kindTracks;
  } },
  { id: "playlists", get label() {
    return t.search.kindPlaylists;
  } },
  { id: "albums", get label() {
    return t.search.kindAlbums;
  } },
  { id: "users", get label() {
    return t.search.kindUsers;
  } },
];

/** A soundcloud.com link pasted into the box, rather than something to search. */
function isScLink(value: string): boolean {
  return /^https?:\/\/(m\.|on\.)?soundcloud\.com\//i.test(value.trim());
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function saveRecent(queries: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(queries));
  } catch {
    // A full quota costs the history, not the search.
  }
}

/** One search request, typed by kind. */
async function runSearch(
  kind: Kind,
  query: string,
  offset: number,
  filters: SearchFilters,
): Promise<{ results: Results; page: SearchPage<unknown> }> {
  if (kind === "all") {
    const page = await scSearchAll(query, offset, PAGE_SIZE);
    return { results: { kind, items: page.items }, page };
  }
  if (kind === "tracks") {
    const page = await scSearchTracks(query, offset, PAGE_SIZE, filters);
    return { results: { kind, items: page.items }, page };
  }
  if (kind === "playlists") {
    const page = await scSearchPlaylists(query, offset, PAGE_SIZE);
    return { results: { kind, items: page.items }, page };
  }
  if (kind === "albums") {
    const page = await scSearchAlbums(query, offset, PAGE_SIZE);
    return { results: { kind, items: page.items }, page };
  }
  const page = await scSearchUsers(query, offset, PAGE_SIZE);
  return { results: { kind, items: page.items }, page };
}

/** Append a page of results of the same kind. */
function concatResults(previous: Results, next: Results): Results {
  if (previous.kind === "all" && next.kind === "all")
    return { kind: "all", items: [...previous.items, ...next.items] };
  if (previous.kind === "tracks" && next.kind === "tracks")
    return { kind: "tracks", items: [...previous.items, ...next.items] };
  if (previous.kind === "playlists" && next.kind === "playlists")
    return { kind: "playlists", items: [...previous.items, ...next.items] };
  if (previous.kind === "albums" && next.kind === "albums")
    return { kind: "albums", items: [...previous.items, ...next.items] };
  if (previous.kind === "users" && next.kind === "users")
    return { kind: "users", items: [...previous.items, ...next.items] };
  return next;
}

export function SearchView() {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [state, setState] = useState<State>({ status: "idle" });
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [resolving, setResolving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const focusToken = useNavStore((s) => s.searchFocusToken);
  const pendingQuery = useNavStore((s) => s.pendingQuery);
  const clearPendingQuery = useNavStore((s) => s.clearPendingQuery);
  const openTrack = useNavStore((s) => s.openTrack);
  const openUser = useNavStore((s) => s.openUser);
  const openPlaylist = useNavStore((s) => s.openPlaylist);

  // The `/` hotkey bumps a token rather than reaching into this component.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  // A tag chip or a "more like this" elsewhere in the app lands here.
  useEffect(() => {
    if (pendingQuery == null) return;
    setQuery(pendingQuery);
    setKind("tracks");
    clearPendingQuery();
  }, [pendingQuery, clearPendingQuery]);

  const remember = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isScLink(trimmed)) return;
    setRecent((current) => {
      const next = [trimmed, ...current.filter((q) => q !== trimmed)].slice(
        0,
        RECENT_MAX,
      );
      saveRecent(next);
      return next;
    });
  }, []);

  /** Open a pasted link as whatever it turns out to be. */
  const openLink = useCallback(
    async (url: string) => {
      setResolving(true);
      try {
        const resolved = await scResolve(url);
        if (resolved.kind === "track") openTrack(resolved);
        else if (resolved.kind === "user") openUser(resolved);
        else openPlaylist(resolved);
        setQuery("");
      } catch (e) {
        toast(`${t.search.resolveFailed}: ${e}`, "error");
      } finally {
        setResolving(false);
      }
    },
    [openTrack, openUser, openPlaylist],
  );

  useEffect(() => {
    const q = query.trim();
    if (!q || isScLink(q)) {
      setState({ status: "idle" });
      return;
    }

    // `cancelled` also guards against an earlier, slower request overwriting
    // the results of a later one.
    let cancelled = false;
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      runSearch(kind, q, 0, filters)
        .then(({ results, page }) => {
          if (cancelled) return;
          setState({
            status: "ok",
            results,
            nextOffset: page.next_offset,
            total: page.total,
            loadingMore: false,
          });
          remember(q);
        })
        .catch(
          (e) => !cancelled && setState({ status: "error", message: String(e) }),
        );
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, kind, filters, remember]);

  // Autocomplete runs on its own, shorter clock than the search itself.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || isScLink(q)) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      scSearchSuggest(q, 8)
        .then((items) => !cancelled && setSuggestions(items))
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const loadMore = useCallback(() => {
    setState((current) => {
      if (current.status !== "ok" || current.nextOffset === null) return current;
      if (current.loadingMore) return current;

      const offset = current.nextOffset;
      void runSearch(kind, query.trim(), offset, filters)
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
  }, [kind, query, filters]);

  const linkPasted = isScLink(query);
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const dropdownOpen =
    showSuggestions &&
    !linkPasted &&
    (suggestions.length > 0 || (!query.trim() && recent.length > 0));

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.currentTarget.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          // A click on a suggestion has to land before the list closes.
          onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            setShowSuggestions(false);
            if (linkPasted) void openLink(query);
          }}
          placeholder={t.search.placeholder}
          spellCheck={false}
          autoComplete="off"
          className="search-field w-full rounded-[var(--radius)] border border-border py-2 pl-9 pr-9 text-sm text-card-foreground outline-none focus:ring-1 focus:ring-ring"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label={t.search.clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Suggestions and recents share the dropdown: whichever is relevant.
            `search-popover` makes it opaque, unlike the field above it — this
            lies over live results, and a translucent popover let both layers
            show through each other into an unreadable overlap. */}
        {dropdownOpen && (
          <div className="panel panel-raised search-popover absolute inset-x-0 top-full z-30 mt-1 flex flex-col overflow-hidden p-1">
            {!query.trim() && recent.length > 0 && (
              <>
                <div className="flex items-center px-2.5 pb-1 pt-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t.search.recentSearches}
                  </span>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setRecent([]);
                      saveRecent([]);
                    }}
                    className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {t.search.clearRecent}
                  </button>
                </div>
                {recent.map((item) => (
                  <button
                    key={item}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQuery(item);
                      setShowSuggestions(false);
                    }}
                    className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
                  >
                    {item}
                  </button>
                ))}
              </>
            )}

            {suggestions.map((item) => (
              <button
                key={item}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQuery(item);
                  setShowSuggestions(false);
                }}
                className="rounded-[var(--radius-control)] px-2.5 py-1.5 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {linkPasted && (
        <button
          onClick={() => void openLink(query)}
          disabled={resolving}
          className="flex items-center gap-2 self-start rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-50"
        >
          <Link2 className="h-4 w-4 text-muted-foreground" />
          {resolving ? t.search.resolving : t.search.pasteHint}
        </button>
      )}

      <div className="flex items-center gap-4 overflow-x-auto border-b border-border">
        {KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              kind === k.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {k.label}
          </button>
        ))}

        {/* Filters are a tracks-only concept on SoundCloud's side. */}
        {kind === "tracks" ? (
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 pb-2 text-xs transition-colors",
              activeFilters > 0 || showFilters
                ? "text-brand"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {t.search.filters}
            {activeFilters > 0 && <span>· {activeFilters}</span>}
          </button>
        ) : (
          state.status === "ok" &&
          state.total != null && (
            <span className="ml-auto shrink-0 pb-2 text-xs text-muted-foreground">
              {state.total.toLocaleString()} {t.search.found}
            </span>
          )
        )}
      </div>

      {kind === "tracks" && showFilters && (
        <Filters value={filters} onChange={setFilters} />
      )}

      {state.status === "idle" && !linkPasted && (
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

          {state.results.kind === "all" && state.results.items.length > 0 && (
            <MixedResults items={state.results.items} />
          )}
          {state.results.kind === "tracks" && state.results.items.length > 0 && (
            <TrackList tracks={state.results.items} />
          )}
          {(state.results.kind === "playlists" ||
            state.results.kind === "albums") &&
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
              className="self-center rounded-[var(--radius)] border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {state.loadingMore ? t.search.loading : t.search.loadMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * "Everything" results, grouped by what they are.
 *
 * SoundCloud interleaves the kinds by relevance; rendering them in that order
 * would mean a row of tracks, one user, two more tracks, and every list
 * component restarting between them. Grouping keeps rank inside each group.
 */
function MixedResults({ items }: { items: SearchMixed[] }) {
  const tracks: Track[] = [];
  const users: User[] = [];
  const playlists: Playlist[] = [];

  for (const item of items) {
    if (item.kind === "track") tracks.push(item);
    else if (item.kind === "user") users.push(item);
    else if (item.kind === "playlist") playlists.push(item);
  }

  return (
    <div className="flex flex-col gap-4">
      {tracks.length > 0 && (
        <Group label={t.search.kindTracks}>
          <TrackList tracks={tracks} />
        </Group>
      )}
      {playlists.length > 0 && (
        <Group label={t.search.kindPlaylists}>
          <PlaylistList playlists={playlists} />
        </Group>
      )}
      {users.length > 0 && (
        <Group label={t.search.kindUsers}>
          <UserList users={users} />
        </Group>
      )}
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="label text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      {children}
    </div>
  );
}

/** SoundCloud's own narrowing controls, for track searches. */
function Filters({
  value,
  onChange,
}: {
  value: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}) {
  return (
    <div className="panel flex flex-col gap-3 p-3">
      <label className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-muted-foreground">
          {t.search.filterGenre}
        </span>
        <input
          value={value.genre ?? ""}
          onChange={(e) =>
            onChange({ ...value, genre: e.currentTarget.value || undefined })
          }
          placeholder={t.search.anyValue}
          className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-2.5 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <ChipRow
        label={t.search.filterDuration}
        options={[
          { id: "short", label: t.search.durShort },
          { id: "medium", label: t.search.durMedium },
          { id: "long", label: t.search.durLong },
          { id: "epic", label: t.search.durEpic },
        ]}
        selected={value.duration}
        onSelect={(duration) => onChange({ ...value, duration })}
      />
      <ChipRow
        label={t.search.filterCreatedAt}
        options={[
          { id: "last_hour", label: t.search.timeHour },
          { id: "last_day", label: t.search.timeDay },
          { id: "last_week", label: t.search.timeWeek },
          { id: "last_month", label: t.search.timeMonth },
          { id: "last_year", label: t.search.timeYear },
        ]}
        selected={value.createdAt}
        onSelect={(createdAt) => onChange({ ...value, createdAt })}
      />
      <ChipRow
        label={t.search.filterLicense}
        options={[
          { id: "to_share", label: t.search.licShare },
          { id: "to_modify_commercially", label: t.search.licModify },
          { id: "to_use_commercially", label: t.search.licCommercial },
        ]}
        selected={value.license}
        onSelect={(license) => onChange({ ...value, license })}
      />

      <button
        onClick={() => onChange({})}
        className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t.search.clearFilters}
      </button>
    </div>
  );
}

/** One row of mutually exclusive chips. Clicking the active one clears it. */
function ChipRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { id: T; label: string }[];
  selected: T | undefined;
  onSelect: (value: T | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelect(selected === option.id ? undefined : option.id)}
          className={cn(
            "rounded-[var(--radius-round)] border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)]",
            selected === option.id
              ? "border-brand text-brand"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
