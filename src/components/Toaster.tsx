import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useToastStore } from "@/stores/useToastStore";

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: XCircle,
} as const;

/** Bottom-left stack of transient notices. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-24 left-4 z-[60] flex flex-col gap-2">
      {toasts.map((item) => {
        const Icon = ICONS[item.tone];
        return (
          <button
            key={item.id}
            onClick={() => dismiss(item.id)}
            className="panel panel-raised pointer-events-auto flex max-w-sm items-center gap-2 px-3 py-2 text-left text-sm"
            style={{ animation: "toast-in var(--motion-slow) ease" }}
          >
            <Icon
              className={
                item.tone === "error"
                  ? "h-4 w-4 shrink-0 text-destructive"
                  : item.tone === "success"
                    ? "h-4 w-4 shrink-0 text-brand"
                    : "h-4 w-4 shrink-0 text-muted-foreground"
              }
            />
            <span className="min-w-0">{item.message}</span>
          </button>
        );
      })}
    </div>
  );
}
