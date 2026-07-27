import { User as UserIcon } from "lucide-react";
import type { User } from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { useIncremental } from "@/hooks/useIncremental";
import { t } from "@/i18n";
import { artwork } from "@/lib/utils";

/** Compact number formatting: 12500 → 12.5K. */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Users; a click drills into that user's uploads. */
export function UserList({ users }: { users: User[] }) {
  const openUser = useNavStore((s) => s.openUser);
  const { visible, sentinel, hasMore } = useIncremental(users, 40);

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius)] border border-border">
      {visible.map((user) => {
        const avatar = artwork(user.avatar_url);
        return (
          <li className="row-cv" key={user.id}>
            <button
              onClick={() => openUser(user)}
              className="flex w-full items-center gap-3 bg-card px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {user.username}
                </span>
                {user.followers_count != null && (
                  <span className="truncate text-xs text-muted-foreground">
                    {formatCount(user.followers_count)} {t.auth.followers}
                  </span>
                )}
              </div>
              {user.track_count != null && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {user.track_count} {t.library.tracksShort}
                </span>
              )}
            </button>
          </li>
        );
      })}
      {hasMore && <div ref={sentinel} className="h-8" aria-hidden />}
    </ul>
  );
}
