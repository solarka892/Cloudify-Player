/**
 * The audio engine: an `<audio>` element, optionally routed through a Web Audio
 * graph for the equaliser, balance, compression and the visualiser.
 *
 *   element ─▶ preamp ─▶ [10 biquads] ─▶ compressor ─▶ panner ─▶ analyser ─▶ out
 *
 * ## Three ways to play, in order of preference
 *
 *   - `plain`  — the element on its own. No effects, works everywhere.
 *   - `graph`  — the element routed into the chain above. Streams, cheap.
 *   - `buffer` — the file fetched, decoded and played from memory into the same
 *                chain (`audio/buffered.ts`), with no element involved.
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
 * disposable: each load picks the routing mode it needs, and switching modes
 * tears the graph down and starts from a fresh element. Sound always wins over
 * effects.
 *
 * ## Why `buffer` exists at all
 *
 * On WebKitGTK the element bridge is not merely restricted, it is broken: the
 * graph receives silence from a perfectly healthy element and nothing anywhere
 * reports a fault. That was measured (`graphIsAudible`) and answered by turning
 * the effects off, which left every Linux build with an equaliser and a
 * visualiser that did nothing. `buffer` needs no bridge, so it works there — at
 * the price of downloading and decoding the whole track before it starts, which
 * is why it is the fallback and not the default.
 */

import { BufferedAudio } from "@/audio/buffered";

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
  /**
   * Even out the level between tracks.
   *
   * SoundCloud masters vary wildly — a bedroom lo-fi upload and a mastered
   * release differ by 10 dB or more, and the next track after a quiet one takes
   * your head off. The engine measures what it plays (`audio/loudness.ts`),
   * remembers it per track, and trims the *next* play of that track with the
   * preamp. Nothing is guessed for a track never heard: the first play is
   * untouched, which is why this is honest rather than clever.
   */
  levelling: boolean;
  /**
   * Night mode: the same compressor, set gently, plus a small trim.
   *
   * Not a second compressor and not a preset in `presets.ts` — those are EQ
   * curves. This is one switch meaning "keep the quiet parts audible without the
   * loud parts waking anyone", which is a different intent from `compressor`
   * (which exists to tame a single wild master) even though it reaches the same
   * node.
   */
  night: boolean;
}

export const DEFAULT_AUDIO: AudioConfig = {
  eqEnabled: false,
  visualizer: false,
  preampDb: 0,
  bands: EQ_BANDS.map(() => 0),
  compressor: false,
  balance: 0,
  mono: false,
  levelling: false,
  night: false,
};

interface Graph {
  ctx: AudioContext;
  /** The head of the chain: whatever plays connects here. */
  preamp: GainNode;
  filters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  compressorBypass: GainNode;
  compressorWet: GainNode;
  panner: StereoPannerNode;
  merger: ChannelMergerNode | null;
  analyser: AnalyserNode;
}

/** How the audio currently reaches the speakers. */
type Routing = "plain" | "graph" | "buffer";

let element: HTMLAudioElement | null = null;
/**
 * The `buffer` path is built but **not connected**, and this is the socket it
 * would connect to.
 *
 * Nothing assigns this, `routing` never becomes `"buffer"`, and `BufferedAudio`
 * is never constructed anywhere in the app — so the fallback described at the
 * top of this file does not exist at runtime, and wherever the media-element
 * bridge is silent the equaliser and visualiser are simply off for good. Two
 * further leftovers (a `bufferUnavailable` flag and a `setEngineReloader` hook)
 * stood here unread and were removed to keep the build honest; `buffered.ts`
 * itself is untouched, and task 57 records what has to be re-attached.
 */
// eslint-disable-next-line prefer-const -- assigned once the buffer path is wired
let buffered: BufferedAudio | null = null;
let routing: Routing = "plain";
/** How the current source reaches the element. Set by `prepareForSource`. */
let sourceKind: "file" | "hls" = "file";
let graph: Graph | null = null;
/** Set once a graph attempt has failed, so we stop retrying every track. */
let graphUnavailable = false;
/**
 * Where the verdict on the media-element bridge is kept between sessions.
 *
 * It is a fact about the machine, not a preference, and re-learning it costs the
 * user three seconds of silence and a restarted track on the first effects-on
 * play of every session. Written once, read at startup.
 */
const SILENT_KEY = "cloudify.audio.elementGraphSilent";

/**
 * Set once a graph has been *built* and observed to output silence.
 *
 * Unlike `graphUnavailable` this survives a teardown, because it is a fact
 * about the platform rather than about one attempt: where the media-element
 * bridge does not work, it will not work on the next element either.
 */
let graphSilent = ((): boolean => {
  try {
    return localStorage.getItem(SILENT_KEY) === "1";
  } catch {
    return false;
  }
})();

