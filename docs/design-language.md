# Relief — the app's design language

Invented 2026-08-18, replacing five appearances that had accumulated instead of
being designed. Every decision below is meant to be checkable: if something in
the code cannot be traced to a line on this page, it is inertia and should go.

## Where it comes from

**Topographic sheets.** Not other players, not other software. A map is the
densest artefact people read for hours at a time, and everything on it is
load-bearing: colour is elevation, a line is a slope, a symbol exists only
because the legend says what it means. That is a whole internal logic, and it
transfers as a whole rather than as a quotation.

Three things it gives an app about music that no dark-glass idiom can:

- **Colour that means a quantity.** A hypsometric ramp is not a mood board; the
  green is low and the ochre is high. A library has quantities everywhere —
  how often, how recently, how long — and none of them are currently visible.
- **A legend.** A map is obliged to declare its own vocabulary on the sheet. So
  is this app: the legend block is real, permanent, and doubles as the player.
- **A ban on depth.** A map has no light source, so it has no shadows and no
  glass. Removing depth removes the entire vocabulary the old app leaned on and
  forces every distinction to be made by ink, tint or position instead.

## Colour

Eight values. A legend has exactly as many entries as it has meanings, and these
are the meanings: one ink, one cool, one warning, and a five-step ramp that
counts as a single scale rather than five colours.

The sheet is **light**. Dark bases are the one thing every music player already
is, and a map is printed on paper.

| Token | Value | Role |
| --- | --- | --- |
| `--sheet` | `#EEF0EA` | the page. Cool paper, not cream — cream plus type is a look this project has already ruled out. |
| `--ink` | `#171C15` | every letter and every line. One ink, as on a press. |
| `--ink-soft` | `#5B6458` | the same ink, printed lighter: secondary text only. Never a third colour. |
| `--contour` | `#B4BEAB` | the separator. A contour, 1.5px — a slope, not a hairline. |
| `--water` | `#2F6B8F` | the only cool colour. Selection, links, "you are here". Never decoration. |
| `--warning` | `#A8402B` | one hazard colour. Destructive actions and failures. Nothing else. |
| `--relief-1…5` | `#E4E8DE` `#CFD9C4` `#D9CFA6` `#C9A97A` `#F4F2EE` | the hypsometric ramp: low to high. Applied only where a real quantity exists. |

Dark is a **second printing of the same sheet**, not a second palette: `--sheet`
goes to `#171C15`, `--ink` to `#EEF0EA`, the ramp inverts in lightness and keeps
its hues. A map printed on black paper is still that map.

## Typography

Two faces, both already shipped and both verified OFL with Cyrillic (see
CLAUDE.md — the budget is 180 KB and 134 KB of it is spent). A third face was
considered and rejected: a new one cannot be licence-checked from memory, and
the remaining 46 KB does not buy a Cyrillic display cut worth having.

What changes is not the faces but how they are used.

| Role | Size / weight | Face | Notes |
| --- | --- | --- | --- |
| `sheet-title` | 34 / 600 | Onest | one per screen, the name of the sheet |
| `feature` | 21 / 600 | Onest | a section on the sheet |
| `label` | 15 / 400 | Onest | body — every row, every control |
| `minor` | 12 / 400 | Onest | secondary line, captions |
| `elevation` | 13 / 500, tabular | JetBrains Mono | **numerals only** — durations, counts, positions |

Two weights, 400 and 600. No 200, no 700: a hairline display weight over small
grey text is exactly the shape this project has already worn out.

Tracking is flat at 0 except `sheet-title` at `-0.012em`. Mono is used for
figures and never for words — captioning in monospace is another idiom already
spent here.

## Geometry

- **Radius: 3px, everywhere.** Not zero — zero as a statement is burned ground
  here — and not the soft 14–20px card that every app in the category shares.
  Three pixels reads as a printed panel with a trimmed corner.
- **Rule: 1.5px `--contour`.** Heavier than a hairline on purpose; a contour is
  a feature of the terrain, not a divider someone added to be tidy.
