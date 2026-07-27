/**
 * The audio engine: an `<audio>` element, optionally routed through a Web Audio
 * graph for the equaliser, balance, compression and the visualiser.
 *
 *   element ─▶ preamp ─▶ [10 biquads] ─▶ compressor ─▶ panner ─▶ analyser ─▶ out
 *
 * ## Why the element is disposable
 *
 * `createMediaElementSource(a)` routes `a` through the graph *permanently* —
 * there is no way to detach it. That makes a single long-lived element a trap,
 * because a routed element only produces sound when Web Audio is allowed to
 * read its samples:
 *
 *   - cross-origin source without CORS approval → the node emits silence, and
 *     the track appears to play with no audio at all;
 *   - `crossOrigin="anonymous"` against a host that answers no CORS headers →
 *     the media load itself aborts and the track never starts.
 *
 * So a graph built once for the visualiser would silence every later track from
 * a host that does not do CORS — including every downloaded file, which the
 * asset protocol serves from another origin. Instead the element is treated as
 * disposable: each load picks the routing mode it needs, and switching from
 * routed back to plain tears the graph down and starts from a fresh element.
 * Sound always wins over effects.
 */

/** ISO centre frequencies, low to high. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export interface AudioConfig {
  eqEnabled: boolean;
  /**
   * Draw the spectrum. Needs the Web Audio graph — and therefore CORS — so it
   * is a user choice, not something we switch on silently.
   */
  visualizer: boolean;
  /** Overall trim in dB, −12…+12. */
  preampDb: number;
  /** Per-band gain in dB, −12…+12; one entry per `EQ_BANDS`. */
  bands: number[];
  /** Dynamic-range compression — evens out loudness across tracks. */
  compressor: boolean;
  /** Stereo balance, −1 (left) … 1 (right). */
  balance: number;
  /** Collapse to mono; useful on a single speaker. */
  mono: boolean;
}

export const DEFAULT_AUDIO: AudioConfig = {
  eqEnabled: false,
  visualizer: false,
  preampDb: 0,
  bands: EQ_BANDS.map(() => 0),
  compressor: false,
  balance: 0,
  mono: false,
};

interface Graph {
  ctx: AudioContext;
  preamp: GainNode;
  filters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  compressorBypass: GainNode;
  compressorWet: GainNode;
  panner: StereoPannerNode;
  merger: ChannelMergerNode | null;
  analyser: AnalyserNode;
}

/** How the current element is wired. */
type Routing = "plain" | "graph";

let element: HTMLAudioElement | null = null;
let routing: Routing = "plain";
let graph: Graph | null = null;
/** Set once a graph attempt has failed, so we stop retrying every track. */
let graphUnavailable = false;

/** The current audio element. Created on first use. */
export function el(): HTMLAudioElement {
  if (!element) element = create();
  return element;
}

function create(from?: HTMLAudioElement | null): HTMLAudioElement {
  const a = new Audio();
  a.preload = "auto";
  if (from) {
    // Carry the user's settings across a swap; only the wiring changes.
    a.volume = from.volume;
    a.muted = from.muted;
    a.playbackRate = from.playbackRate;
  }
  return a;
}

/**
 * Whether Web Audio may read this source.
 *
 * Only `http(s)` hosts can opt in via CORS. Tauri's asset protocol serves
 * downloaded files from another origin with no such headers, so routing one
 * through the graph would silence it — those play on a plain element.
 */
function routable(src: string): boolean {
  return /^https?:/i.test(src);
}

/** Discard the graph so a plain element can be used again. */
function teardown(): void {
  if (!graph) return;
  try {
    graph.analyser.disconnect();
    void graph.ctx.close();
  } catch {
    // A context that refuses to close is still dead to us.
  }
  graph = null;
  // A fresh element deserves a fresh attempt at building a graph.
  graphUnavailable = false;
}

/** Everything that requires routing audio through the graph. */
export function needsGraph(config: AudioConfig): boolean {
  return (
    config.eqEnabled ||
    config.visualizer ||
    config.compressor ||
    config.mono ||
    config.balance !== 0
  );
}

/**
 * Wire up for the source about to be loaded, and hand back the element to
 * assign it to.
 *
 * Must be called before `src`: the CORS mode is only read at load time. The
 * returned element may be a brand new one, so callers must not hold on to an
 * element across this call.
 */
export function prepareForSource(
  config: AudioConfig,
  src: string,
): HTMLAudioElement {
  const want: Routing =
    needsGraph(config) && routable(src) ? "graph" : "plain";

  // Going back to plain means abandoning a permanently-routed element. The
  // outgoing one has to be silenced explicitly — dropping the reference does
  // not stop audio that is already playing through it.
  if (want === "plain" && (graph || routing === "graph")) {
    const outgoing = element;
    element = create(outgoing);
    outgoing?.pause();
    if (outgoing) outgoing.src = "";
    teardown();
  }
  routing = want;

  const a = el();
  if (want === "graph") a.crossOrigin = "anonymous";
  else a.removeAttribute("crossorigin");
  return a;
}

