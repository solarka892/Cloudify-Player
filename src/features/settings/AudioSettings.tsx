import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/stores/useSettingsStore";
import {
  EQ_BANDS,
  el,
  graphBlock,
  probeSource,
  report,
  testTone,
} from "@/audio/engine";
import { EQ_PRESETS, matchPreset } from "@/audio/presets";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Band gains clamp to ±12 dB — past that a 128 kbps source just distorts. */
const RANGE = 12;

/** Human label for a centre frequency. */
function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

/**
 * The sound section: a 10-band equaliser plus the rest of the signal chain.
 *
 * Sliders are vertical and read bottom-up, the way every hardware EQ does, so
 * the shape of the curve is legible at a glance.
 */
export function AudioSettings() {
  const audio = useSettingsStore((s) => s.audio);
  const fadeMs = useSettingsStore((s) => s.fadeMs);
  const radio = useSettingsStore((s) => s.radio);
  const setAudio = useSettingsStore((s) => s.setAudio);
  const resetAudio = useSettingsStore((s) => s.resetAudio);
  const setFadeMs = useSettingsStore((s) => s.setFadeMs);
  const setRadio = useSettingsStore((s) => s.setRadio);

  const activePreset = matchPreset(audio.bands);

  function setBand(index: number, value: number) {
    const bands = [...audio.bands];
    bands[index] = value;
    setAudio({ bands });
  }

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="group-title">{t.audio.title}</h2>
        <p className="text-xs text-muted-foreground">{t.audio.hint}</p>
      </div>

      <div className="panel flex flex-col divide-y divide-border overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <div className="text-sm font-medium">{t.audio.eq}</div>
            <div className="text-xs text-muted-foreground">{t.audio.eqHint}</div>
          </div>
          <Switch
            checked={audio.eqEnabled}
            onCheckedChange={(eqEnabled) => setAudio({ eqEnabled })}
          />
        </div>

        <div
          className={cn(
            "flex flex-col gap-4 px-4 py-4 transition-opacity duration-[var(--motion-fast)]",
            !audio.eqEnabled && "pointer-events-none opacity-40",
          )}
        >
          {/* Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {EQ_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setAudio({ bands: [...preset.bands] })}
                className={cn(
                  "rounded-[var(--radius-control)] border px-2.5 py-1 text-xs transition-colors duration-[var(--motion-fast)]",
                  activePreset === preset.id
                    ? "border-brand bg-accent text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {preset.name}
              </button>
            ))}
            <button
              onClick={resetAudio}
              title={t.audio.reset}
              aria-label={t.audio.reset}
              className="ml-auto rounded-[var(--radius-control)] p-1.5 text-muted-foreground transition-colors duration-[var(--motion-fast)] hover:bg-accent hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          {/* Bands */}
          <div className="flex items-end justify-between gap-1">
            {EQ_BANDS.map((hz, i) => {
              const value = audio.bands[i] ?? 0;
              return (
                <div key={hz} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {value > 0 ? `+${value}` : value}
                  </span>
                  {/* Vertical, the way every hardware EQ is: boost at the top.
                      Done with a rotation rather than `writing-mode` or
                      `appearance: slider-vertical` — WebKitGTK honours neither,
                      and left them lying on their side. The wrapper reserves the
                      rotated footprint, since a transform doesn't affect
                      layout. */}
                  <div className="flex h-24 w-6 items-center justify-center">
                    <input
                      type="range"
                      min={-RANGE}
                      max={RANGE}
                      step={1}
                      value={value}
                      onChange={(e) => setBand(i, Number(e.currentTarget.value))}
                      aria-label={`${bandLabel(hz)} Hz`}
                      className="h-1 w-24 -rotate-90 cursor-pointer accent-[var(--brand)]"
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {bandLabel(hz)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Preamp */}
          <label className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-sm">{t.audio.preamp}</span>
            <input
              type="range"
              min={-RANGE}
              max={RANGE}
              step={1}
              value={audio.preampDb}
              onChange={(e) => setAudio({ preampDb: Number(e.currentTarget.value) })}
              className="h-1 flex-1 cursor-pointer accent-[var(--brand)]"
            />
            <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {audio.preampDb > 0 ? `+${audio.preampDb}` : audio.preampDb} dB
            </span>
          </label>

          <p className="text-xs text-muted-foreground">{t.audio.warn}</p>

          {graphBlock() === "unsupported" && (
            <p className="text-xs text-destructive">{t.audio.graphUnsupported}</p>
          )}
        </div>

        <Row label={t.audio.visualizer} hint={t.audio.visualizerHint}>
          <Switch
            checked={audio.visualizer}
            onCheckedChange={(visualizer) => setAudio({ visualizer })}
          />
        </Row>

        <Row label={t.audio.compressor} hint={t.audio.compressorHint}>
          <Switch
            checked={audio.compressor}
            onCheckedChange={(compressor) => setAudio({ compressor })}
          />
        </Row>

        <Row label={t.audio.balance}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={audio.balance}
              onChange={(e) => setAudio({ balance: Number(e.currentTarget.value) })}
              className="h-1 w-40 cursor-pointer accent-[var(--brand)]"
            />
            <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {audio.balance === 0
                ? "C"
                : `${audio.balance < 0 ? "L" : "R"}${Math.round(Math.abs(audio.balance) * 100)}`}
            </span>
          </div>
        </Row>

        <Row label={t.audio.mono} hint={t.audio.monoHint}>
          <Switch
            checked={audio.mono}
            onCheckedChange={(mono) => setAudio({ mono })}
          />
        </Row>

        <Row label={t.audio.fade} hint={t.audio.fadeHint}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={4000}
              step={250}
              value={fadeMs}
              onChange={(e) => setFadeMs(Number(e.currentTarget.value))}
              className="h-1 w-40 cursor-pointer accent-[var(--brand)]"
            />
            <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {(fadeMs / 1000).toFixed(2)}s
            </span>
          </div>
        </Row>

        <Row label={t.audio.radio} hint={t.audio.radioHint}>
          <Switch checked={radio} onCheckedChange={setRadio} />
        </Row>

        <Diagnostics />
      </div>
    </section>
  );
}

/**
 * Reads the engine's state out loud.
 *
 * Silence has several indistinguishable causes — a muted element, a suspended
 * context, a source Web Audio may not read, an output device that produces
 * nothing at all — and none of them announce themselves. This shows which one
 * it is instead of leaving it to be guessed at.
 */
function Diagnostics() {
  const [lines, setLines] = useState<string[]>([]);

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div>
        <div className="text-sm font-medium">{t.audio.diagnostics}</div>
        <div className="text-xs text-muted-foreground">
          {t.audio.diagnosticsHint}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const r = report();
            setLines(Object.entries(r).map(([key, value]) => `${key}: ${value}`));
            // Then try the same source on a bare element: if that loads, the
            // fault is in how we drive playback, not in the source itself.
            const src = el().currentSrc || el().src;
            if (src) {
              void probeSource(src).then((verdict) =>
                setLines((prev) => [...prev, `probe: ${verdict}`]),
              );
            }
          }}
          className="rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
        >
          {t.audio.diagnosticsRun}
        </button>
        <button
          onClick={() => {
            void testTone().then((verdict) =>
              setLines((prev) => [...prev, `testTone: ${verdict}`]),
            );
          }}
          className="rounded-[var(--radius-control)] border border-border bg-secondary px-3 py-1.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-accent"
        >
          {t.audio.diagnosticsTone}
        </button>
      </div>

      {lines.length > 0 && (
        <pre className="overflow-x-auto rounded-[var(--radius-control)] border border-border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {lines.join("\n")}
        </pre>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-[calc(0.75rem*var(--density))]">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