- **Shadows: none. Anywhere.** A map has no light source. This is the single
  most load-bearing rule in the language, because it is what forces every other
  distinction to be earned.
- **Covers are rectangles at 3px, never circles, never recoloured.** A
  photograph pasted on a sheet keeps its own colours; two-ink artwork is ground
  this project has already covered.

## Composition

A map sheet has a **margin** carrying the title, the sheet index and the legend,
and a **body** carrying the terrain. The app is that sheet.

```
┌──────────────────────────────────────────────────────┐
│  cloudify · LIBRARY          search   ○ ○ ○ ○ ○ ○    │  margin: title + index
├──────────────────────────────────────────────────────┤
│                                                      │
│   the body: one scroll, full bleed, no panels        │
│                                                      │
│                                                      │
│  ┌───────────────────┐                               │
│  │ LEGEND            │                               │  the legend block
│  │ ▓ cover  title    │                               │  = the player
│  │ ─────────────     │                               │
│  │ ▁▂▃ plays  ◀ ▶ ▶  │                               │
│  └───────────────────┘                               │
└──────────────────────────────────────────────────────┘
```

Navigation is a **strip along the top margin**, as a sheet index is. The player
is the **legend, pinned bottom-left of the sheet**, and it says what the tints
mean as well as what is playing. The body is a single scroll with no panel, no
card and no inner frame.

This is deliberately none of: a rail on the left, a list in the middle, a
transport bar across the bottom.

## Density

A map is dense; that is the point of one.

- list row **40px** (was 64) — 18 rows on a 900px sheet against 11 before
- cover in a row **32px**, in a grid **whatever the column is**, always square
- grid **6 across** at the top end (was 4), gap **10px**
- page margin **28px**, gap between features **32px**

## Motion

Maps do not move. Two durations and one curve:

- `--t-state` **90ms** — fill and ink changes under the pointer
- `--t-enter` **160ms** — opacity only, for things that appear
- curve: `linear` for state, `cubic-bezier(0.2, 0, 0, 1)` for entering

**Nothing changes position and nothing scales.** No slide, no pop, no lift on
hover. A sheet does not shuffle when you look at it.

## Signature

**The legend.** A fixed block in the corner of the sheet that names the ramp —
what the tints on the rows currently mean — and carries the transport in the
same frame. No other player has one, because no other player has anything to
declare.

Second to it, and dependent on it: **relief bands.** Every track row carries a
tint from the ramp on its left edge, encoding a real quantity. A library becomes
terrain you can read at a glance instead of a list you have to search.

## Voice

A sheet states; it does not address. Labels are nouns, not invitations. No
exclamation marks anywhere, no "oops", no first person.

- empty: **«Ничего не нанесено»** — not "Тут пока пусто!"
- failure: **«Лист не загружен. Нет соединения.»** — the fact, then the cause.

## Five things this language never does

1. **No shadow, no blur, no glass.** There is no light source.
2. **No symbol that is not in the legend.** If it cannot be named, it is not
   drawn.
3. **Colour never means mood.** It means a quantity or a category, or it is not
   colour, it is ink.
4. **Nothing moves position.** Opacity and fill only.
5. **Artwork is never recoloured, cropped to a shape, or blurred.** It is
   pasted on the sheet as it is.

## Against the ground already burned

| Previously worn out | Relief |
| --- | --- |
| black base, frosted glass, heavy blur | light paper sheet, no blur anywhere |
| zero radius as the device; 8–11% hairlines as the only separator | 3px radius; a 1.5px contour, plus tint change |
| dark base + warm off-white + two bright dyes | light base, one ink, one cool, one warning, one ramp |
| covers recoloured in two inks | covers untouched, by rule |
| monospace micro-caps with wide tracking | mono for numerals only, no caps, no tracking |
| the twice-printed heading | one impression, one weight |
| the waveform as a through-line | no waveform; the through-line is the ramp |
| rail left, list middle, player bar bottom | index along the top, legend block bottom-left, one scroll |
| huge ultra-thin heading over small grey text | 34/600 over 15/400 — four steps, two weights |
