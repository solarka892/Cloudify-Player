import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TrackList } from "@/components/TrackList";
import { PlaylistList } from "@/components/PlaylistList";
import { UserList } from "@/components/UserList";
import { useLibraryStore, type Section } from "@/stores/useLibraryStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

type LibrarySection = "likes" | "playlists" | "following";

const SECTIONS: { id: LibrarySection; label: string }[] = [
  { id: "likes", label: t.library.likes },
  { id: "playlists", label: t.library.playlists },
  { id: "following", label: t.library.following },
];

export function LibraryView({ userId }: { userId: number }) {
  const [section, setSection] = useState<LibrarySection>("likes");

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <nav className="flex gap-4 border-b border-border">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "-mb-px border-b-2 px-1 pb-2 text-sm font-medium transition-colors",
              section === s.id
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {section === "likes" && <LikesSection userId={userId} />}
      {section === "playlists" && <PlaylistsSection userId={userId} />}
      {section === "following" && <FollowingSection userId={userId} />}
    </div>
  );
}

function LikesSection({ userId }: { userId: number }) {
  const likes = useLibraryStore((s) => s.likes);
  const load = useLibraryStore((s) => s.loadLikes);
  const refresh = useLibraryStore((s) => s.refreshLikes);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  return (
    <SectionShell
      section={likes}
      count={likes.items.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.empty}
    >
      <TrackList tracks={likes.items} />
    </SectionShell>
  );
}

function PlaylistsSection({ userId }: { userId: number }) {
  const own = useLibraryStore((s) => s.ownPlaylists);
  const liked = useLibraryStore((s) => s.likedPlaylists);
  const load = useLibraryStore((s) => s.loadPlaylists);
  const refresh = useLibraryStore((s) => s.refreshPlaylists);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  const total = own.items.length + liked.items.length;

  return (
    <SectionShell
      section={own}
      count={total}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.noPlaylists}
    >
      <div className="flex flex-col gap-4">
        {own.items.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.library.ownPlaylists}
            </h3>
            <PlaylistList playlists={own.items} />
          </div>
        )}
        {liked.items.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.library.likedPlaylists}
            </h3>
            <PlaylistList playlists={liked.items} />
          </div>
        )}
      </div>
    </SectionShell>
  );
}

function FollowingSection({ userId }: { userId: number }) {
  const followings = useLibraryStore((s) => s.followings);
  const load = useLibraryStore((s) => s.loadFollowings);
  const refresh = useLibraryStore((s) => s.refreshFollowings);

  useEffect(() => {
    void load(userId);
  }, [userId, load]);

  return (
    <SectionShell
      section={followings}
      count={followings.items.length}
      onRefresh={() => void refresh(userId)}
      emptyLabel={t.library.noFollowing}
    >
      <UserList users={followings.items} />
    </SectionShell>
  );
}

/** Shared count / refresh / loading / error / empty chrome around a section. */
function SectionShell({
  section,
  count,
  onRefresh,
  emptyLabel,
  children,
}: {
  section: Section<unknown>;
  count: number;
  onRefresh: () => void;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  const loading = section.status === "loading";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {count > 0 ? count : ""}
        </span>
        <button
          onClick={onRefresh}
          disabled={loading}
          aria-label={t.library.refresh}
          title={t.library.refresh}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* On refresh the cached list stays on screen; the spinner is the signal. */}
      {loading && count === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {section.status === "error" && (
        <p className="text-sm text-red-400">
          {t.library.error}: {section.error}
        </p>
      )}

      {section.status === "ok" && count === 0 && (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}

      {count > 0 && children}
    </div>
  );
}
