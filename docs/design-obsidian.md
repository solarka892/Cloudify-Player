# Obsidian

A fourth skin and a matching palette: true black, hairlines instead of borders,
weight instead of colour, and a corner radius of exactly zero. This is the record
of what was added, why it was split the way it was, and what was deliberately
left undone.

## The shape of the change

Appearance in this app is three independent axes — `layout` → `skin` → `palette`
— plus the user's own `overrides` applied last. That orthogonality is the whole
architecture, and Obsidian does not get an exemption from it. So the mode is:

- **`palettes.obsidian`** — colour only. Eight achromatic values.
- **`skins.obsidian`** — form only. Radius, blur, motion, type.
- **`BUILTIN_PRESETS[0]`** — the *combination*, because the design brief was
  about a combination and nothing else in Settings is allowed to name one.
- **`data-skin="obsidian"` on `<html>`** — the handful of rules no single custom
  property can carry.

There is no `if (skin === "obsidian")` anywhere in `src/`. Components read
tokens; where a token could not express something, a token was added.

## Tokens introduced

| Token | Why it exists |
| --- | --- |
| `--radius-round` | "As round as it goes" is a shape, not a size. Folding the 54 `rounded-full` sites onto `--radius-control` would have made every avatar a 10px-cornered square in Aurora. `9999px` in three skins and Apple mode, `0` here. |
| `--art-filter` | The key token of the mode. Cover art is the one thing on screen the app does not author, and the most saturated object in the window. |
| `--label-size` | A skin that tracks its labels out to `0.17em` has to shrink them too, or the two together read as a headline. |
| `--focus-ring` | A square ring with an inner gap. On black, a ring flush against an element merges with its hairline border and stops reading as focus. |
| `--chrome-height`, `--chrome-alpha` | The app's own title bar. Height is the same in every skin — see `window-chrome.md` for why the bar is not skin-gated — only the finish differs. |
| `--glow`, `--grain` | The ambient light and the film of noise. Dimmers, not switches: the layers are `display: none` unless the skin asks. |
| `--surface-sink` | The one addition the brief did not ask for by name. See below. |

`SIGNATURE_OFF` in `tokens.ts` is the "nothing changes" answer to all of these,
spread by the other three skins and by Apple mode. It is not tidiness:
`applyTheme` only *removes* a property it is handed as an empty string, so a skin
silent about `--art-filter` would inherit Obsidian's greyscale from whatever was
on `<html>` before it. A test asserts every skin answers.

### Why `--surface-sink`

`glass: false` is a performance switch and it is not going away, so Obsidian has
to look finished in both states. But `buildVars` forces `--surface-alpha: 100%`
when glass is off, and the palette's `surface` is deliberately tuned to be read
*through* 26% of translucency — at full strength it is about three times too
bright, and the "panels are barely lighter than the page" rule breaks.

Three options were on the table:

1. Give the skin a second set of colours for the opaque case. Rejected: a skin
   that carries colour is the end of the orthogonality.
2. Hardcode `oklch(0.045 0 0)` in a `[data-skin="obsidian"]` CSS rule, as the
   brief suggested. Rejected: it silently ignores the palette, so Obsidian's skin
   over the `sand` palette would come out black.
3. Have the skin say *how far* an opaque panel sinks toward the page, and let the
   palette supply both ends. Chosen.

At the default `0%` the mix resolves to `var(--card)` unchanged, so nothing about
the other three skins moves.

## `obsidian` next to `ink`

`ink` is already true black. The brief asked for these to be told apart or
merged, and they are told apart — by instinct rather than by a hue:

| | `ink` | `obsidian` |
| --- | --- | --- |
| `text` | `oklch(1 0 0)` — pure white | `oklch(0.97 0 0)` |
| `line` | 18% | 8% |
| `muted` | `0.68` | `0.55` |

`ink` is built to be legible: maximum contrast, rules you can see. Obsidian is
built to be quiet — text stops short of white so that **white is left to mean
accent** (it is the play button's fill and nothing else's), dividers fall to 8%
so they read as hairlines rather than rules, and `muted` drops so the hierarchy
has somewhere to go. Against 8% lines that difference is the design. A test
asserts the three fields stay apart; if they ever converge, one palette should
go.

## The signature: the loupe

One memorable element, and everything else stays quiet around it. A blurred
elliptical arc of white light inside the window, masked to its lower sweep,
drifting over 52 seconds.

It is not decoration. **Frosted glass on true black has nothing to refract**:
without a light source behind them a 30px `backdrop-filter` produces flat grey
rectangles and the entire look collapses. The arc is what makes the glass legible,
which is why it is `0.44` opacity and not the `0.7` it wants to be — past about
0.5 it stops being a reflection and becomes wallpaper, and then the interface is
competing with it.

