import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { t } from "@/i18n";
import { clock } from "@/hooks/useHotkeys";
import { diaryClear, diaryList, type DiaryEntry } from "@/lib/store";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast } from "@/stores/useToastStore";
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
 * Local, and it never leaves the machine. The retention below is the whole of
 * the privacy story: pick a window and anything older is dropped at startup.
 */

/** The windows offered. `0` keeps everything. */
const RETENTIONS: { days: number; label: () => string }[] = [
  { days: 30, label: () => t.diary.days30 },
  { days: 180, label: () => t.diary.days180 },
  { days: 365, label: () => t.diary.days365 },
  { days: 0, label: () => t.diary.forever },
];

export function DiaryView() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const days = useSettingsStore((s) => s.nit.diaryDays);
  const setNit = useSettingsStore((s) => s.setNit);

  const load = useCallback(() => {
    void diaryList().then(setEntries).catch(() => setEntries([]));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="stack">
      <ViewHead
        title={t.diary.title}
        sub={t.diary.hint}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="label shrink-0 text-xs text-muted-foreground">
              {t.diary.keepFor}
            </span>
            {RETENTIONS.map(({ days: option, label }) => (
              <button
                key={option}
                onClick={() => setNit({ diaryDays: option })}
                className={cn(
                  "rounded-[var(--radius-control)] border border-border px-2 py-1 text-xs transition-colors duration-[var(--motion-fast)] hover:bg-accent",
                  days === option
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label()}
              </button>
            ))}
            <button
              onClick={() => {
                void diaryClear().then(() => {
                  setEntries([]);
                  toast(t.diary.cleared, "success");
                });
              }}
              disabled={entries.length === 0}
              className="ml-1 flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-2 py-1 text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t.diary.clear}
            </button>
          </div>
        }
      />

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.diary.empty}</p>
      ) : (
        <Entries entries={entries} />
      )}
    </div>
  );
}

function Entries({ entries }: { entries: DiaryEntry[] }) {
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
    <div>
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
                <span className="readout ml-auto shrink-0 text-xs text-muted-foreground">
                  {/* `marked` cannot be written any more — marks went with Nit
                      — but rows that already say it are still rows. */}
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
