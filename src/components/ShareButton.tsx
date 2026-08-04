import { Share2 } from "lucide-react";
import { copyLink } from "@/lib/share";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Copies the entity's soundcloud.com link.
 *
 * Anything without a `permalink_url` — a private upload, an incomplete search
 * result — renders nothing rather than a button that cannot work.
 */

export function ShareButton({
  url,
  size = "sm",
  className,
  /** Show the word next to the icon, for headers with room for it. */
  withLabel = false,
  /**
   * The glyph to draw. Overridable because lucide's `Share2` is a node graph,
   * which on an Apple platform reads as nothing at all — sharing there is a box
   * with something leaving it, and Apple mode passes that instead.
   */
  Icon = Share2,
}: {
  url: string | null;
  size?: "sm" | "md";
  className?: string;
  withLabel?: boolean;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  if (!url) return null;

  const icon = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <button
      onClick={(e) => {
        // Share buttons sit inside rows that are themselves play buttons.
        e.stopPropagation();
        void copyLink(url);
      }}
      title={t.track.share}
      aria-label={t.track.share}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] text-muted-foreground transition-[color,transform] duration-[var(--motion-fast)] hover:text-foreground active:scale-90",
        // The labelled form is only used in a profile header, next to the
        // station and message buttons — so it takes their height and their
        // type size rather than the smaller ones it had, which left the three
        // of them sitting at three different sizes in the same row.
        withLabel
          ? "h-9 border border-border px-3 text-sm hover:bg-accent"
          : "p-1.5 hover:scale-110",
        className,
      )}
    >
      <Icon className={icon} />
      {withLabel && t.track.share}
    </button>
  );
}
