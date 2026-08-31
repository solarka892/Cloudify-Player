import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/i18n";
import { buildCommands, commandMatches, type Command } from "@/lib/commands";
import { cacheSearch, type SearchHit } from "@/lib/store";
import { clock } from "@/hooks/useHotkeys";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/usePlayerStore";
import type { Track } from "@/lib/tauri";

/**
 * One field, everything in it.
 *
 * Commands, tracks and marks share a single list rather than sitting behind
 * tabs, because the point of the palette is that you type what you want without
 * first deciding what kind of thing it is. Which kind it turned out to be is
 * answered on the right of each row, after the fact.
 *
 * Tracks and marks come from the local mirror (`cache_search`), so this works
 * with the network off and answers while you type rather than after a request.
 * Nothing here ever reaches SoundCloud.
 */

type Row =
  | { kind: "command"; command: Command }
  | { kind: "track"; hit: SearchHit }
  | { kind: "mark"; hit: SearchHit };

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // Debounced, and it drops its own result if a newer query has started —
  // SQLite answers in single-digit milliseconds, but the two round trips
  // through the bridge can still arrive out of order.
  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void cacheSearch(query, 12)
        .then((found) => live && setHits(found))
        .catch(() => live && setHits([]));
    }, 60);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const rows = useMemo<Row[]>(() => {
    const commands = buildCommands()
      .filter((command) => commandMatches(command, query))
      // With nothing typed the palette is a menu, and a menu of twenty entries
      // is a wall. The eight most useful, then everything on the first keystroke.
      .slice(0, query ? 20 : 8)
      .map((command) => ({ kind: "command" as const, command }));

    const tracks = hits
      .filter((hit) => hit.note === null)
      .map((hit) => ({ kind: "track" as const, hit }));
    const marks = hits
      .filter((hit) => hit.note !== null)
      .map((hit) => ({ kind: "mark" as const, hit }));

    return [...commands, ...tracks, ...marks];
  }, [query, hits]);

  // A shorter list can leave the cursor past the end of it.
  useEffect(() => {
    setActive((index) => Math.min(index, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  function run(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "command") {
      row.command.run();
      onClose();
      return;
    }
    const track: Track = {
      id: row.hit.id,
      title: row.hit.title,
      duration: row.hit.duration,
      artwork_url: row.hit.artwork_url,
      permalink_url: row.hit.permalink_url,
      artist: row.hit.artist,
    };
    void usePlayerStore
      .getState()
      .playTrack(track)
      .then(() => {
        // A mark is a place in a track, so opening one means going there.
        if (row.kind === "mark" && row.hit.note_position_ms !== null) {
          usePlayerStore.getState().seek(row.hit.note_position_ms / 1000);
        }
      });
    onClose();
  }

  return (
    <div
      className="scrim fixed inset-0 z-[220] flex items-start justify-center p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="panel panel-raised pop-in w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t.cmdk.placeholder}
          spellCheck={false}
          autoComplete="off"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(rows.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(rows[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />

        <div ref={listRef} className="max-h-[46vh] overflow-y-auto">
          {rows.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t.cmdk.empty}
            </p>
          )}
          {rows.map((row, index) => (
            <button
              key={
                row.kind === "command"
                  ? row.command.id
                  : `${row.kind}-${row.hit.urn}-${row.hit.note_position_ms ?? 0}`
              }
              ref={(el) => {
                // Keeps the keyboard cursor in view without a ref per row. The
                // braces matter: a ref callback that returns anything is read
                // as a cleanup function.
                if (index === active) el?.scrollIntoView({ block: "nearest" });
              }}
              data-cmdk-item
              onMouseEnter={() => setActive(index)}
              onClick={() => run(row)}
              aria-selected={index === active}
              className={cn(
                "flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm",
                index === active ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {row.kind === "command" ? row.command.label : row.hit.title}
                {row.kind !== "command" && row.hit.artist && (
                  <span className="text-muted-foreground"> · {row.hit.artist}</span>
                )}
                {row.kind === "mark" && (
                  <span className="block truncate text-xs text-brand-2">
                    {row.hit.note}
                  </span>
                )}
              </span>
              <span className="label shrink-0 text-[0.625rem] text-muted-foreground">
                {row.kind === "command"
                  ? row.command.group === "views"
                    ? t.cmdk.groupViews
                    : t.cmdk.groupCommands
                  : row.kind === "mark"
                    ? clock(row.hit.note_position_ms ?? 0)
                    : t.cmdk.groupTracks}
              </span>
            </button>
          ))}
        </div>

        <p className="readout border-t border-border px-4 py-2 text-[0.6875rem] text-muted-foreground">
          {t.cmdk.hintKeys}
        </p>
      </div>
    </div>
  );
}