/**
 * The thing playing audio right now.
 *
 * In `buffer` routing this is not an element at all — see `audio/buffered.ts`,
 * which presents the same surface on purpose so nothing above here has to care.
 */
export function el(): HTMLAudioElement {
  if (buffered) return buffered as unknown as HTMLAudioElement;
  if (!element) element = create();
  return element;
}

/** Which of the three paths is in use, for the parts that must know. */
export function routingMode(): Routing {
  return routing;
}

/**
 * Set the playback rate, and decide whether it may take the pitch with it.
 *
 * Browsers time-stretch by default, holding the pitch steady while the tempo
 * moves — right for a podcast, wrong for music, where the pitch shift *is* what
 * the control is reached for. So speeding up is left to shift, tape-style.
 *
 * Slowing down is not. WebKitGTK's pipeline drops the pitch-preserving filter
 * along with `preservesPitch`, and below 1× it then produces silence rather
 * than slow audio — so under 1× the filter stays in and the pitch holds.
 * Silence is not a trade worth making for an effect.
 */
export function applyRate(a: HTMLAudioElement, rate: number): void {
  const mayShift = rate >= 1;
  a.preservesPitch = !mayShift;
  // WebKit shipped the prefixed name years before the standard one and still
  // honours only that in some builds; setting both costs nothing.
  const prefixed = a as HTMLAudioElement & { webkitPreservesPitch?: boolean };
  prefixed.webkitPreservesPitch = !mayShift;
  a.playbackRate = rate;
}

function create(from?: HTMLAudioElement | null): HTMLAudioElement {
  const a = new Audio();
  a.preload = "auto";
  if (from) {
    // Carry the user's settings across a swap; only the wiring changes.
    a.volume = from.volume;
    a.muted = from.muted;
  }
  applyRate(a, from?.playbackRate ?? 1);
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

/**
 * Origins whose media Web Audio is allowed to read. Probed once each.
 *
 * The scheme alone is not enough to decide this, and getting it wrong is
 * expensive: WebKit does not fail a media load that lacks CORS approval, it
 * plays it and marks it unreadable, so a routed element produces *silence* —
 * the track appears to play perfectly with no sound at all. SoundCloud hands
 * out signed URLs across more than one CDN host and they do not all answer the
 * same way, which is why only some tracks went quiet.
 *
 * So it is asked directly: a cross-origin `fetch` that comes back at all has
 * passed the same CORS check the media element applies, and one that throws has
 * not. Cached per origin, because the policy is the host's, not the URL's.
 */
const corsReadable = new Map<string, boolean>();

function originOf(src: string): string | null {
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}

/** The cached verdict for a source, or `undefined` if never probed. */
function knownReadable(src: string): boolean | undefined {
  const origin = originOf(src);
  return origin ? corsReadable.get(origin) : false;
}

async function probeCors(src: string): Promise<boolean> {
  const origin = originOf(src);
  if (!origin) return false;

  const cached = corsReadable.get(origin);
  if (cached !== undefined) return cached;

  // `HEAD`, with no added headers: a safelisted method needs no preflight (one
  // the CDN might not answer, which would read as "no CORS" and drop effects
  // for nothing) and transfers no body, so a signed single-use URL is not spent
  // on the way to an answer.
  //
  // The status does not matter — only whether this resolves. A failed CORS
  // check *rejects*, so any response at all, even a 405, proves the host lets
  // us read what it sends.
  let ok = false;
  try {
    await fetch(src, { method: "HEAD", mode: "cors" });
    ok = true;
  } catch {
    ok = false;
  }
  corsReadable.set(origin, ok);
  return ok;
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
    config.night ||
    config.mono ||
    config.balance !== 0
    // `levelling` is deliberately absent: measuring needs the analyser, but the
    // trim it produces is applied to `<audio>.volume`, which works on the plain
    // path too. A track already measured is levelled with no graph at all — so
    // switching it on never costs a reload and never risks the silent-bridge
    // failure the graph can hit.
  );
}

/** How the source about to be loaded reaches the element. */
export type SourceKind = "file" | "hls";

/**
 * Wire up for the source about to be loaded, and hand back the element to
 * assign it to.
 *
 * Must be called before `src`: the CORS mode is only read at load time. The
 * returned element may be a brand new one, so callers must not hold on to an
 * element across this call.
 */
