import { useEffect, useRef, useState } from "react";
import { analyser, graphBlock } from "@/audio/engine";
import { THEME_EVENT } from "@/theme/particles";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Spectrum / waveform drawn from the engine's analyser node.
 *
 * The analyser only exists once the Web Audio graph has been built, and it is
 * not built for every track: a source whose host does not let Web Audio read it
 * plays on a plain element instead, because sound outranks decoration. When
 * that happens this says so — a canvas sitting flat looks like a bug.
 *
 * Whether the node exists is watched from inside the draw loop rather than
 * passed in, because it appears asynchronously, after a track is reloaded with
 * the graph attached, and nothing re-renders at that moment.
 */

export type VisualizerMode = "bars" | "wave";

export function Visualizer({
  mode = "bars",
  className,
  height = 64,
}: {
  mode?: VisualizerMode;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [available, setAvailable] = useState(() => analyser() !== null);
  // The loop runs outside React, so it needs its own view of the last value it
  // reported; setting state on every frame would be absurd.
  const reported = useRef(available);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    // A canvas cannot inherit a custom property, so the two accent colours are
    // read out of the document — and re-read when the theme changes. Reading them
    // once at mount was wrong in a way that only showed up with an achromatic
    // palette: switch to Obsidian while a track is playing and the interface goes
    // monochrome around a visualizer still drawing in orange. `getComputedStyle`
    // is far too expensive to call per frame, so it is called on the event the
    // theme engine already fires for exactly this.
    let brand = "";
    let brand2 = "";
    function readAccent() {
      const styles = getComputedStyle(document.documentElement);
      brand = styles.getPropertyValue("--brand").trim() || "#f60";
      brand2 = styles.getPropertyValue("--brand-2").trim() || brand;
    }
    readAccent();
    window.addEventListener(THEME_EVENT, readAccent);

    function draw() {
      raf = requestAnimationFrame(draw);
      const node = analyser();
      if (reported.current !== (node !== null)) {
        reported.current = node !== null;
        setAvailable(node !== null);
      }
      if (!canvas || !ctx) return;

      // Match the backing store to the CSS size, accounting for HiDPI.
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
      }
      ctx.clearRect(0, 0, width, height);
      if (!node) return;

      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, brand);
      gradient.addColorStop(1, brand2);

      if (mode === "wave") {
        const data = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(data);
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = gradient;
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * width;
          const y = ((data[i]! - 128) / 128) * (height / 2) + height / 2;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }

      const bins = new Uint8Array(node.frequencyBinCount);
      node.getByteFrequencyData(bins);
      const bars = 56;
      const gap = 2;
      const barWidth = Math.max(1, width / bars - gap);
      ctx.fillStyle = gradient;
      for (let i = 0; i < bars; i++) {
        // Logarithmic bucketing: linear bins put almost everything on the left.
        const from = Math.floor(Math.pow(i / bars, 2) * bins.length);
        const to = Math.max(
          from + 1,
          Math.floor(Math.pow((i + 1) / bars, 2) * bins.length),
        );
        let sum = 0;
        for (let j = from; j < to; j++) sum += bins[j]!;
        const level = sum / (to - from) / 255;
        const barHeight = Math.max(2, level * height);
        ctx.fillRect(
          i * (barWidth + gap),
          height - barHeight,
          barWidth,
          barHeight,
        );
      }
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener(THEME_EVENT, readAccent);
    };
  }, [mode, height, isPlaying]);

  // The canvas stays mounted either way: the draw loop lives off it, and it is
  // what notices the analyser arriving.
  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ height }}
        className={cn(className, !available && "hidden")}
        aria-hidden
      />
      {!available && (
        <p className="max-w-md text-balance text-center text-xs text-muted-foreground">
          {graphBlock() === "unsupported"
            ? t.audio.graphUnsupported
            : t.player.visualizerBlocked}
        </p>
      )}
    </>
  );
}
