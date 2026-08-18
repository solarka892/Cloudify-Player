/**
 * Playback through Web Audio alone: fetch the file, decode it, play the buffer.
 *
 * ## Why this exists
 *
 * The equaliser and the visualiser both need the audio to pass through a Web
 * Audio graph, and the only way to get an `<audio>` element in there is
 * `createMediaElementSource`. On WebKitGTK — which is what Tauri runs on Linux —
 * that bridge hands the graph nothing: every node builds, the element reports
 * playing, the clock advances, and the destination receives silence. There is no
 * flag to ask about it and no error to catch, so the app had been *measuring*
 * the silence and then switching the effects back off. Which is honest, and
 * leaves a Linux user with an equaliser that does nothing.
 *
 * An `AudioBufferSourceNode` needs no bridge. The bytes are fetched, decoded
 * once, and played from memory into the same chain — so the effects work on
 * every platform, including for downloaded files, whose asset-protocol origin
 * Web Audio was never allowed to read from the element.
 *
 * The cost is real and is why this is not the default: the whole file has to
 * arrive before the first sample plays, and it then sits in memory decoded
 * (~10 MB per minute of stereo). The engine only reaches for this when routing
 * the element has been proven not to work — see `audio/engine.ts`.
 *
 * ## Why it wears an element's clothes
 *
 * The player store drives an `HTMLAudioElement`: it assigns `src`, awaits
 * `play()`, reads `currentTime`, and listens for a dozen media events. Rather
 * than teach every one of those two ways to do the same thing, this presents the
 * same surface — the parts of it the app actually uses — so the store cannot
 * tell which one it is holding.
 */

export interface BufferedHost {
  ctx: AudioContext;
  /** The head of the effect chain; this player's output connects here. */
  input: AudioNode;
  /**
   * The source could not be fetched or decoded. The engine gives up on buffered
   * playback and reloads the track on the ordinary element.
   */
  onFailure: () => void;
}

/** How often `timeupdate` fires while playing. The element's own rate. */
const TICK_MS = 250;

const NO_RANGES: TimeRanges = {
  length: 0,
  start: () => 0,
  end: () => 0,
};

export class BufferedAudio extends EventTarget {
  /** `bindElement` marks the element it has listeners on through this. */
  readonly dataset: Record<string, string> = {};

  /** Accepted and ignored: nothing here is fetched by the element. */
  crossOrigin: string | null = null;
  preservesPitch = true;
  error: MediaError | null = null;
  /** 0 nothing … 4 enough to play through. Only ever 0 or 4: it is all or none. */
  readyState = 0;
  /** 0 empty, 1 idle, 2 loading, 3 no source. */
  networkState = 0;

  private readonly host: BufferedHost;
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;

  private buffer: AudioBuffer | null = null;
  private node: AudioBufferSourceNode | null = null;
  /** Where the playhead was when the current node started. */
  private offset = 0;
  /** `ctx.currentTime` at that moment. */
  private startedAt = 0;
  /**
   * Bumped whenever a node is stopped by us. A node's `ended` fires for `stop()`
   * exactly as it does for reaching the end of the buffer, and reporting a seek
   * as the end of the track would skip to the next one.
   */
  private generation = 0;
  /** Identifies the newest load, so a slow fetch cannot land on a new track. */
  private loadToken = 0;

  private wantsPlay = false;
  private isPaused = true;
  private isEnded = false;
  private source = "";
  private rate = 1;
  private level = 1;
  private silenced = false;
  private ticker: number | null = null;

  constructor(host: BufferedHost) {
    super();
    this.host = host;
    this.ctx = host.ctx;
    this.gain = host.ctx.createGain();
    this.gain.connect(host.input);
  }

  /* ── the element's surface ──────────────────────────────────────────── */

  get src(): string {
    return this.source;
  }

  set src(url: string) {
    this.source = url;
    this.stopNode();
    this.buffer = null;
    this.offset = 0;
    this.isEnded = false;
    this.readyState = 0;
    this.error = null;
    this.dispatchEvent(new Event("emptied"));
    if (url) void this.fetchAndDecode(url);
  }

