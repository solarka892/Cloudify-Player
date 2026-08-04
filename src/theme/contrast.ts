/**
 * What colour text goes on top of the accent.
 *
 * The accent is the one token a user can set to anything — a preset, a colour
 * sampled from artwork, or a hand-picked hex — and anything includes white and
 * black. Every filled accent surface in the app used to hardcode white text,
 * which is invisible the moment the accent is light: a white "Shuffle" button
 * with a white label, and a white play button with a white glyph on it.
 *
 * So the foreground is derived from the accent's lightness rather than assumed.
 * The estimate only has to answer "is this light or dark", which is why an
 * approximation is enough and why an unparseable value falls back rather than
 * throwing.
 */

/** Rough perceived lightness of a CSS colour, 0–1, or `null` if unparseable. */
export function lightnessOf(colour: string): number | null {
  const value = colour.trim();

  // oklch's first component *is* perceived lightness, which is the whole reason
  // the palettes are authored in it.
  const oklch = /^oklch\(\s*([\d.]+)(%?)/i.exec(value);
  if (oklch) {
    const raw = Number(oklch[1]);
    if (!Number.isFinite(raw)) return null;
    return oklch[2] === "%" ? raw / 100 : raw;
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value);
  if (rgb) {
    return luma(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }

  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    const digits = hex[1]!;
    // #rgb and #rgba are shorthand for doubled digits.
    const short = digits.length === 3 || digits.length === 4;
    const at = (i: number) =>
      short
        ? parseInt(digits[i]!.repeat(2), 16)
        : parseInt(digits.slice(i * 2, i * 2 + 2), 16);
    if (digits.length < 3) return null;
    return luma(at(0), at(1), at(2));
  }

  return null;
}

/** Rec. 601 luma, close enough for a light-or-dark decision. */
function luma(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * A readable foreground for a surface filled with `colour`.
 *
 * The threshold sits above the midpoint because the mid-lightness accents in the
 * palette — blues, violets, reds — carry white text comfortably, and only the
 * genuinely pale ones need to flip. Not pure black, which against a bright
 * accent reads as a hole rather than as text.
 */
export function foregroundFor(colour: string): string {
  const lightness = lightnessOf(colour);
  if (lightness === null) return "rgb(255 255 255)";
  return lightness > 0.62 ? "rgb(20 20 22)" : "rgb(255 255 255)";
}