export async function prepareForSource(
  config: AudioConfig,
  src: string,
  kind: SourceKind = "file",
): Promise<HTMLAudioElement> {
  // Effects off is the common case and needs no graph, so nothing is probed.
  //
  // HLS skips the probe entirely and is always routable: Media Source
  // Extensions hand the element a same-origin blob rather than the CDN URL, so
  // there is no cross-origin read for Web Audio to be refused — the CORS
  // question the progressive path has to ask does not arise.
  const want: Routing =
    needsGraph(config) &&
    !graphSilent &&
    (kind === "hls" || (routable(src) && (await probeCors(src))))
      ? "graph"
      : "plain";
  sourceKind = kind;

  // Going back to plain means abandoning a permanently-routed element. The
  // outgoing one has to be silenced explicitly — dropping the reference does
  // not stop audio that is already playing through it.
  if (want === "plain" && (graph || routing === "graph")) {
    const outgoing = element;
    element = create(outgoing);
    if (outgoing) {
      outgoing.pause();
      // Remove the attribute rather than assigning `""`: an empty src resolves
      // against the document URL and the element then tries to load *that*,
      // failing with an error event for a source nobody asked for.
      outgoing.removeAttribute("src");
      outgoing.load();
    }
    teardown();
  }
  routing = want;

  const a = el();
  // Never on the HLS path: the element is fed by MSE, and a `crossOrigin`
  // attribute there applies to a URL the element is not going to fetch — while
  // on some builds it makes the blob itself count as tainted.
  if (want === "graph" && kind !== "hls") a.crossOrigin = "anonymous";
  else a.removeAttribute("crossorigin");
  return a;
}

/** Whether the graph can be applied to whatever is loaded right now. */
function graphAllowedNow(): boolean {
  const src = element?.currentSrc || element?.src;
  // Nothing loaded yet: the next load decides, and it will re-apply.
  if (!src) return true;
  // An MSE blob is same-origin by construction — there is nothing to probe and
  // nothing that can refuse us.
  if (sourceKind === "hls") return true;
  // Only a source already proven readable. An unprobed one is not worth
  // guessing at: turning effects on reloads the source anyway, and that path
  // probes properly. Guessing wrong here silences the track.
  return routable(src) && knownReadable(src) === true;
}

/**
 * Build the processing graph, once. Returns `null` if the browser refuses —
 * the caller then just uses the element directly.
 */
