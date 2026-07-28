/**
 * Ambient falling particles: petals, snow, rain and the rest.
 *
 * One simulation, parameterised per effect, so adding a new one is a table
 * entry rather than another animation loop. Everything is drawn with canvas
 * primitives — no images to ship, and the colours come from the theme, so a
 * palette change carries the weather with it.
 *
 * ## Cost
 *
 * This runs over the whole window on a software-composited desktop, which is
 * the same budget the scrolling already struggles with. So: the count is small
 * by design, the frame rate is capped well under the display's, nothing is
 * drawn when the window is hidden, and it is off unless asked for. A pretty
 * effect that makes the app feel slow is not a feature.
 */

/** Fired on `window` when theme colours change; see `theme/apply.ts`. */
export const THEME_EVENT = "cloudify:theme";

export type EffectId = "sakura" | "snow" | "rain" | "leaves" | "fireflies";

export const EFFECT_IDS: EffectId[] = [
  "sakura",
  "snow",
  "rain",
  "leaves",
  "fireflies",
];

/** Frames per second. Ambient motion reads fine well below refresh rate. */
const FPS = 30;

interface Spec {
  /** Particles per million square pixels, before the intensity multiplier. */
  density: number;
  /** Radius (or length, for rain) in px. */
  size: [min: number, max: number];
  /** Downward speed in px/second. */
  fall: [min: number, max: number];
  /** Horizontal sway amplitude in px; 0 falls straight. */
  sway: number;
  /** Whether particles tumble as they fall. */
  spin: boolean;
  /** How the particle is painted. */
  shape: "petal" | "flake" | "streak" | "leaf" | "glow";
  /** Fill, as CSS. `brand` resolves against the theme at draw time. */
  colour: string | "brand";
  opacity: [min: number, max: number];
}

const SPECS: Record<EffectId, Spec> = {
  sakura: {
    density: 26,
    size: [4, 9],
    fall: [22, 55],
    sway: 34,
    spin: true,
    shape: "petal",
    colour: "#f9c8d9",
    opacity: [0.45, 0.9],
  },
  snow: {
    density: 42,
    size: [1.4, 3.6],
    fall: [18, 48],
    sway: 18,
    spin: false,
    shape: "flake",
    colour: "#ffffff",
    opacity: [0.35, 0.85],
  },
  rain: {
    density: 46,
    size: [9, 20],
    fall: [420, 700],
    sway: 0,
    spin: false,
    shape: "streak",
    colour: "#cfe4ff",
    opacity: [0.18, 0.42],
  },
  leaves: {
    density: 18,
    size: [5, 11],
    fall: [26, 60],
    sway: 46,
    spin: true,
    shape: "leaf",
    colour: "#e08a3c",
    opacity: [0.4, 0.85],
  },
  fireflies: {
    density: 14,
    size: [1.6, 3.4],
    fall: [-14, 14],
    sway: 30,
    spin: false,
    shape: "glow",
    colour: "brand",
    opacity: [0.25, 0.9],
  },
};

interface Particle {
  x: number;
  y: number;
  size: number;
  fall: number;
  /** Phase of this particle's sway, so they don't move in lockstep. */
  phase: number;
  swaySpeed: number;
  angle: number;
  spin: number;
  opacity: number;
  /** Fireflies breathe; others hold their opacity. */
  pulse: number;
}

