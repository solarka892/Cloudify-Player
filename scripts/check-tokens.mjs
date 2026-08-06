#!/usr/bin/env node
/**
 * Guard the theming contract against literals.
 *
 * The whole appearance system rests on one rule — components read tokens, they
 * do not name values — and that rule is invisible in review. A `rounded-lg` in a
 * new component looks like every other Tailwind class in the file, and it is
 * only wrong later, when someone switches to a skin whose radius is zero and one
 * button stays rounded. Tailwind utilities always beat a custom property, so a
 * single literal is enough to break a skin, and nothing about the diff says so.
 *
 * This is deliberately a grep and not a full parser. It reads the same source a
 * reviewer does, it never has an opinion about anything but a fixed list of
 * class names, and its false-positive rate is whatever the allowlist below says.
 * An ESLint rule was the other option; `no-restricted-syntax` cannot see inside
 * a template literal or a `cn()` argument list, which is where most of these
 * live.
 *
 * Run by `pnpm lint`, and in CI.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");

/**
 * What a literal looks like, and what to use instead.
 *
 * Every pattern here has a token that covers it. `rounded-md` and friends are
 * *already* mapped onto the skin's radii by `@theme inline`, so they are not
 * bugs — but they say nothing about which of the three radii they mean, and a
 * reader has to know the mapping to tell. The explicit form is the same CSS.
 */
const RULES = [
  {
    id: "radius",
    // Any `rounded-*` that is not `rounded-[…]` or `rounded-none`.
    pattern:
      /\brounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-(?:none|full|xs|sm|md|lg|xl|2xl|3xl|4xl|\d+))?(?![-[\w])/g,
    allow: (m) => m === "rounded-none",
    hint: "use rounded-[var(--radius)] / -control / -hero / -round",
  },
  {
    id: "shadow",
    pattern: /\bshadow-(?:xs|sm|md|lg|xl|2xl|inner)\b/g,
    hint: "use shadow-[var(--shadow-1)] or shadow-[var(--shadow-2)]",
  },
  {
    id: "colour",
    pattern: /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g,
    hint: "use a palette token, or the .scrim / .art-overlay classes",
  },
  {
    id: "hex",
    pattern: /\b(?:bg|text|border|ring|fill|stroke|shadow)-\[#[0-9a-fA-F]{3,8}\]/g,
    hint: "use a palette token",
  },
];

/**
 * Files that are allowed their literals, and why.
 *
 * Two kinds only. Apple mode is a *reproduction* of someone else's design
 * system: its radii and fills are Apple's published numbers, converting them
 * would move them, and it replaces the skin wholesale so no skin's radius ever
 * applies inside it. `ui/*` is shadcn's, and is documented separately — see
 * `docs/shadcn-edits.md`.
 *
 * There is no entry for "this one looked fine": a component that needs a value
 * the tokens cannot express needs a token, not a line here.
 */
const ALLOW_FILES = [
  { path: "src/features/apple/", why: "Apple's own published values" },
  { path: "src/theme/apple.ts", why: "Apple's own published values" },
];

/**
 * The quoted spans of a line.
 *
 * Class names only ever live inside a string, and scanning the whole line finds
 * the word "rounded" in prose ("iOS 26 rounded everything off") and in prop
 * names (`rounded: "square" | "circle"`). Restricting the search to string
 * literals is what makes a bare `rounded` — a real hardcode, `0.25rem` — worth
 * reporting at all, rather than something the pattern has to tiptoe around.
 */
function quoted(line) {
  return line.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
}

/** Class-bearing sources only; `.ts` files carry no Tailwind. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const problems = [];

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOW_FILES.some((a) => rel.startsWith(a.path))) continue;

  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const span of quoted(line)) {
      for (const rule of RULES) {
        // A fresh `lastIndex` per span; the patterns are global.
        rule.pattern.lastIndex = 0;
        for (const match of span.matchAll(rule.pattern)) {
          const text = match[0];
          if (rule.allow?.(text)) continue;
          problems.push({ rel, line: i + 1, text, hint: rule.hint });
        }
      }
    }
  });
}

if (problems.length === 0) {
  console.log("check-tokens: no hardcoded radii, shadows or colours in src/");
  process.exit(0);
}

console.error(
  `check-tokens: ${problems.length} hardcoded value${problems.length === 1 ? "" : "s"} in src/\n`,
);
for (const p of problems) {
  console.error(`  ${p.rel}:${p.line}  ${p.text}\n      ${p.hint}`);
}
console.error(
  "\nComponents read tokens; they do not name values. If no token fits, add one\n" +
    "to SkinVars in src/theme/tokens.ts with a comment saying what it is for.",
);
process.exit(1);
