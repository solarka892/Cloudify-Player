import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { ViewHead } from "@/components/ViewHead";
import { clock } from "@/hooks/useHotkeys";
import { cn } from "@/lib/utils";
import { dupesHide, dupesUndo, type StoredTrack } from "@/lib/store";
import { useNavStore } from "@/stores/useNavStore";
import { useNitStore } from "@/stores/useNitStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { toast } from "@/stores/useToastStore";
import type { Track } from "@/lib/tauri";

/**
 * The screen the local features live on.
 *
 * Five tabs rather than five places in the navigation. They are one subject —
 * things this app knows about your library that SoundCloud does not — and a
 * seven-item nav rail with five more entries in it would bury the music under
 * the bookkeeping.
 */

type Tab = "marks" | "later" | "diary" | "dupes" | "gone";

/**
 * The tabs, each with a line saying what it is for.
 *
 * The head used to carry one sentence about the whole feature set — "twelve
 * things the app does that are nobody else's" — which is a thing to say once,
 * on the way in, and never again. Standing under the title of whichever tab you
 * were on, it answered a question nobody was asking and left the actual one
 * ("what *is* a mark?") unanswered. Two of these sentences already existed and
 * were going unused; three are new.
 *
 * Functions, not strings: `t` is rebound when the language changes, so a table
 * of values built at module scope would hold the first language for ever.
 */
const TABS: { id: Tab; label: () => string; about: () => string }[] = [
  { id: "marks", label: () => t.marks.title, about: () => t.marks.hint },
  { id: "later", label: () => t.later.title, about: () => t.later.hint },
  { id: "diary", label: () => t.diary.title, about: () => t.diary.hint },
  { id: "dupes", label: () => t.dupes.title, about: () => t.dupes.hint },
  { id: "gone", label: () => t.gone.badge, about: () => t.gone.about },
];

export function NitView() {
  const [tab, setTab] = useState<Tab>("marks");
  const store = useNitStore();

  // Somewhere else in the app said "look at this" — see `openNit`. Consumed on
  // arrival so that coming back here later lands on the tab you left, not on
  // the one something sent you to once.
  const pendingTab = useNavStore((s) => s.pendingNitTab);
  const clearPendingTab = useNavStore((s) => s.clearPendingNitTab);
  useEffect(() => {
    if (!pendingTab) return;
    if (TABS.some((t) => t.id === pendingTab)) setTab(pendingTab as Tab);
    clearPendingTab();
  }, [pendingTab, clearPendingTab]);

  useEffect(() => {
    if (tab === "marks") void store.loadAll();
    if (tab === "later") void store.loadLater();
    if (tab === "diary") void store.loadDiary();
    if (tab === "dupes") void store.loadDupes();
    if (tab === "gone") void store.loadGone();
    // Deliberately only on a tab change: each tab is a snapshot of a table that
    // nothing else in the app writes while it is open, and re-running this on
    // every store change would refetch on its own results.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const current = TABS.find((entry) => entry.id === tab);

  return (
    <div className="stack-lg">
      <ViewHead
        title={current?.label() ?? t.marks.title}
        sub={current?.about()}
      />

      <div className="flex flex-wrap gap-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-[var(--radius-control)] px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
              tab === id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="label">{label()}</span>
          </button>
        ))}
      </div>

      {tab === "marks" && <MarksTab />}
      {tab === "later" && <LaterTab />}
      {tab === "diary" && <DiaryTab />}
      {tab === "dupes" && <DupesTab />}
      {tab === "gone" && <GoneTab />}
    </div>
  );
}

