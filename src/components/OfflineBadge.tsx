import { HardDriveDownload } from "lucide-react";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * "This is coming off the disk."
 *
 * Preferring the downloaded copy is not a setting and never was — it is what the
 * player does. The trouble with that is it is completely invisible: a local file
 * and a fast connection look identical, so there was no way to tell whether an
 * offline library was doing anything without turning the network off. One glyph,
 * only while it is true.
 */
export function OfflineBadge({ className }: { className?: string }) {
  const offline = usePlayerStore((s) => s.playingOffline);
  if (!offline) return null;

  return (
    <span
      title={t.player.playingOffline}
      aria-label={t.player.playingOffline}
      className={cn("shrink-0 text-muted-foreground", className)}
    >
      <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />
    </span>
  );
}
