import { User as UserIcon } from "lucide-react";
import type { User } from "@/lib/tauri";
import { useNavStore } from "@/stores/useNavStore";
import { ShareButton } from "./ShareButton";
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
    <ul className="list-card flex flex-col divide-y divide-border">
      {visible.map((user, index) => {
        const avatar = artwork(user.avatar_url);
        // The row and the share action are siblings, not nested buttons —
        // which would be invalid, and unclickable.
        return (
          <li
            key={user.id}
            style={{ "--i": Math.min(index, 14) } as React.CSSProperties}
            className="rise-in group/row flex items-center bg-row pr-2 transition-[background-color] duration-[var(--motion-fast)] hover:bg-accent"
          >
            <button
              onClick={() => openUser(user)}
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
            >
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  loading="lazy"
                  decoding="async"
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
            <ShareButton
              url={user.permalink_url}
              className="opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/row:opacity-100"
            />
          </li>
        );
      })}
      {hasMore && <div ref={sentinel} className="h-8" aria-hidden />}
    </ul>
  );
}
