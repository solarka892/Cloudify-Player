import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import {
  scDeletePlaylist,
  scEditPlaylist,
  scSetPlaylistTracks,
  type Playlist,
  type Track,
} from "@/lib/tauri";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useNavStore } from "@/stores/useNavStore";
import { confirmAction } from "@/stores/useConfirmStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Rename a playlist, change its visibility, reorder or drop its tracks, or
 * delete it.
 *
 * Metadata and track order are two separate requests because they are two
 * separate hazards: SoundCloud replaces the whole track list on every write,
 * so the order is only sent when it has actually been touched. Saving a rename
 * must never be able to reshuffle — or empty — the set.
 */
export function PlaylistEditDialog({
  playlist,
  tracks,
  onClose,
  onSaved,
}: {
  playlist: Playlist;
  /** Current contents, in playlist order. */
  tracks: Track[];
  onClose: () => void;
  /** Called with the new order after a successful save. */
  onSaved?: (tracks: Track[]) => void;
}) {
  const [title, setTitle] = useState(playlist.title);
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [order, setOrder] = useState<Track[]>(tracks);
  const [orderTouched, setOrderTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const userId = useLibraryStore((s) => s.userId);
  const refreshPlaylists = useLibraryStore((s) => s.refreshPlaylists);
  const back = useNavStore((s) => s.back);

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setOrder(next);
    setOrderTouched(true);
  }

  function drop(index: number) {
    setOrder(order.filter((_, i) => i !== index));
    setOrderTouched(true);
  }

  async function save() {
    setBusy(true);
    try {
      const renamed = title.trim();
      await scEditPlaylist(playlist.id, {
        title: renamed && renamed !== playlist.title ? renamed : undefined,
        description: description.trim() || undefined,
        public: isPublic,
      });

      if (orderTouched) {
        await scSetPlaylistTracks(
          playlist.id,
          order.map((track) => track.id),
        );
        onSaved?.(order);
      }

      toast(t.playlistEdit.saved, "success");
      if (userId != null) void refreshPlaylists(userId);
      onClose();
    } catch (e) {
      toast(`${t.playlistEdit.failed}: ${e}`, "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirmAction(t.playlistEdit.deleteConfirm, {
      confirmLabel: t.common.delete,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await scDeletePlaylist(playlist.id);
      toast(t.playlistEdit.deleted, "success");
      if (userId != null) void refreshPlaylists(userId);
      onClose();
      // The page behind the dialog is the playlist that no longer exists.
      back();
    } catch (e) {
      toast(`${t.playlistEdit.failed}: ${e}`, "error");
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center scrim p-8"
      onClick={onClose}
    >
      <div
        className="panel panel-raised pop-in flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Pencil className="h-4 w-4 text-muted-foreground" />
          <span className="label text-sm font-semibold">{t.playlistEdit.title}</span>
          <button
            onClick={onClose}
            aria-label={t.player.close}
            className="ml-auto rounded-[var(--radius-control)] p-1 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t.playlistEdit.name}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              className="rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t.playlistEdit.description}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
              rows={3}
              className="resize-none rounded-[var(--radius-control)] border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              {t.playlistEdit.visibility}
            </span>
            <div className="flex gap-1">
              {[
                { value: true, label: t.playlistEdit.public },
                { value: false, label: t.playlistEdit.private },
              ].map((option) => (
                <button
                  key={String(option.value)}
                  onClick={() => setIsPublic(option.value)}
                  className={cn(
                    "rounded-[var(--radius-control)] border px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)]",
                    isPublic === option.value
                      ? "border-brand text-brand"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {order.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                {t.playlistEdit.tracks} · {order.length}
              </span>
              <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-[var(--radius-control)] border border-border">
                {order.map((track, index) => (
                  <li
                    key={track.id}
                    className="flex items-center gap-2 px-2 py-1.5"
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {track.title}
                    </span>
                    <button
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label={t.playlistEdit.moveUp}
                      className="rounded-[var(--radius-control)] p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => move(index, index + 1)}
                      disabled={index === order.length - 1}
                      aria-label={t.playlistEdit.moveDown}
                      className="rounded-[var(--radius-control)] p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => drop(index)}
                      aria-label={t.playlistEdit.removeTrack}
                      className="rounded-[var(--radius-control)] p-1 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-3">
          <button
            onClick={() => void remove()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:border-destructive hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {t.playlistEdit.delete}
          </button>
          <button
            onClick={() => void save()}
            disabled={busy || !title.trim()}
            className="brand-gradient ml-auto rounded-[var(--radius-control)] px-4 py-1.5 text-sm font-semibold text-brand-foreground transition-opacity duration-[var(--motion-fast)] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? t.playlistEdit.saving : t.playlistEdit.save}
          </button>
        </div>
      </div>
    </div>
  );
}
