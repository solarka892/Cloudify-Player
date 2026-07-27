import { useEffect, useState } from "react";
import { ListPlus, Plus, X } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Pick a playlist for a track, or make a new one.
 *
 * Adding is a read-modify-write on SoundCloud's side, so it can take a moment
 * on a large playlist — the row shows a pending state rather than closing
 * optimistically and lying about the result.
 */
export function AddToPlaylistDialog({
  track,
  onClose,
}: {
  track: Track;
  onClose: () => void;
}) {
  const userId = useLibraryStore((s) => s.userId);
  const own = useLibraryStore((s) => s.ownPlaylists);
  const loadPlaylists = useLibraryStore((s) => s.loadPlaylists);
  const addToPlaylist = useLibraryStore((s) => s.addToPlaylist);
  const createPlaylist = useLibraryStore((s) => s.createPlaylist);

  const [busy, setBusy] = useState<number | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (userId != null) void loadPlaylists(userId);
  }, [userId, loadPlaylists]);

  const shown = own.items.filter(
    (p) => !p.is_album && p.title.toLowerCase().includes(filter.toLowerCase()),
  );

  async function add(playlistId: number) {
    setBusy(playlistId);
    try {
      await addToPlaylist(playlistId, track);
      toast(t.track.addedToPlaylist, "success");
      onClose();
    } catch (e) {
      toast(`${t.track.addFailed}: ${e}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!title.trim()) return;
    setBusy("new");
    try {
      await createPlaylist(title.trim(), track);
      toast(t.track.playlistCreated, "success");
      onClose();
    } catch (e) {
      toast(`${t.track.addFailed}: ${e}`, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-8"
      onClick={onClose}
    >
      <div
        className="panel panel-raised pop-in flex max-h-[70vh] w-full max-w-md flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ListPlus className="h-4 w-4 text-muted-foreground" />
          <span className="label text-sm font-semibold">
            {t.track.addToPlaylist}
          </span>
          <button
            onClick={onClose}
            aria-label={t.player.close}
            className="ml-auto rounded p-1 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <p className="mb-2 truncate text-xs text-muted-foreground">
            {track.title}
          </p>
          <input
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value)}
            placeholder={t.track.findPlaylist}
            className="w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto p-1">
          {shown.map((playlist) => (
            <li key={playlist.id}>
              <button
                onClick={() => void add(playlist.id)}
                disabled={busy !== null}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent disabled:opacity-50",
                  busy === playlist.id && "bg-accent",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{playlist.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {playlist.track_count}
                </span>
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="p-4 text-center text-sm text-muted-foreground">
              {own.status === "loading" ? t.library.loading : t.library.noPlaylists}
            </li>
          )}
        </ul>

        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            placeholder={t.track.newPlaylist}
            className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={!title.trim() || busy !== null}
            className="brand-gradient flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-semibold text-white transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            {t.track.create}
          </button>
        </form>
      </div>
    </div>
  );
}