/** Every mark, newest first, with its note editable in place. */
function MarksTab() {
  const all = useNitStore((s) => s.all);
  const editMark = useNitStore((s) => s.editMark);
  const removeMark = useNitStore((s) => s.removeMark);
  const [query, setQuery] = useState("");

  const shown = all.filter(([mark, track]) => {
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return (
      (mark.note ?? "").toLowerCase().includes(needle) ||
      (track?.title ?? "").toLowerCase().includes(needle)
    );
  });

  if (all.length === 0) {
    return <Empty>{t.marks.empty}</Empty>;
  }

  return (
    <div className="stack">
      <input
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={t.marks.search}
        className="search-field w-full rounded-[var(--radius-control)] border border-border px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
      {shown.length === 0 && <Empty>{t.marks.noResults}</Empty>}
      {/* Time, note, track. The note is the primary text and the track is the
          caption, which is the opposite of a track list and the right way round
          here: you are looking for the thing you wrote, not for the song. */}
      <div>
        {shown.map(([mark, track]) => (
          <div
            key={mark.id}
            className="group/mark grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-2.5"
          >
            <button
              onClick={() => track && playAt(track, mark.position_ms)}
              disabled={!track}
              className="readout text-left text-sm text-brand disabled:opacity-50"
              title={t.marks.jump}
            >
              {clock(mark.position_ms)}
            </button>
            {/* `data-inline` says "this is a line of the row, not a field".
                Apple mode fills every input, and filled here it made a list of
                marks read as a column of search boxes. The one-word placeholder
                is part of the same thought: the long evocative one is fine in a
                dialog where there is a single note being written, and repeated
                down every empty row it reads as three marks that all say the
                same thing. */}
            <input
              data-inline
              defaultValue={mark.note ?? ""}
              placeholder={t.marks.edit}
              onBlur={(e) => {
                const note = e.currentTarget.value;
                if (note !== (mark.note ?? "")) void editMark(mark.id, note);
              }}
              className="min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex shrink-0 items-center gap-3">
              <span className="max-w-[16rem] truncate text-xs text-muted-foreground">
                {track ? `${track.title}${track.artist ? ` — ${track.artist}` : ""}` : mark.track_urn}
              </span>
              {/* An icon, and only under the pointer. It was the word "Delete"
                  at the end of every row: the most destructive thing on the row
                  wearing the heaviest type on it. */}
              <button
                onClick={() => void removeMark(mark.id)}
                aria-label={t.marks.delete}
                title={t.marks.delete}
                className="shrink-0 rounded-[var(--radius-control)] p-1 text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-fast)] hover:text-destructive focus-visible:opacity-100 group-hover/mark:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LaterTab() {
  const later = useNitStore((s) => s.later);
  const dropLater = useNitStore((s) => s.dropLater);

  if (later.length === 0) return <Empty>{t.later.empty}</Empty>;

  const now = Date.now() / 1000;
  const stale = later.filter((i) => i.expires_at !== null && i.expires_at < now);

  return (
    <div className="stack">
      <p className="text-sm text-muted-foreground">{t.later.hint}</p>
      {stale.length > 0 && (
        <p className="panel px-4 py-2 text-sm">
          {t.later.expiring.replace("{n}", String(stale.length))} —{" "}
          <span className="text-muted-foreground">{t.later.expiringHint}</span>
        </p>
      )}
      {/* Cards rather than rows: each one carries a life bar, and a bar per row
          in a list reads as a set of progress indicators rather than as things
          running out of time. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-3">
        {later.map((item) => {
          // How much of the soft window is gone. The bar empties rather than
          // fills: what it measures is time left, not progress made.
          const days = item.expires_at
            ? Math.max(0, Math.round((item.expires_at - now) / 86_400))
            : null;
          const left = days === null ? 1 : Math.min(1, days / 30);
          return (
            <div
              key={item.track_urn}
              className="flex flex-col gap-2.5 rounded-[var(--radius)] border border-border p-3"
            >
              <button
                onClick={() =>
                  void playAt(
                    {
                      ...item,
                      id: item.track_id,
                      duration: 0,
                      artwork_url: null,
                      permalink_url: null,
                    },
                    0,
                  )
                }
                className="min-w-0 text-left"
              >
                <div className="truncate text-sm">{item.title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {item.artist ?? ""}
                </div>
              </button>
              <div className="h-[2px] bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)]">
                <div
                  className="h-full bg-brand"
                  style={{ width: `${Math.round(left * 100)}%` }}
                />
              </div>
              <div className="label flex items-center justify-between gap-2 text-muted-foreground">
                <span className="truncate">
                  {item.source === "trap"
                    ? t.later.sourceTrap
                    : item.source === "search"
                      ? t.later.sourceSearch
                      : t.later.sourceManual}
                </span>
                <button
                  onClick={() => void dropLater(item.track_id)}
                  className="shrink-0 hover:text-destructive"
                >
                  {days !== null ? `${days} d` : t.later.remove}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What played, grouped by day and then by part of the day.
 *
 * The grouping is the feature. "What was I listening to on the night of the
 * 14th" is how anyone actually looks for a track they half remember, and a flat
 * reverse-chronological list cannot answer it.
 */
function DiaryTab() {
  const diary = useNitStore((s) => s.diary);
  if (diary.length === 0) return <Empty>{t.diary.empty}</Empty>;

  // Day, then part of the day. The grouping *is* the feature: "what was I
  // listening to on the night of the 14th" is how anyone looks for a track they
  // half remember, and a flat reverse-chronological list cannot answer it.
  const groups = new Map<string, { day: string; month: string; part: string; entries: typeof diary }>();
  for (const entry of diary) {
    const date = new Date(entry.started_at * 1000);
    const hour = date.getHours();
    const part =
      hour < 5 ? t.diary.night : hour < 12 ? t.diary.morning : hour < 18 ? t.diary.afternoon : t.diary.evening;
    const key = `${date.toDateString()} ${part}`;
    const group = groups.get(key) ?? {
      day: String(date.getDate()),
      month: date.toLocaleDateString(undefined, { month: "short" }),
      part,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-muted-foreground">{t.diary.hint}</p>
      {[...groups.values()].map((group) => (
        <div
          key={`${group.day}-${group.part}`}
          className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 border-b border-border py-4"
        >
          {/* The date, large, in the left column: it is the thing you scan for. */}
          <div className="label leading-relaxed text-muted-foreground">
            <b className="block text-[1.375rem] font-semibold tracking-tight text-foreground">
              {group.day}
            </b>
            {group.month} · {group.part}
          </div>
          <div className="min-w-0">
            {group.entries.map((entry) => (
              <div key={entry.id} className="flex items-baseline gap-2.5 py-1 text-sm">
                <span className="readout w-10 shrink-0 text-xs text-muted-foreground">
                  {new Date(entry.started_at * 1000).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="min-w-0 truncate">{entry.title}</span>
                {entry.artist && (
                  <span className="min-w-0 truncate text-muted-foreground">
                    {entry.artist}
                  </span>
                )}
                <span className="readout ml-auto shrink-0 text-xs text-muted-foreground">
                  {entry.outcome === "skipped"
                    ? t.diary.skipped.replace("{time}", clock(entry.position_ms))
                    : entry.outcome === "marked"
                      ? t.diary.marked
                      : entry.outcome === "liked"
                        ? t.diary.liked
                        : t.diary.played}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DupesTab() {
  const dupes = useNitStore((s) => s.dupes);
  const busy = useNitStore((s) => s.busy);
  const load = useNitStore((s) => s.loadDupes);

  if (busy) return <Empty>{t.library.loading}</Empty>;
  if (dupes.length === 0) return <Empty>{t.dupes.none}</Empty>;

  const total = dupes.reduce((sum, group) => sum + group.others.length, 0);

  return (
    <div className="stack">
      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm">{t.dupes.found.replace("{n}", String(total))}</p>
          <p className="text-xs text-muted-foreground">{t.dupes.hiddenHint}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await dupesHide(dupes.flatMap((g) => g.others.map((o) => o.id)));
              toast(t.dupes.hidden.replace("{n}", String(total)), "success");
              void load();
            }}
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t.dupes.keepOldest}
          </button>
          <button
            onClick={async () => {
              const restored = await dupesUndo();
              toast(t.dupes.undone, "success");
              if (restored) void load();
            }}
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {t.dupes.undo}
          </button>
        </div>
      </div>

      <div className="stack">
        {dupes.map((group) => (
          <div key={group.keep.urn} className="list-card divide-y divide-border">
            <Row track={group.keep} keep />
            {group.others.map((other) => (
              <Row key={other.urn} track={other} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ track, keep = false }: { track: StoredTrack; keep?: boolean }) {
  return (
    <div className="bg-row flex items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">
        {track.title}
        {track.artist && <span className="text-muted-foreground"> · {track.artist}</span>}
      </span>
      <span className="readout shrink-0 text-xs text-muted-foreground">
        {clock(track.duration)}
      </span>
      {keep && (
        <span className="label shrink-0 text-[0.625rem] text-brand">
          {t.later.keep}
        </span>
      )}
    </div>
  );
}

/** Tracks SoundCloud no longer has, and the last thing the app saw of them. */
function GoneTab() {
  const gone = useNitStore((s) => s.gone);
  if (gone.length === 0) return <Empty>{t.dupes.none}</Empty>;
  return (
    <div className="stack">
      <p className="text-sm text-muted-foreground">{t.gone.hint}</p>
      <div className="list-card divide-y divide-border">
        {gone.map((track) => (
          <div key={track.urn} className="bg-row flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm line-through decoration-1">
              {track.title}
              {track.artist && (
                <span className="text-muted-foreground"> · {track.artist}</span>
              )}
            </span>
            <span className="readout shrink-0 text-xs text-muted-foreground">
              {track.gone_at
                ? new Date(track.gone_at * 1000).toLocaleDateString()
                : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Nothing here yet.
 *
 * A line of text, and no panel around it. A panel is a container for things,
 * and drawing an empty one to hold the news that there is nothing to hold makes
 * the emptiness look like a fault — a card that failed to load rather than a
 * tab you have not used yet. The rest of the app already says it this way (see
 * `ProfileView`); this tab was the one holdout.
 *
 * Left-aligned for the same reason: centred in a wide empty page, one sentence
 * has nothing to be centred against and reads as adrift.
 */
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

/** Play a stored track and land on a position in it. */
function playAt(track: Track | StoredTrack, positionMs: number): void {
  const plain: Track = {
    id: track.id,
    title: track.title,
    duration: track.duration,
    artwork_url: track.artwork_url,
    permalink_url: track.permalink_url,
    artist: track.artist,
  };
  void usePlayerStore
    .getState()
    .playTrack(plain)
    .then(() => {
      if (positionMs > 0) usePlayerStore.getState().seek(positionMs / 1000);
    });
}
