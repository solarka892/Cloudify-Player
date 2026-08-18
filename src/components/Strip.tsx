import { cn } from "@/lib/utils";

/**
 * The app talking to you about the list you are looking at.
 *
 * "14 duplicates — keep one of each", "this track is gone from SoundCloud",
 * "found by transliteration". Not a toast: a toast is about something that just
 * happened and then leaves, and these are standing facts about what is on the
 * screen, with the action that resolves them attached.
 *
 * One shape for all of them, with an edge in the ink that says which kind it is:
 * the accent for something to act on, the second ink for something the app has
 * noticed, quiet for an empty result. Actions are pills; at most one of them is
 * primary, because a bar with two loud buttons is a dialog.
 */
export function Strip({
  tone = "act",
  children,
  actions,
}: {
  tone?: "act" | "mark" | "quiet";
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className="strip flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-border border-l-[3px] px-3 py-2.5 text-sm"
      data-tone={tone}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {actions}
    </div>
  );
}

/** A pill on a strip. `primary` is the one that resolves it. */
export function StripAction({
  onClick,
  primary,
  children,
}: {
  onClick: () => void;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      data-primary={primary ? "" : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-[var(--radius-round)] border px-3 py-1.5 text-xs transition-colors duration-[var(--motion-fast)]",
        primary
          ? "border-brand bg-brand text-brand-foreground hover:bg-foreground hover:text-background"
          : "border-border hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
