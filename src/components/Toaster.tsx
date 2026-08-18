import { useState } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { t } from "@/i18n";
import { useToastStore, type Toast } from "@/stores/useToastStore";

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
} as const;

/** Bottom-left stack of transient notices. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-4 z-[60] flex flex-col gap-2">
      {toasts.map((item) => (
        <Notice key={item.id} item={item} />
      ))}
    </div>
  );
}

/**
 * One notice.
 *
 * Its own component because the details disclosure is state, and state per item
 * cannot live in the list. Clicking the body dismisses — except on the
 * disclosure, where the whole point is to keep reading.
 */
function Notice({ item }: { item: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const [open, setOpen] = useState(false);
  const Icon = ICONS[item.tone];

  return (
    <div
      data-toast
      data-kind={item.tone}
      className="panel panel-raised pointer-events-auto flex max-w-sm gap-2 px-3 py-2 text-left text-sm"
      style={{ animation: "toast-in var(--motion-slow) ease" }}
    >
      <Icon
        className={
          item.tone === "error"
            ? "mt-0.5 h-4 w-4 shrink-0 text-destructive"
            : item.tone === "success"
              ? "mt-0.5 h-4 w-4 shrink-0 text-brand"
              : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
        }
      />
      <div className="min-w-0 flex-1">
        <button onClick={() => dismiss(item.id)} className="block w-full text-left">
          <span className="block">{item.message}</span>
          {/* What to do about it, when there is something to do. */}
          {item.hint && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {item.hint}
            </span>
          )}
        </button>

        {item.details && (
          <>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              {t.errors.detailsToggle}
            </button>
            {open && (
              // Selectable and wrapped: the only reason this text exists is to be
              // copied into a bug report.
              <p className="mt-1 select-text break-words font-mono text-[11px] text-muted-foreground">
                {item.details}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
