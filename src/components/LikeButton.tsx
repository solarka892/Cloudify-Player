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
  Icon = Heart,
}: {
  track: Track;
  size?: "sm" | "md";
  className?: string;
  /**
   * The glyph, for a look that draws its own. Must be a closed outline: the
   * liked state is this same shape with `fill-current` on it, not a second
   * drawing.
   */
  Icon?: React.ComponentType<{ className?: string }>;
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
        void toggleLike(track).catch((error) =>
          // The reason, not just "it failed". A like can be refused for a dead
          // session, a rotated key or a rate limit, and those want three
          // different responses from the user — see `sc_api::actions`.
          toast(`${t.track.likeFailed}: ${error}`, "error"),
        );
      }}
      aria-label={liked ? t.track.unlike : t.track.like}
      title={liked ? t.track.unlike : t.track.like}
      // State, published for a skin to style. The colour below is this
      // component's own answer; a look that marks "on" some other way — Apple
      // mode puts a disc behind it — needs a hook that is not a colour class.
      data-on={liked ? "true" : undefined}
      className={cn(
        // Tight to the glyph. Every other icon button in a track row can afford
        // a generous target; this one cannot, because it is the only one whose
        // misfire changes the account — a stray tap beside the artist's name
        // silently liked the track. `p-1` is a 24px target around a 16px heart,
        // which is small on purpose.
        "shrink-0 rounded-[var(--radius-round)] p-1 transition-[color,transform] duration-[var(--motion-fast)] hover:scale-110 active:scale-90",
        liked ? "text-brand" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Icon className={cn(icon, liked && "fill-current", popping && "heart-pop")} />
    </button>
  );
}
