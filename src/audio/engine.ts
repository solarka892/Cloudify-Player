/**
 * The audio engine: one `<audio>` element, optionally routed through a Web
 * Audio graph for the equaliser, balance, compression and the visualiser.
 *
 * The graph is built lazily and defensively. Playing a bare element is the
 * proven path; the moment anything in the Web Audio chain fails to construct
 * we fall back to it rather than leaving the user with silence.
 *
 * Cross-origin: SoundCloud's CDN answers with `access-control-allow-origin: *`
 * (verified), so `crossOrigin = "anonymous"` is safe and is what lets
 * `createMediaElementSource` produce sound instead of silence.
 *
 *   element ─▶ preamp ─▶ [10 biquads] ─▶ compressor ─▶ panner ─▶ analyser ─▶ out
 */

/** ISO centre frequencies, low to high. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export interface AudioConfig {
  eqEnabled: boolean;
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

let element: HTMLAudioElement | null = null;
let graph: Graph | null = null;
/** Set once a graph attempt has failed, so we stop retrying every track. */
let graphUnavailable = false;

/** The single audio element. Created on first use. */
export function el(): HTMLAudioElement {
  if (element) return element;
  const a = new Audio();
  a.preload = "auto";
  element = a;
  return a;
}

/**
 * Whether the next load needs CORS.
 *
 * `crossOrigin="anonymous"` is required for Web Audio to read the samples, but
 * it also makes the *media load itself* fail on any host that doesn't answer
 * with CORS headers. Requesting it unconditionally cost us playback on some
 * tracks, so it is only set when an effect actually needs the graph — and it
 * must be set before `src`, because it is only read at load time.
 */
export function prepareForSource(config: AudioConfig): void {
  const needsGraph =
    config.eqEnabled || config.compressor || config.mono || config.balance !== 0;
  const a = el();
  if (needsGraph) a.crossOrigin = "anonymous";
  else a.removeAttribute("crossorigin");
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
  const needsGraph =
    config.eqEnabled || config.compressor || config.mono || config.balance !== 0;
  if (!needsGraph && !graph) return; // nothing on, nothing built — stay simple

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
