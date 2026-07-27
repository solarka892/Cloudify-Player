import { useEffect, useRef } from "react";
import { analyser } from "@/audio/engine";
import { usePlayerStore } from "@/stores/usePlayerStore";

/**
 * Spectrum / waveform drawn from the engine's analyser node.
 *
 * The analyser only exists once the Web Audio graph has been built, which
 * happens the first time any audio effect is switched on. Without it this
 * renders nothing rather than a dead canvas — the visualiser is decoration,
 * and it must never be a reason for playback to break.
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const styles = getComputedStyle(document.documentElement);
    const brand = styles.getPropertyValue("--brand").trim() || "#f60";
    const brand2 = styles.getPropertyValue("--brand-2").trim() || brand;

    function draw() {
      raf = requestAnimationFrame(draw);
      const node = analyser();
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
    return () => cancelAnimationFrame(raf);
  }, [mode, height, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className={className}
      aria-hidden
    />
  );
}
