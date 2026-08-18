import { CloudOff } from "lucide-react";
import { t } from "@/i18n";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * A quiet line saying SoundCloud is out of reach.
 *
 * Deliberately **not** `OfflineBadge`, which is a different fact wearing a
 * similar word: that one means "this track is coming off your disk", which is a
 * success. This one means "we cannot reach SoundCloud at all".
 *
 * It is a strip rather than a toast because it is a state, not an event — it has
 * to still be there in a minute when the user wonders why the library is not
 * loading — and it says nothing about signing in, because the session is fine.
 * It removes itself: the store leaves the offline state as soon as a retry gets
 * through (`hooks/useSession`).
 */
export function NoNetworkNotice() {
  const session = useAuthStore((s) => s.session);
  if (session.state !== "offline") return null;

  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-3 z-50 flex -translate-x-1/2 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-[var(--shadow-1)]"
    >
      <CloudOff className="h-3.5 w-3.5" aria-hidden />
      {t.auth.offline}
    </div>
  );
}