Pure CSS: a border, a `border-radius: 50%`, a `filter: blur()` and a
`mask-image`, plus one long `rotate`/`scale` keyframe the compositor owns. No
canvas, no `requestAnimationFrame`, nothing per frame. `border-radius: 50%` here
is not a violation of the square-corner rule — this is light, not an element.

`prefers-reduced-motion` needs an explicit `animation: none` rather than the
stylesheet's blanket `animation-duration: 0.01ms`: a 0.01ms iteration does not
stop an `infinite alternate` animation, it runs it thousands of times a second.

## Why artwork is desaturated

Because it is the loudest colour in the window and the app did not choose it. A
SoundCloud cover is a full-saturation photograph, and four places blow one up to
fill a whole pane — the Now Playing room light, the track hero, the profile banner
and the avatar bloom.

Colour had four routes back in, and all four are closed:

1. **The covers themselves** — `.artwork` at nineteen sites, `filter:
   var(--art-filter)`.
2. **The wallpaper** (the blurred playing cover) — through the existing
   `--backdrop-saturate-scale` multiplier, which the skin zeroes. The preset also
   sets `saturate: 0` as a *setting*; both are deliberate. The preset is for
   people who press the button, the CSS rule is for people who picked the skin by
   hand and already had a saturation they liked.
3. **An accent sampled from the cover** — the palette declares itself
   `achromatic` and `desaturate` reduces the pair to its lightness. Blocking the
   switch was the other option; this one honours both settings, and a dark album
   still gives a dark accent, so the feature keeps meaning something.
4. **The brand gradient** — flattened to `--brand` under this skin. With an
   achromatic palette a white-to-grey ramp reads as a smudge rather than a fill.

The greyscale-artwork **setting** blanks `--art-filter` and nothing else. Turning
it off gives the covers in the interface their colour back but leaves the
wallpaper grey — the setting is about covers, and a wallpaper is not one. This is
a deliberate asymmetry, not an oversight.

Missing covers get one of six geometric marks (`ArtFallback`), chosen by track id
so a screen full of them reads as a set. Marks and note glyph are both rendered
and CSS picks between them: the other three skins keep the glyph they had,
because this is an Obsidian idea rather than an improvement to them.

## What was not done, and why

- **The progress line along the top edge of the player bar.** The brief asks for
  it. It cannot be done without a different DOM per skin — `SeekBar` is one
  component shared by the bar and the Now Playing screen, and relocating it for
  one skin means either a skin-specific tree or a CSS rule pinning a
  descendant's position from three levels up. Both lose more than the two pixels
  gain. What did ship is the *form*: a 2px rule and a 2×8 rectangular handle.
- **A colour-accent block.** `accentFromArtwork` still works under this palette;
  it is achromatised rather than disabled. Documented above.
- **The in-app logo.** Checked first, as the brief asked. `Logo.tsx` fills the
  mark with `--brand` → `--brand-2`, both achromatic in this palette, and the
  bars take `--card`. It already works; nothing was changed. Its bars keep their
  1px round tops — that is the logo's own shape, and the exception for radii
  inside SVG glyphs covers it.
- **A `persist` version bump.** Every new field is additive and `fillDefaults`
  already supplies it, so there is nothing to migrate. Bumping the version to
  write an empty migration would be the risky option, not the safe one.
- **Grain as a Settings row.** It is a token (`--grain`); overriding it to `0`
  turns it off. Two new switches were enough for one mode.

## The app icon

`assets/icon-master.svg` → `assets/icon-master.png` → `pnpm tauri icon
assets/icon-master.png`, which regenerates `src-tauri/icons/*` including the
Windows tiles, the iOS set and the Android mipmaps. Do not edit those by hand.

Black square, white waveform, no gradients, no rounded corners — square because
every platform that wants rounded corners masks them itself, and one that does not
cannot un-round a bitmap. The waveform is the app's own mark reduced to the one
gesture that survives being 32 pixels wide; behind it is the same masked arc the
window draws.

Worth stating plainly: **the icon is not per-skin**, so this makes the whole
product's identity monochrome, not just Obsidian's. That was an easy call only
because the icon it replaced was still Tauri's default yellow-and-cyan
placeholder. If a coloured identity is wanted later, this is the file to change.

## Guarding it

`scripts/check-tokens.mjs`, run by `pnpm lint` and so by CI, fails on a literal
`rounded-*`, `shadow-<scale>`, `bg-white`/`bg-black` or hex colour in `src/`. It
greps string literals rather than parsing, because `no-restricted-syntax` cannot
see inside a template literal or a `cn()` argument list, which is where most of
these lived. Two allowlist entries, both Apple mode — a reproduction of someone
else's design system, using their published numbers, in a mode that replaces the
skin outright.

Hand edits to installed shadcn components are recorded in `shadcn-edits.md`,
because `shadcn add` overwrites them silently.
