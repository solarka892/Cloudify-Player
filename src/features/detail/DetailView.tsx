import { useEffect, useState } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { scGetPlaylistTracks, type Track } from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { DownloadAllButton } from "@/components/DownloadAllButton";
import { ProfileView } from "@/features/profile/ProfileView";
import { useNavStore, type Detail } from "@/stores/useNavStore";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";

type State =
  | { status: "loading" }
  | { status: "ok"; tracks: Track[] }
  | { status: "error"; message: string };

/** The tracks behind an opened playlist or user. */
export function DetailView({ detail }: { detail: Detail }) {
  if (detail.kind === "user") return <UserDetail detail={detail} />;
  return <PlaylistDetail detail={detail} />;
}

/** A user opened from a list: their whole profile, with a way back. */
function UserDetail({ detail }: { detail: Detail }) {
  const back = useNavStore((s) => s.back);
  return (
    <div className="stack">
      <button
        onClick={back}
        aria-label={t.nav.back}
        className="flex w-fit items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t.nav.back}
      </button>
      <ProfileView userId={detail.id} />
    </div>
  );
}

function PlaylistDetail({ detail }: { detail: Detail }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const back = useNavStore((s) => s.back);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    scGetPlaylistTracks(detail.id)
      .then((tracks) => !cancelled && setState({ status: "ok", tracks }))
      .catch(
        (e) => !cancelled && setState({ status: "error", message: String(e) }),
      );
    return () => {
      cancelled = true;
    };
  }, [detail.kind, detail.id]);

  const tracks = state.status === "ok" ? state.tracks : [];

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          onClick={back}
          aria-label={t.nav.back}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="mr-auto flex min-w-0 flex-col">
          <h2 className="truncate text-lg font-semibold">{detail.title}</h2>
          {detail.subtitle && (
            <span className="truncate text-xs text-muted-foreground">
              {detail.subtitle}
            </span>
          )}
        </div>

        {tracks.length > 0 && <DownloadAllButton tracks={tracks} />}

        {tracks.length > 0 && (
          <button
            onClick={() => {
              const first = tracks[0];
              if (first) void playTrack(first, tracks);
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-to-r from-brand to-brand-2 px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5 translate-x-[1px]" />
            {t.detail.playAll}
          </button>
        )}
      </div>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-400">
          {t.detail.error}: {state.message}
        </p>
      )}

      {state.status === "ok" && tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.detail.empty}</p>
      )}

      {tracks.length > 0 && <TrackList tracks={tracks} />}
    </section>
  );
}
