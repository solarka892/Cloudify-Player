import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { t } from "@/i18n";
import { clock } from "@/hooks/useHotkeys";
import { diaryList, type DiaryEntry } from "@/lib/store";
import { ViewHead } from "@/components/ViewHead";
import { cn } from "@/lib/utils";

/**
 * What played, when.
 *
 * A section of its own now. It was a tab inside Nit, and it outlived that
 * feature for a reason nothing else there had: this is the only record of how
 * the library is *actually* used — which tracks get played through and which
 * get skipped nine seconds in. A screen is the small half of that; the useful
 * half is that the record exists at all.
 *
 * Local, and it never leaves the machine. How long it keeps a row is a setting,
 * and it lives in Settings → Storage with the rest of what is on the disk —
 * along with the button that erases the record. Five retention buttons and a
 * label took this screen's whole header strip, which is a lot of furniture for
 * something set once.
 */

export function DiaryView() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  const load = useCallback(() => {
    void diaryList().then(setEntries).catch(() => setEntries([]));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="stack">
      <ViewHead title={t.diary.title} sub={t.diary.hint} />

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.diary.empty}</p>
      ) : (
        <Entries entries={entries} />
      )}
    </div>
  );
}

function Entries({ entries }: { entries: DiaryEntry[] }) {
  /**
   * Which groups are open. Empty to begin with, so everything starts folded.
   *
   * A day is twenty or forty rows and the diary keeps months of them: unfolded
   * by default it opens as a wall with no shape, and the dates — the thing
   * anyone is actually scanning for — are lost among the rows they head. Folded,
   * the screen is a list of days, which is what the grouping was for.
   */
  const [open, setOpen] = useState<Set<string>>(new Set());

  // Day, then part of the day. The grouping *is* the feature: "what was I
  // listening to on the night of the 14th" is how anyone looks for a track they
  // half remember, and a flat reverse-chronological list cannot answer it.
  const groups = new Map<
    string,
    { day: string; month: string; part: string; entries: DiaryEntry[] }
  >();
  for (const entry of entries) {
    const date = new Date(entry.started_at * 1000);
    const hour = date.getHours();
    const part =
      hour < 5
        ? t.diary.night
        : hour < 12
          ? t.diary.morning
          : hour < 18
            ? t.diary.afternoon
            : t.diary.evening;
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
    <div className="flex flex-col gap-1">
      {[...groups.entries()].map(([key, group]) => {
        const isOpen = open.has(key);
        return (
          <div key={key}>
            {/* One line, and a row of the same kind the library is made of: a
                rounded surface that lights up under the pointer. It was a
                three-column grid under a rule, and both parts were wrong — the
                80px date column could not hold "Sep · Evening", so every date
                broke across three lines and stood the rows up four deep, and
                the rule under each group drew a table nobody asked for down a
                screen whose every other list is plates with air between them.

                `press` keeps the row still under a press and lets the chevron
                do the moving: a surface this wide squeezing by 3% is a lurch,
                and `--press-hover: 1` leaves the glyph alone until it is
                actually pressed. The row answers a press by deepening — see
                `.bg-row:active`. */}
            <button
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(key)) next.add(key);
                  return next;
                })
              }
              aria-expanded={isOpen}
              className="press bg-row flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] hover:bg-accent [--press-hover:1]"
            >
              {/* The date, large: it is the thing you scan for, and folded it is
                  nearly all there is to scan. Right-aligned in its own width so
                  a 3rd and a 31st start their months in the same place. */}
              <span className="readout w-7 shrink-0 text-right text-[1.375rem] font-semibold leading-none tracking-tight text-foreground">
                {group.day}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {group.month} · {group.part}
              </span>
              {/* How many tracks. A pill rather than a bare number floating in
                  the middle of the row, where it read as a footnote to the
                  date. */}
              <span className="readout shrink-0 rounded-[var(--radius-round)] bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {group.entries.length}
              </span>
              <ChevronDown
                className={cn(
                  "press-glyph h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)]",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {/* Rows to no rows, animated.
                A height cannot be transitioned from `auto`, but a grid track
                can: `1fr` to `0fr` is two numbers, and the row inside is what
                gets squeezed. The `min-h-0` is what lets it actually reach
                zero — without it the content's own height holds the track
                open. */}
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-[var(--motion-slow)] ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="pb-3 pl-[3.25rem] pt-1">
                  {group.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-baseline gap-2.5 py-1 text-sm"
                    >
                      <span className="readout w-10 shrink-0 text-xs text-muted-foreground">
                        {new Date(entry.started_at * 1000).toLocaleTimeString(
                          undefined,
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </span>
                      <span className="min-w-0 truncate">{entry.title}</span>
                      {entry.artist && (
                        <span className="min-w-0 truncate text-muted-foreground">
                          {entry.artist}
                        </span>
                      )}
                      <span className="readout ml-auto shrink-0 pr-2 text-xs text-muted-foreground">
                        {/* `marked` cannot be written any more — marks went with
                            Nit — but rows that already say it are still rows. */}
                        {entry.outcome === "skipped"
                          ? t.diary.skipped.replace(
                              "{time}",
                              clock(entry.position_ms),
                            )
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