function ensureGraph(): Graph | null {
  if (graph) return graph;
  if (graphUnavailable || graphSilent) return null;

  try {
    const ctx = new AudioContext();
    // A context starts suspended unless it was created inside a user gesture,
    // and a suspended context pulls no samples from the graph — the element
    // plays, the clock runs, and absolutely nothing comes out. This is built
    // after `play()` has already been awaited, so the gesture that started
    // playback is long over by now and the context needs waking explicitly.
    if (ctx.state === "suspended") void ctx.resume();
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

  // Night mode reaches the same node with gentler numbers: it starts squeezing
  // much earlier and much more softly, so nothing ever jumps, at the cost of a
  // flatter record. With both on, night's settings win — someone who asked for
  // quiet asked for quiet.
  const squashing = config.compressor || config.night;
  if (config.night) {
    g.compressor.threshold.value = -34;
    g.compressor.knee.value = 30;
    g.compressor.ratio.value = 6;
    g.compressor.attack.value = 0.01;
    g.compressor.release.value = 0.4;
  } else {
    g.compressor.threshold.value = -18;
    g.compressor.knee.value = 24;
    g.compressor.ratio.value = 3;
    g.compressor.attack.value = 0.005;
    g.compressor.release.value = 0.25;
  }
  g.compressorWet.gain.setTargetAtTime(squashing ? 1 : 0, now, ramp);
  g.compressorBypass.gain.setTargetAtTime(squashing ? 0 : 1, now, ramp);

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

/** Why effects are not being applied, for the UI to explain. */
export type GraphBlock = "none" | "source" | "unsupported";

export function graphBlock(): GraphBlock {
  if (graphSilent || graphUnavailable) return "unsupported";
  // Routed and running: nothing is blocked.
  if (routing === "graph") return "none";
  if (sourceKind === "hls") return "none";
  const src = element?.currentSrc || element?.src;
  if (src && knownReadable(src) === false) return "source";
  return "none";
}

/**
 * Watch the graph to confirm it is actually passing audio through.
 *
 * `createMediaElementSource` routes an element permanently, and there is no
 * capability flag for whether that routing *works*: every node constructs
 * happily, the element reports playing, the clock advances, and on some builds
 * — WebKitGTK's GStreamer backend is the one that matters here — nothing
 * reaches the destination. Silence with no error anywhere is the one failure
 * that cannot be reasoned about from the outside, so it gets measured instead.
 *
 * Resolves false only if every sample stayed at the midpoint while the element
 * genuinely progressed. A track opening with true digital silence would read
 * the same, which is why the window is seconds rather than milliseconds, and
 * why the cost of being wrong is only the loss of effects.
 */
export async function graphIsAudible(ms = 3000): Promise<boolean> {
  const g = graph;
  const a = element;
  if (!g || !a) return true; // nothing routed — not our problem to report

  const startedAt = a.currentTime;
  const data = new Uint8Array(g.analyser.fftSize);
  const deadline = Date.now() + ms;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    if (graph !== g || element !== a) return true; // superseded; let it be
    if (a.paused) continue; // a pause is not evidence of anything

    g.analyser.getByteTimeDomainData(data);
    // 128 is silence; anything else means samples are flowing.
    for (const sample of data) {
      if (sample > 129 || sample < 127) return true;
    }
  }

  // Silent throughout — but only conclusive if the element was really playing.
  return a.paused || a.currentTime - startedAt < 1;
}

/**
 * Give up on the graph for this session.
 *
 * Leaves the engine on the plain path, where sound is known to work. The caller
 * still has to reload the current source: the element in hand is routed for
 * good, and only a fresh one can be heard again.
 */
export function abandonGraph(): void {
  // Set outside `teardown`, which deliberately clears its own retry flag —
  // this verdict is about the platform and outlives any one element.
  graphSilent = true;
  teardown();
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

/* ── diagnostics ──────────────────────────────────────────────────────────
   Playback failures in a WebView are near-invisible: the element reports its
   state through numeric enums, the Web Audio graph can silence audio without
   any error, and an output device that does not work at all looks identical to
   a track that will not load. These read that state out loud so a problem can
   be identified instead of guessed at. */

export interface EngineReport {
  /** How the element is wired right now. */
  routing: Routing;
  hasGraph: boolean;
  /** A suspended context produces silence even with a perfect graph. */
  contextState: string | null;
  crossOrigin: string | null;
  /** Scheme only — the signed URL is not something to put on screen. */
  sourceKind: "none" | "asset" | "https" | "other";
  /** 0 nothing … 4 enough data to play through. */
  readyState: number;
  /** 0 empty, 1 idle, 2 loading, 3 no source. */
  networkState: number;
  paused: boolean;
  volume: number;
  muted: boolean;
  currentTime: number;
  duration: number;
  /** MediaError code, 1 aborted, 2 network, 3 decode, 4 unsupported source. */
  errorCode: number | null;
  errorMessage: string | null;
}

export function report(): EngineReport {
  const a = el();
  const src = a.currentSrc || a.src;
  return {
    routing,
    hasGraph: graph !== null,
    contextState: graph?.ctx.state ?? null,
    crossOrigin: a.crossOrigin,
    sourceKind: !src
      ? "none"
      : src.startsWith("asset:") || src.includes("asset.localhost")
        ? "asset"
        : /^https:/i.test(src)
          ? "https"
          : "other",
    readyState: a.readyState,
    networkState: a.networkState,
    paused: a.paused,
    volume: a.volume,
    muted: a.muted,
    currentTime: a.currentTime,
    duration: Number.isFinite(a.duration) ? a.duration : 0,
    errorCode: a.error?.code ?? null,
    errorMessage: a.error?.message || null,
  };
}

/**
 * Play a short tone through Web Audio.
 *
 * Separates "this track will not load" from "this machine produces no sound at
 * all", which no amount of staring at the player can distinguish.
 */
export async function testTone(ms = 400): Promise<string> {
  try {
    const ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 440;
    // Ramp in and out; a hard start on a sine is an audible click.
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);

    await new Promise((r) => setTimeout(r, ms + 100));
    const state = ctx.state;
    await ctx.close();
    return `AudioContext ${state}, sampleRate ${ctx.sampleRate}`;
  } catch (e) {
    return `failed: ${e}`;
  }
}

/**
 * Try to load a URL on a throwaway, unrouted element.
 *
 * This is the simplest possible playback path — no graph, no CORS, no store —
 * so if it works the fault is in how we drive the element, and if it does not
 * the fault is in the source itself.
 */
export function probeSource(src: string, ms = 6000): Promise<string> {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = "auto";
    a.muted = true; // a probe must not make noise
    let settled = false;

    function done(verdict: string) {
      if (settled) return;
      settled = true;
      a.removeAttribute("src");
      resolve(verdict);
    }

    const timer = setTimeout(
      () => done(`timed out after ${ms}ms (readyState ${a.readyState})`),
      ms,
    );
    a.addEventListener("canplay", () => {
      clearTimeout(timer);
      done(`ok — loaded, duration ${a.duration.toFixed(1)}s`);
    });
    a.addEventListener("error", () => {
      clearTimeout(timer);
      done(
        `error ${a.error?.code ?? "?"}: ${a.error?.message || "no message"}`,
      );
    });

    a.src = src;
  });
}
