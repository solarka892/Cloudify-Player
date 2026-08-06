import { useEffect } from "react";
import { useConfirmStore } from "@/stores/useConfirmStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Renders whatever `confirmAction` is currently asking.
 *
 * Mounted once, next to the toaster. See `stores/useConfirmStore` for why the
 * platform's own `confirm()` is not used.
 */
export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending);
  const answer = useConfirmStore((s) => s.answer);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
      if (e.key === "Enter") answer(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, answer]);

  if (!pending) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center scrim p-6"
      onClick={() => answer(false)}
      role="alertdialog"
      aria-modal="true"
    >
      <div
        className="panel panel-raised pop-in flex w-full max-w-sm flex-col gap-4 rounded-[var(--radius-hero)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm">{pending.message}</p>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => answer(false)}
            className="rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
          >
            {t.common.cancel}
          </button>
          <button
            autoFocus
            onClick={() => answer(true)}
            className={cn(
              "rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-semibold transition-opacity duration-[var(--motion-fast)] hover:opacity-90",
              pending.destructive
                ? "bg-destructive text-destructive-foreground"
                : "brand-gradient text-brand-foreground",
            )}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
