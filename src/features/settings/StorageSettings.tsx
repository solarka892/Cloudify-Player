import { useEffect, useState } from "react";
import { t } from "@/i18n";
import { storageErase, storageReport, type StorageReport } from "@/lib/store";
import { confirmAction } from "@/stores/useConfirmStore";
import { toast } from "@/stores/useToastStore";

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
