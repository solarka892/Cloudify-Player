import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import type { Track } from "@/lib/tauri";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { toast } from "@/stores/useToastStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * The heart. Optimistic — the fill flips immediately and the store rolls it
 * back if SoundCloud refuses.
 */
export function LikeButton({
  track,
  size = "sm",
  className,
}: {
  track: Track;
  size?: "sm" | "md";
  className?: string;
}) {
  const liked = useLibraryStore((s) => s.likedIds.has(track.id));
  const toggleLike = useLibraryStore((s) => s.toggleLike);
  const [popping, setPopping] = useState(false);
  const wasLiked = useRef(liked);

  // Pop only on the transition into "liked", never on the way out or on mount.
  useEffect(() => {
    if (liked && !wasLiked.current) {
      setPopping(true);
      const timer = setTimeout(() => setPopping(false), 400);
      return () => clearTimeout(timer);
    }
    wasLiked.current = liked;
  }, [liked]);

  const icon = size === "md" ? "h-5 w-5" : "h-4 w-4";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        void toggleLike(track).catch(() => toast(t.track.likeFailed, "error"));
      }}
      aria-label={liked ? t.track.unlike : t.track.like}
      title={liked ? t.track.unlike : t.track.like}
      className={cn(
        "shrink-0 rounded-full p-1.5 transition-[color,transform] duration-[var(--motion-fast)] hover:scale-110 active:scale-90",
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Heart className={cn(icon, liked && "fill-current", popping && "heart-pop")} />
    </button>
  );
}
