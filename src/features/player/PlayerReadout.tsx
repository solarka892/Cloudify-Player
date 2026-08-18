import { useEffect, useState } from "react";
import { clock } from "@/hooks/useHotkeys";
import { t } from "@/i18n";
import { trimFor } from "@/audio/loudness";
import { loudnessGet } from "@/lib/store";
import { markHere } from "@/hooks/useHotkeys";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

/**
 * What the player says instead of a seek bar.
 *
 * Only one skin shows this — the one whose progress runs along the top edge of
 * the window, where a second bar down here would be the app disagreeing with
 * itself about where time lives. It is hidden by default and displayed by that
 * skin's stylesheet, the same way `.nav-marker` is; nothing here asks which
 * skin is on.
 *
 * Three readings, in the instrument face:
 *
 *   - a button that marks the moment, because the whole argument for marks is
 *     that they cost nothing to make;
 *   - what the levelling did to this track, in dB, or nothing at all when it
 *     did nothing. "громкость −4.2 dB" is a claim, so it is only made about a
 *     track that was actually measured;
 *   - elapsed over total.
 */
export function PlayerReadout() {
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const current = usePlayerStore((s) => s.current);
  const levelling = useSettingsStore((s) => s.audio.levelling);
  const [trim, setTrim] = useState<number | null>(null);

  useEffect(() => {
    if (!current || !levelling) {
      setTrim(null);
      return;
    }
    let live = true;
    void loudnessGet(current.id)
      .then((level) => live && setTrim(trimFor(level)))
      .catch(() => live && setTrim(null));
    return () => {
      live = false;
    };
  }, [current, levelling]);

  if (!current) return null;

  return (
    <div className="player-readout shrink-0 items-center gap-3">
      <button
        onClick={() => void markHere()}
        className="pill-readout uppercase"
        title={t.marks.add}
      >
        {t.marks.title}
      </button>

      {/* Only when there is something to say. A trim under a tenth of a dB is
          not a fact anyone needs on screen. */}
      {trim !== null && Math.abs(trim) >= 0.1 && (
        <span className="pill-readout">
          {t.settings.loudness} {trim > 0 ? "+" : "−"}
          {Math.abs(trim).toFixed(1)} dB
        </span>
      )}

      <span className="readout whitespace-nowrap text-xs text-muted-foreground">
        {clock(position * 1000)} / {clock(duration * 1000)}
      </span>
    </div>
  );
}
