import { X } from "lucide-react";
import { t } from "@/i18n";

/**
 * Shortcut cheat sheet, opened with `?`.
 *
 * Built per render, not at import time, so the labels follow the active
 * language (see the note on the live `t` binding in `@/i18n`).
 */
function keyRows(): [string, string][] {
  return [
    ["Space", t.keys.playPause],
    ["← / →", t.keys.seek],
    ["Shift + ← / →", t.keys.prevNext],
    ["↑ / ↓", t.keys.volume],
    ["M", t.keys.mute],
    ["S", t.keys.shuffle],
    ["R", t.keys.repeat],
    ["F", t.keys.fullscreen],
    ["/", t.keys.search],
    ["Esc", t.keys.close],
    ["?", t.keys.help],
  ];
}

export function HotkeyHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center scrim p-8"
      onClick={onClose}
    >
      <div
        className="panel panel-raised pop-in w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center">
          <h2 className="label text-lg font-semibold">{t.keys.title}</h2>
          <button
            onClick={onClose}
            aria-label={t.player.close}
            className="ml-auto rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="flex flex-col gap-1.5">
          {keyRows().map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <dt className="w-32 shrink-0">
                <kbd className="rounded-[var(--radius-control)] border border-border bg-secondary px-2 py-0.5 font-mono text-xs">
                  {key}
                </kbd>
              </dt>
              <dd className="text-sm text-muted-foreground">{label}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">{t.keys.hint}</p>
      </div>
    </div>
  );
}
