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
}: {
  url: string | null;
  size?: "sm" | "md";
  className?: string;
  withLabel?: boolean;
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
        withLabel
          ? "border border-border px-2.5 py-1 text-xs hover:bg-accent"
          : "p-1.5 hover:scale-110",
        className,
      )}
    >
      <Share2 className={icon} />
      {withLabel && t.track.share}
    </button>
  );
}