function between([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function spawn(spec: Spec, width: number, height: number, atTop: boolean): Particle {
  return {
    x: Math.random() * width,
    // New particles start just above the frame; the first fill scatters them
    // through it instead, or everything arrives as one wave.
    y: atTop ? -between(spec.size) * 2 : Math.random() * height,
    size: between(spec.size),
    fall: between(spec.fall),
    phase: Math.random() * Math.PI * 2,
    swaySpeed: 0.4 + Math.random() * 0.8,
    angle: Math.random() * Math.PI * 2,
    spin: spec.spin ? (Math.random() - 0.5) * 1.6 : 0,
    opacity: between(spec.opacity),
    pulse: 0.6 + Math.random() * 1.4,
  };
}

/**
 * Start drawing `effect` on `canvas`. Returns a stop function.
 *
 * `intensity` scales the particle count, 0.25–2.
 */
export function runEffect(
  canvas: HTMLCanvasElement,
  effect: EffectId,
  intensity: number,
): () => void {
  const ctx = canvas.getContext("2d");
  const spec = SPECS[effect];
  // An id from an older stored setting, or none at all: draw nothing rather
  // than throwing. This is decoration, and decoration must never be fatal.
  if (!ctx || !spec) return () => {};

  const particles: Particle[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let last = performance.now();
  let sinceDraw = 0;
  let stopped = false;

  // Resolved once per resize rather than per frame: reading a custom property
  // forces style resolution, which is not something to do 30 times a second.
  let colour = spec.colour;
  function resolveColour() {
    colour =
      spec.colour === "brand"
        ? getComputedStyle(document.documentElement)
            .getPropertyValue("--brand")
            .trim() || "#ffb37a"
        : spec.colour;
  }

  function resize() {
    const next = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (next === width && nextHeight === height) return;
    width = next;
    height = nextHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    resolveColour();

    const target = Math.round(
      (spec.density * intensity * width * height) / 1_000_000,
    );
    // Grow or shrink to the new target, keeping the particles already in flight.
    while (particles.length > target) particles.pop();
    while (particles.length < target) {
      particles.push(spawn(spec, width, height, particles.length > 0));
    }
  }

  function draw(particle: Particle, x: number) {
    ctx!.globalAlpha = particle.opacity;
    ctx!.fillStyle = colour;

    switch (spec.shape) {
      case "streak":
        ctx!.strokeStyle = colour;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(x, particle.y);
        ctx!.lineTo(x, particle.y + particle.size);
        ctx!.stroke();
        break;

      case "petal":
      case "leaf": {
        ctx!.save();
        ctx!.translate(x, particle.y);
        ctx!.rotate(particle.angle);
        ctx!.beginPath();
        // A leaf is a narrower petal with a crease down the middle.
        const w = spec.shape === "leaf" ? particle.size * 0.5 : particle.size * 0.7;
        ctx!.ellipse(0, 0, particle.size, w, 0, 0, Math.PI * 2);
        ctx!.fill();
        if (spec.shape === "leaf") {
          ctx!.strokeStyle = "rgba(0,0,0,0.18)";
          ctx!.lineWidth = 0.6;
          ctx!.beginPath();
          ctx!.moveTo(-particle.size, 0);
          ctx!.lineTo(particle.size, 0);
          ctx!.stroke();
        }
        ctx!.restore();
        break;
      }

      case "glow": {
        const glow = ctx!.createRadialGradient(
          x,
          particle.y,
          0,
          x,
          particle.y,
          particle.size * 4,
        );
        glow.addColorStop(0, colour);
        glow.addColorStop(1, "transparent");
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(x, particle.y, particle.size * 4, 0, Math.PI * 2);
        ctx!.fill();
        break;
      }

      default:
        ctx!.beginPath();
        ctx!.arc(x, particle.y, particle.size, 0, Math.PI * 2);
        ctx!.fill();
    }
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); // clamp after a stall
    last = now;

    sinceDraw += dt;
    if (sinceDraw < 1 / FPS) return;
    const step = sinceDraw;
    sinceDraw = 0;

    // Nobody looking, or nothing to draw into. The size is maintained by a
    // ResizeObserver rather than measured here: reading `clientWidth` forces a
    // layout, and doing that every frame is the sort of cost this whole effect
    // is meant to stay under.
    if (document.hidden || width === 0 || height === 0) return;

    ctx!.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.y += particle.fall * step;
      particle.phase += particle.swaySpeed * step;
      particle.angle += particle.spin * step;
      if (spec.shape === "glow") {
        // Breathe between a third and full strength.
        particle.opacity =
          spec.opacity[0] +
          (spec.opacity[1] - spec.opacity[0]) *
            (0.5 + 0.5 * Math.sin(particle.phase * particle.pulse));
      }

      draw(particle, particle.x + Math.sin(particle.phase) * spec.sway);

      // Off the bottom (or the top, for anything drifting upwards): recycle.
      const margin = particle.size * 5;
      if (particle.y > height + margin) {
        Object.assign(particle, spawn(spec, width, height, true));
      } else if (particle.y < -margin && particle.fall < 0) {
        particle.y = height + margin;
        particle.x = Math.random() * width;
      }
    }

    ctx!.globalAlpha = 1;
  }

  // The accent can change under us (a new palette, or one sampled from the
  // artwork), and fireflies are drawn in it.
  const onTheme = () => resolveColour();
  window.addEventListener(THEME_EVENT, onTheme);

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  return () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener(THEME_EVENT, onTheme);
    ctx.clearRect(0, 0, width, height);
  };
}
