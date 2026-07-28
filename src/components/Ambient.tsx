import { useEffect, useRef } from "react";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { EFFECT_IDS, runEffect, type EffectId } from "@/theme/particles";
import { cn } from "@/lib/utils";

/**
 * The weather layer.
 *
 * Mounted anywhere an effect should fall: over the app's backdrop, and behind
 * the lyrics, where the same snow reads as depth rather than decoration. It
 * renders nothing at all when the setting is off, so the cost of not using it
 * is zero — not a canvas quietly running an empty loop.
 *
 * Always `pointer-events-none`: this is scenery, and it must never eat a click
 * meant for what is underneath.
 */
export function Ambient({ className }: { className?: string }) {
  const effect = useSettingsStore((s) => s.backdrop.effect);
  const intensity = useSettingsStore((s) => s.backdrop.effectIntensity);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Anything that is not a known effect counts as off — including the
  // `undefined` a settings file written before this feature existed produces.
  const known = EFFECT_IDS.includes(effect as EffectId);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !known) return;
    return runEffect(canvas, effect as EffectId, intensity || 1);
  }, [known, effect, intensity]);

  if (!known) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
    />
  );
}