  get currentSrc(): string {
    return this.source;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get ended(): boolean {
    return this.isEnded;
  }

  get duration(): number {
    return this.buffer ? this.buffer.duration : NaN;
  }

  /**
   * All of it or none of it: there is no partial state to report, since nothing
   * plays until the whole file is decoded.
   */
  get buffered(): TimeRanges {
    const buffer = this.buffer;
    if (!buffer) return NO_RANGES;
    return { length: 1, start: () => 0, end: () => buffer.duration };
  }

  get currentTime(): number {
    if (this.isPaused || !this.node) return this.offset;
    const elapsed = (this.ctx.currentTime - this.startedAt) * this.rate;
    const at = this.offset + elapsed;
    return this.buffer ? Math.min(at, this.buffer.duration) : at;
  }

  set currentTime(seconds: number) {
    const at = Math.max(0, seconds);
    if (!this.buffer) {
      // Seeking before the audio is here is not lost — it is where playback
      // starts once it arrives.
      this.offset = at;
      return;
    }
    const clamped = Math.min(at, this.buffer.duration);
    if (this.isPaused) {
      this.stopNode();
      this.offset = clamped;
      this.isEnded = false;
    } else {
      // A buffer source cannot be moved; seeking means a new one.
      this.start(clamped);
    }
    this.dispatchEvent(new Event("timeupdate"));
  }

  get volume(): number {
    return this.level;
  }

  set volume(value: number) {
    this.level = Math.min(1, Math.max(0, value));
    this.applyGain();
  }

  get muted(): boolean {
    return this.silenced;
  }

  set muted(value: boolean) {
    this.silenced = value;
    this.applyGain();
  }

  get playbackRate(): number {
    return this.rate;
  }

  set playbackRate(value: number) {
    // Read the playhead against the *old* rate before changing it, or the
    // elapsed time since the node started would be re-measured at the new one.
    const at = this.currentTime;
    this.rate = value;
    if (this.node) {
      this.offset = at;
      this.startedAt = this.ctx.currentTime;
      this.node.playbackRate.value = value;
    }
  }

  async play(): Promise<void> {
    this.wantsPlay = true;
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
        // A context that will not resume produces no sound, and there is
        // nothing useful to do about it from here.
      }
    }
    this.dispatchEvent(new Event("play"));
    if (!this.buffer) {
      // Still downloading. Same state the element reports while it buffers, and
      // the store puts the same spinner on the button.
      this.dispatchEvent(new Event("waiting"));
      return;
    }
    if (this.isEnded) this.offset = 0;
    this.start(this.offset);
  }

  pause(): void {
    this.wantsPlay = false;
    if (this.isPaused) return;
    const at = this.currentTime;
    this.stopNode();
    this.offset = at;
    this.isPaused = true;
    this.stopTicker();
    this.dispatchEvent(new Event("pause"));
  }

  /** Only `src` is ever removed, and only to silence a discarded player. */
  removeAttribute(name: string): void {
    if (name !== "src") return;
    this.stopNode();
    this.source = "";
    this.buffer = null;
    this.readyState = 0;
    this.networkState = 0;
    this.loadToken++;
    this.isPaused = true;
    this.stopTicker();
  }

  /** Re-run the current load. The element's `load()`, minus the state machine. */
  load(): void {
    if (this.source) void this.fetchAndDecode(this.source);
  }

  /** Stop everything and let go of the graph. */
  dispose(): void {
    this.loadToken++;
    this.stopNode();
    this.stopTicker();
    this.buffer = null;
    this.isPaused = true;
    try {
      this.gain.disconnect();
    } catch {
      // Already detached with the context it belonged to.
    }
  }

  /* ── the machinery ─────────────────────────────────────────────────── */

  private async fetchAndDecode(url: string): Promise<void> {
    const token = ++this.loadToken;
    this.networkState = 2;
    this.readyState = 0;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (token !== this.loadToken) return; // superseded by a newer track
      const buffer = await this.ctx.decodeAudioData(bytes);
      if (token !== this.loadToken) return;

      this.buffer = buffer;
      this.readyState = 4;
      this.networkState = 1;
      this.dispatchEvent(new Event("durationchange"));
      this.dispatchEvent(new Event("loadedmetadata"));
      this.dispatchEvent(new Event("progress"));
      this.dispatchEvent(new Event("canplay"));
      if (this.wantsPlay) this.start(this.offset);
    } catch {
      if (token !== this.loadToken) return;
      this.networkState = 3;
      // Deliberately no `error` event: the engine is about to reload this track
      // on the ordinary element, and telling the store the playback failed would
      // put an error in front of the user for something that is about to work.
      this.host.onFailure();
    }
  }

  private start(at: number): void {
    const buffer = this.buffer;
    if (!buffer) return;
    this.stopNode();

    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.playbackRate.value = this.rate;
    node.connect(this.gain);

    const generation = this.generation;
    node.onended = () => {
      if (generation === this.generation) this.finish();
    };
    node.start(0, Math.min(Math.max(0, at), buffer.duration));

    this.node = node;
    this.offset = at;
    this.startedAt = this.ctx.currentTime;
    this.isPaused = false;
    this.isEnded = false;
    this.startTicker();
    this.dispatchEvent(new Event("playing"));
  }

  private stopNode(): void {
    const node = this.node;
    this.node = null;
    if (!node) return;
    this.generation++; // disarm the `ended` this stop is about to fire
    node.onended = null;
    try {
      node.stop();
    } catch {
      // Never started, or already finished. Either way it is done.
    }
    node.disconnect();
  }

  /** The buffer ran out on its own — the end of the track. */
  private finish(): void {
    this.node = null;
    this.isPaused = true;
    this.isEnded = true;
    this.wantsPlay = false;
    this.offset = this.buffer?.duration ?? 0;
    this.stopTicker();
    this.dispatchEvent(new Event("ended"));
  }

  private applyGain(): void {
    this.gain.gain.value = this.silenced ? 0 : this.level;
  }

  private startTicker(): void {
    if (this.ticker !== null) return;
    this.ticker = window.setInterval(() => {
      this.dispatchEvent(new Event("timeupdate"));
    }, TICK_MS);
  }

  private stopTicker(): void {
    if (this.ticker === null) return;
    window.clearInterval(this.ticker);
    this.ticker = null;
  }
}
