/**
 * The same folding the local store does, for lists that are already in memory.
 *
 * A deliberate second copy of `src-tauri/src/cache/fold.rs`. The Rust one backs
 * the FTS index and answers about the whole library; this one filters a list the
 * screen is already holding, where a round trip per keystroke would be slower
 * than the work itself and would also miss anything not yet mirrored.
 *
 * The two must agree, or the same query would find different things in the
 * library screen and in the command palette. `fold.test.ts` pins the same table
 * of pairs the Rust test does, so a change to one that is not made to the other
 * fails a test rather than surfacing as "search is weird sometimes".
 *
 * See the Rust module for why the scheme is lossy rather than a romanisation
 * standard: it collapses the ways one word is actually typed, and because both
 * the text and the query pass through it, every collapsing rule is safe.
 */

const LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ґ: "g", д: "d", е: "e", ё: "e", є: "ye",
  ж: "zh", з: "z", и: "i", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h",
  ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

/** Digraphs that are one sound spelled two ways, longest first. */
const COLLAPSE: [string, string][] = [
  ["shch", "sch"],
  ["kh", "h"],
  ["yo", "e"],
  ["jo", "e"],
  ["ts", "c"],
  ["iy", "y"],
  ["yy", "y"],
  ["ij", "y"],
  ["j", "y"],
  ["w", "v"],
];

/** Fold `text` into the form both the index and the query are compared in. */
export function fold(text: string): string {
  let out = "";
  for (const character of text.toLowerCase()) {
    out += LATIN[character] ?? character;
  }

  for (const [from, to] of COLLAPSE) {
    if (out.includes(from)) out = out.split(from).join(to);
  }

  // Everything that is not a letter or a digit is a separator. Last, so the
  // rules above see whole words rather than fragments.
  return out
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Does `text` answer to `query`, whichever script either is written in?
 *
 * Both sides are folded, which is what makes `vyazki` find «Вязки» *and*
 * «Вязки» find `Vyazki` — nothing anywhere transliterates Latin back into
 * Cyrillic, which would be guesswork.
 */
export function matches(query: string, text: string): boolean {
  const needle = fold(query);
  if (!needle) return true;
  return fold(text).includes(needle);
}

/**
 * Whether this match needed the folding to happen at all.
 *
 * Used only to say so on screen: finding «Вязки» by typing `vyazki` is the one
 * moment the feature is visible, and an interface that does it silently gets no
 * credit for it and teaches nobody that it can be done.
 */
export function matchedByFolding(query: string, text: string): boolean {
  if (!query.trim()) return false;
  const plain = text.toLowerCase().includes(query.trim().toLowerCase());
  return !plain && matches(query, text);
}
