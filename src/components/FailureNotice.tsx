import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { t } from "@/i18n";
import { explain, remedyLabel } from "@/lib/errorText";
import { asFailure } from "@/lib/failure";
import { openExternal } from "@/lib/open";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * A failure, shown in place of the content that failed to load.
 *
 * The inline half of task 17 — `toastFailure` covers the "an action of yours did
 * not work" half. Three things, in this order, because that is the order the
 * reader needs them in: what happened, why, and the one thing worth doing about
 * it. The diagnostic is last, behind a toggle, because it is the only thing
 * worth having when a bug is reported and noise the rest of the time.
 *
 * `onRetry` is optional: a screen that cannot reload itself passes nothing and
 * the button is simply not offered. Offering a "try again" that does nothing is
 * worse than not offering one.
 */
export function FailureNotice({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const explained = explain(asFailure(error));
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);

  // A sign-in window the user closed themselves is not a failure to report.
  // Hooks run first: bailing out above them would break the render order.
  if (explained.silent) return null;

  const label = remedyLabel(explained.remedy);
  // Only offer an action there is actually something behind.
  const act =
    explained.remedy === "retry"
      ? onRetry
      : explained.remedy === "signIn"
        ? () => void signOut()
        : explained.remedy === "openSoundCloud"
          ? () => void openExternal("https://soundcloud.com")
          : undefined;

  return (
    <div
      role="alert"
      className={`flex flex-col items-start gap-2 py-8 text-sm ${className ?? ""}`}
    >
      <span className="flex items-center gap-2 font-medium">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        {explained.what}
      </span>

      {explained.why && (
        <p className="max-w-prose text-muted-foreground">{explained.why}</p>
      )}

      {label && act && (
        <button
          onClick={act}
          className="rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
        >
          {label}
        </button>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {t.errors.detailsToggle}
      </button>
      {open && (
        // Selectable and monospaced: this text exists to be copied into a report.
        <p className="max-w-prose select-text break-words font-mono text-[11px] text-muted-foreground">
          {explained.details}
        </p>
      )}
    </div>
  );
}