/** Whether the graph can be applied to whatever is loaded right now. */
function graphAllowedNow(): boolean {
  const src = element?.currentSrc || element?.src;
  // Nothing loaded yet: the next load decides, and it will re-apply.
  return !src || routable(src);
}

/**
 * Build the processing graph, once. Returns `null` if the browser refuses —
 * the caller then just uses the element directly.
 */
function ensureGraph(): Graph | null {
  if (graph) return graph;
  if (graphUnavailable) return null;

  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el());
    routing = "graph";

    const preamp = ctx.createGain();

    const filters = EQ_BANDS.map((freq, i) => {
      const filter = ctx.createBiquadFilter();
      // Shelves at the ends, bells in between — the standard 10-band shape.
      filter.type =
        i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
      filter.frequency.value = freq;
      filter.Q.value = 1.1;
      filter.gain.value = 0;
      return filter;
    });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;

    // Compression is switched by crossfading between a dry and a wet path,
    // which avoids rebuilding the graph every time the toggle moves.
    const compressorWet = ctx.createGain();
    const compressorBypass = ctx.createGain();
    compressorWet.gain.value = 0;
    compressorBypass.gain.value = 1;

    const panner = ctx.createStereoPanner();

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(preamp);
    let tail: AudioNode = preamp;
    for (const filter of filters) {
      tail.connect(filter);
      tail = filter;
    }

    tail.connect(compressor);
    compressor.connect(compressorWet);
    tail.connect(compressorBypass);

    compressorWet.connect(panner);
    compressorBypass.connect(panner);
    panner.connect(analyser);
    analyser.connect(ctx.destination);

    graph = {
      ctx,
      preamp,
      filters,
      compressor,
      compressorBypass,
      compressorWet,
      panner,
      merger: null,
      analyser,
    };
    return graph;
  } catch (e) {
    // Typically an autoplay-policy or CORS refusal. Play unprocessed audio
    // rather than nothing, and don't try again this session.
    console.warn("cloudify: audio graph unavailable, playing unprocessed", e);
    graphUnavailable = true;
    return null;
  }
}

/** Push a config onto the graph, building it if the user turned effects on. */
export function applyAudio(config: AudioConfig): void {
  if (!needsGraph(config) && !graph) return; // nothing on — stay on the simple path

  // Building a graph around a source Web Audio can't read would silence it.
  // The effects then take hold on the next load, which picks its own routing.
  if (!graph && !graphAllowedNow()) return;

  const g = ensureGraph();
  if (!g) return;

  const now = g.ctx.currentTime;
  const ramp = 0.05; // short ramp: instant to the ear, no zipper noise

  g.preamp.gain.setTargetAtTime(
    config.eqEnabled ? dbToGain(config.preampDb) : 1,
    now,
    ramp,
  );

  g.filters.forEach((filter, i) => {
    filter.gain.setTargetAtTime(
      config.eqEnabled ? (config.bands[i] ?? 0) : 0,
      now,
      ramp,
    );
  });

  g.compressorWet.gain.setTargetAtTime(config.compressor ? 1 : 0, now, ramp);
  g.compressorBypass.gain.setTargetAtTime(config.compressor ? 0 : 1, now, ramp);

  g.panner.pan.setTargetAtTime(config.balance, now, ramp);

  // Mono is a channel-count trick on the destination path: downmixing to one
  // channel and letting the output upmix it back gives an identical L/R feed.
  g.analyser.channelCount = config.mono ? 1 : 2;
  g.analyser.channelCountMode = config.mono ? "explicit" : "max";
}

/** Resume the context after a user gesture — required by autoplay policy. */
export function resume(): void {
  if (graph?.ctx.state === "suspended") void graph.ctx.resume();
}

/** The analyser, for the visualiser. `null` when no graph exists yet. */
export function analyser(): AnalyserNode | null {
  return graph?.analyser ?? null;
}

/** Ramp element volume over `ms`; resolves when done. Used for fades. */
export function fadeTo(target: number, ms: number): Promise<void> {
  const audio = el();
  if (ms <= 0) {
    audio.volume = clamp01(target);
    return Promise.resolve();
  }

  const from = audio.volume;
  const to = clamp01(target);
  const start = performance.now();

  return new Promise((resolve) => {
    function step(now: number) {
      const t = Math.min(1, (now - start) / ms);
      audio.volume = clamp01(from + (to - from) * t);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}
