/**
 * Pull an accent pair out of the current track's artwork.
 *
 * Runs entirely client-side on a downscaled canvas, so it costs ~1ms and needs
 * no extra network round trip beyond the image the UI already shows. Returns
 * `null` rather than throwing when the image can't be read (a CDN without CORS
 * headers taints the canvas) — callers just keep the previous accent.
 */

/** Pixels dimmer or brighter than this are skipped: they carry no usable hue. */
const MIN_LUM = 0.12;
const MAX_LUM = 0.94;
/** Below this saturation a pixel is grey and would produce a muddy accent. */
const MIN_SAT = 0.18;
const HUE_BINS = 12;

interface Bin {
  weight: number;
  r: number;
  g: number;
  b: number;
  n: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("artwork load failed"));
    img.src = url;
  });
}

/** Saturation and luminance of an RGB triple, both 0..1. */
function satLum(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lum = (max + min) / 2;
  if (max === min) return [0, lum];
  const d = max - min;
  return [lum > 0.5 ? d / (2 - max - min) : d / (max + min), lum];
}

function hueOf(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const d = max - Math.min(rn, gn, bn);
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/**
 * Extract a two-colour accent from an image URL: the most prominent vibrant
 * hue, plus the most distant other hue as its gradient partner.
 */
export async function accentFromArtwork(
  url: string,
): Promise<{ brand: string; brand2: string } | null> {
  let pixels: Uint8ClampedArray;
  try {
    const img = await loadImage(url);
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // Load error, or a tainted canvas on a CDN without CORS headers.
    return null;
  }

  const bins: Bin[] = Array.from({ length: HUE_BINS }, () => ({
    weight: 0,
    r: 0,
    g: 0,
    b: 0,
    n: 0,
  }));

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const alpha = pixels[i + 3]!;
    if (alpha < 128) continue;

    const [sat, lum] = satLum(r, g, b);
    if (sat < MIN_SAT || lum < MIN_LUM || lum > MAX_LUM) continue;

    const bin = bins[Math.floor(hueOf(r, g, b) / (360 / HUE_BINS))]!;
    // Weight by saturation so a small vivid area beats a large washed-out one.
    bin.weight += sat;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.n += 1;
  }

  const ranked = bins
    .map((bin, index) => ({ bin, index }))
    .filter(({ bin }) => bin.n > 0)
    .sort((a, b) => b.bin.weight - a.bin.weight);

  const top = ranked[0];
  if (!top) return null; // A greyscale cover — leave the accent alone.

  // Prefer a partner hue that is visibly different, so the gradient reads.
  const partner =
    ranked
      .slice(1)
      .find(({ index }) => {
        const d = Math.abs(index - top.index);
        return Math.min(d, HUE_BINS - d) >= 2;
      }) ?? top;

  const css = ({ bin }: { bin: Bin }) =>
    `rgb(${Math.round(bin.r / bin.n)} ${Math.round(bin.g / bin.n)} ${Math.round(bin.b / bin.n)})`;

  return { brand: css(top), brand2: css(partner) };
}
