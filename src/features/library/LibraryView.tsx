import { useEffect, useState } from "react";
import { scGetLikes, type Track } from "@/lib/tauri";
import { TrackList } from "@/components/TrackList";
import { t } from "@/i18n";

type LibraryState =
  | { status: "loading" }
  | { status: "ok"; tracks: Track[] }
  | { status: "error"; message: string };

export function LibraryView({ userId }: { userId: number }) {
  const [state, setState] = useState<LibraryState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    scGetLikes(userId)
      .then((tracks) => !cancelled && setState({ status: "ok", tracks }))
      .catch((e) => !cancelled && setState({ status: "error", message: String(e) }));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <section className="flex w-full max-w-2xl flex-col gap-3">
      <h2 className="text-lg font-semibold">
        {t.library.likes}
        {state.status === "ok" && (
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {state.tracks.length}
          </span>
        )}
      </h2>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">{t.library.loading}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-red-400">
          {t.library.error}: {state.message}
        </p>
      )}

      {state.status === "ok" && state.tracks.length === 0 && (
        <p className="text-sm text-muted-foreground">{t.library.empty}</p>
      )}

      {state.status === "ok" && state.tracks.length > 0 && (
        <TrackList tracks={state.tracks} />
      )}
    </section>
  );
}
