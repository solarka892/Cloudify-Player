import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { storageErase, storageReport, type StorageReport } from "@/lib/store";
import { confirmAction } from "@/stores/useConfirmStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast } from "@/stores/useToastStore";
import { cn } from "@/lib/utils";

/**
 * How long the diary keeps what it records. `0` keeps everything.
 *
 * It used to sit in the diary's own header, where five buttons and a label took
 * the whole strip and left the screen's title squeezed into a corner. It reads
 * better here anyway: this is the page about what stays on the disk, and the
 * diary's rows are one of the lines in the table below.
 */
const RETENTIONS: { days: number; label: () => string }[] = [
  { days: 30, label: () => t.diary.days30 },
  { days: 180, label: () => t.diary.days180 },
  { days: 365, label: () => t.diary.days365 },
  { days: 0, label: () => t.diary.forever },
];

/**
 * What is kept on this machine, in plain words, with a button to erase each of
 * it.
 *
 * This screen is the price of the rest of the app. It is an unofficial client
 * talking to an undocumented API, it now keeps a mirror of the library, a
 * listening history and a set of private notes — and the only way that is worth
 * anyone's trust is if the thing itself will tell you, without being asked
 * twice, exactly what it has and where.
 *
 * The rows are generated from the report the store hands back, so a table added
 * later appears here whether or not anyone remembers to come and add it. That is
 * deliberate: a privacy screen maintained by hand is a privacy screen that goes
 * out of date.
 */
export function StorageSettings() {
  const [report, setReport] = useState<StorageReport | null>(null);
  const diaryDays = useSettingsStore((s) => s.nit.diaryDays);
  const setNit = useSettingsStore((s) => s.setNit);

  const refresh = () => void storageReport().then(setReport).catch(() => {});
  useEffect(refresh, []);

  async function erase(id: string, name: string) {
    const ok = await confirmAction(
      t.storage.eraseConfirm.replace("{name}", name),
      { confirmLabel: t.storage.erase, destructive: true },
    );
    if (!ok) return;
    await storageErase(id).catch(() => {});
    toast(t.storage.erased, "success");
    refresh();
  }

  const names: Record<string, string> = {
    marks: t.storage.marks,
    history: t.storage.history,
    later: t.storage.later,
    tombstones: t.storage.tombstones,
    loudness: t.storage.loudness,
    waveforms: t.storage.waveforms,
    tracks: t.storage.tracks,
  };

  return (
    <section className="stack">
      <div className="px-1">
        <h2 className="group-title">{t.storage.title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.storage.hint}</p>
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]">
        <div className="min-w-0">
          <div className="text-sm font-medium">{t.diary.keepFor}</div>
          <div className="text-xs text-muted-foreground">{t.diary.hint}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RETENTIONS.map(({ days, label }) => (
            <button
              key={days}
              onClick={() => setNit({ diaryDays: days })}
              className={cn(
                "rounded-[var(--radius-control)] border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)]",
                diaryDays === days
                  ? "border-brand bg-accent"
                  : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {label()}
            </button>
          ))}
        </div>
      </div>

      <div className="panel divide-y divide-border">
        {(report?.lines ?? []).map((line) => (
          <div
            key={line.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">{names[line.id] ?? line.id}</div>
              <div className="readout text-xs text-muted-foreground">
                {t.storage.rows.replace("{n}", String(line.rows))}
              </div>
            </div>
            <button
              onClick={() => void erase(line.id, names[line.id] ?? line.id)}
              disabled={line.rows === 0}
              className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-40"
            >
              {t.storage.erase}
            </button>
          </div>
        ))}
      </div>

      <div className="panel px-4 py-3">
        <p className="text-sm">{t.storage.nothingLeaves}</p>
        {report && (
          <p className="readout mt-1 break-all text-xs text-muted-foreground">
            {formatBytes(report.bytes)} · {report.path}
          </p>
        )}
      </div>

      <button
        onClick={() => void erase("all", t.storage.eraseAll)}
        className="self-start text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-destructive"
      >
        {t.storage.eraseAll}
      </button>
    </section>
  );
}

/** One decimal place, and never "0.0 KB" for an empty file. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
