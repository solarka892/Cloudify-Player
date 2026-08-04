import { useState } from "react";
import { GripVertical, Trash2, X } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { artwork, cn } from "@/lib/utils";

/**
 * The play queue, reorderable by dragging.
 *
 * Rows address positions in `order`, not in `queue`, so what you see is the
 * order things will actually play in — including after a shuffle.
 */
export function QueuePanel({ onClose }: { onClose?: () => void }) {
  const queue = usePlayerStore((s) => s.queue);
  const order = usePlayerStore((s) => s.order);
  const pos = usePlayerStore((s) => s.pos);
  const playAt = usePlayerStore((s) => s.playAt);
  const removeAt = usePlayerStore((s) => s.removeAt);
  const moveInQueue = usePlayerStore((s) => s.moveInQueue);
  const clearQueue = usePlayerStore((s) => s.clearQueue);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    // `data-queue` is a styling hook: Apple mode sizes these rows for a
    // full-height side panel rather than for the narrow popover the defaults
    // are tuned to. See `styles/apple.css`.
    // `min-h-0 flex-1` alongside `h-full`, because the two cover different
    // parents. `h-full` only resolves when the parent has a definite height; in a
    // flex column capped by `max-height` it resolves to auto, the list grew to
    // fit all 1200 rows, and `overflow-y-auto` therefore never had anything to
    // scroll — the panel just clipped it.
    <div data-queue className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="label text-sm font-semibold">{t.player.queue}</span>
        <span className="text-xs text-muted-foreground">
          {pos + 1}/{order.length}
        </span>
        <button
          onClick={clearQueue}
          className="label ml-auto text-xs text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:text-foreground"
        >
          {t.player.clearQueue}
        </button>
        {onClose && (
          <button
            onClick={onClose}
            aria-label={t.player.close}
            className="rounded p-1 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto p-1">
        {order.map((queueIndex, orderPos) => {
          const track = queue[queueIndex];
          if (!track) return null;
          const isCurrent = orderPos === pos;
          const art = artwork(track.artwork_url, "t50x50");

          return (
            <li
              key={`${queueIndex}-${orderPos}`}
              draggable
              onDragStart={(e) => {
                setDragFrom(orderPos);
                // WebKit will not start a drag — and therefore never fires
                // `drop` — unless dragstart puts something on the transfer.
                // The payload is unused; the index is tracked in state, because
                // reading `dataTransfer` during dragover is not allowed.
                e.dataTransfer.setData("text/plain", String(orderPos));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(orderPos);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDragOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) moveInQueue(dragFrom, orderPos);
                setDragFrom(null);
                setDragOver(null);
              }}
              className={cn(
                "group/row flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 transition-colors duration-[var(--motion-fast)]",
                isCurrent ? "bg-accent" : "hover:bg-accent/60",
                orderPos < pos && "opacity-50",
                dragOver === orderPos && dragFrom !== orderPos &&
                  "outline outline-1 outline-brand",
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-fast)] group-hover/row:opacity-100" />

              <button
                onClick={() => playAt(orderPos)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {art ? (
                  <img
                    src={art}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-[calc(var(--radius-control)/1.5)] object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-[calc(var(--radius-control)/1.5)] bg-secondary" />
                )}
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-xs font-medium",
                      isCurrent && "text-brand",
                    )}
                  >
                    {track.title}
                  </span>
                  {track.artist && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {track.artist}
                    </span>
                  )}
                </span>
              </button>

              {!isCurrent && (
                <button
                  onClick={() => removeAt(orderPos)}
                  aria-label={t.player.removeFromQueue}
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity duration-[var(--motion-fast)] hover:text-foreground group-hover/row:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}

        {order.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {t.player.queueEmpty}
          </li>
        )}
      </ul>
    </div>
  );
}
