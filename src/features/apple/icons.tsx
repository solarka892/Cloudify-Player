/**
 * Icons in SF Symbols' idiom.
 *
 * Drawn here rather than taken from SF Symbols itself, which is licensed for
 * use in apps on Apple's own platforms and cannot ship in this one. What is
 * copied is the *idiom*, which is what the eye actually recognises:
 *
 *   - one uniform stroke weight per glyph, with round caps and round joins;
 *   - built out of circles and arcs on a 24-unit grid, centred, with about 2
 *     units of margin — SF glyphs share an optical box, so a row of them lines
 *     up without nudging;
 *   - filled variants are the same silhouette with the counters closed, not a
 *     different drawing;
 *   - no incidental detail. SF's house has no door and no windows.
 *
 * Only the glyphs where lucide's own drawing reads as *not* Apple are here.
 * Where lucide already matches the symbol Apple would use — `Mic2` against
 * `music.mic`, `ListMusic` against `music.note.list`, `Shuffle`, `Repeat`,
 * `Heart` — the lucide icon is kept, because a second drawing of the same
 * shape is just more to maintain.
 */

/** What both these and lucide's icons accept, so either can fill a slot. */
export type Glyph = React.ComponentType<{
  className?: string;
  strokeWidth?: number;
}>;

function Outline({
  className,
  strokeWidth = 1.7,
  children,
}: {
  className?: string;
  strokeWidth?: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/**
 * A filled glyph. The hairline stroke on top of the fill is what rounds the
 * corners: SF's `play.fill` is a triangle with a radius on every vertex, and a
 * round-joined stroke of the same colour gives exactly that for free.
 */
function Solid({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/* ── Navigation ──────────────────────────────────────────────────────────── */

/** `house` */
export const AppleHouse: Glyph = (props) => (
  <Outline {...props}>
    <path d="M2.9 11.3 12 4.1l9.1 7.2" />
    <path d="M5.35 9.6v9.3a1.9 1.9 0 0 0 1.9 1.9h9.5a1.9 1.9 0 0 0 1.9-1.9V9.6" />
  </Outline>
);

/** `magnifyingglass` — a true circle and a 45° handle, not a teardrop. */
export const AppleMagnifier: Glyph = (props) => (
  <Outline {...props}>
    <circle cx="10.6" cy="10.6" r="6.9" />
    <path d="M15.7 15.7 20.6 20.6" />
  </Outline>
);

/** `square.stack` — the front card, and the corner of the one behind it. */
export const AppleSquareStack: Glyph = (props) => (
  <Outline {...props}>
    <rect x="3.4" y="7.6" width="13" height="13" rx="3.1" />
    <path d="M7.9 4.4h9.6a3.1 3.1 0 0 1 3.1 3.1v9.6" />
  </Outline>
);

/**
 * `envelope` — messages.
 *
 * The flap is two straight strokes meeting at the centre, not a curve: SF's
 * envelope is a folded rectangle, and an arc there reads as a paper plane.
 */
export const AppleEnvelope: Glyph = (props) => (
  <Outline {...props}>
    <rect x="2.6" y="5.4" width="18.8" height="13.2" rx="3.4" />
    <path d="M3.6 8.2 12 13.4l8.4-5.2" />
  </Outline>
);

/**
 * `bell` — notifications.
 *
 * The clapper is a separate short stroke under the body, which is what keeps
 * it from reading as a mushroom at 18px.
 */
export const AppleBell: Glyph = (props) => (
  <Outline {...props}>
    <path d="M12 3.1a6.1 6.1 0 0 0-6.1 6.1c0 4.2-1.15 5.9-2 6.85a.85.85 0 0 0 .62 1.45h14.96a.85.85 0 0 0 .62-1.45c-.85-.95-2-2.65-2-6.85A6.1 6.1 0 0 0 12 3.1Z" />
    <path d="M10.1 20.2a2.15 2.15 0 0 0 3.8 0" />
  </Outline>
);

/** `person.crop.circle` — the shoulders stay inside the crop. */
export const ApplePersonCircle: Glyph = (props) => (
  <Outline {...props}>
    <circle cx="12" cy="12" r="9.3" />
    <circle cx="12" cy="9.6" r="3.05" />
    <path d="M6.35 18.9a6.2 6.2 0 0 1 11.3 0" />
  </Outline>
);

/**
 * `gearshape` — eight teeth, generated rather than eyeballed.
 *
 * The path is one polygon walked around the circle: for each tooth, out to the
 * face and back to the body, at r=10.05 and r=7.35. A round join is what turns
 * the corners into SF's soft teeth, so the stroke is a touch thinner than the
 * other glyphs' — at 1.7 the teeth close up.
 */
export const AppleGear: Glyph = ({ className, strokeWidth = 1.5 }) => (
  <Outline className={className} strokeWidth={strokeWidth}>
    <path d="M10.23 4.87 10.51 2.06 13.49 2.06 13.77 4.87 15.79 5.7 17.97 3.92 20.08 6.03 18.3 8.21 19.13 10.23 21.94 10.51 21.94 13.49 19.13 13.77 18.3 15.79 20.08 17.97 17.97 20.08 15.79 18.3 13.77 19.13 13.49 21.94 10.51 21.94 10.23 19.13 8.21 18.3 6.03 20.08 3.92 17.97 5.7 15.79 4.87 13.77 2.06 13.49 2.06 10.51 4.87 10.23 5.7 8.21 3.92 6.03 6.03 3.92 8.21 5.7 Z" />
    <circle cx="12" cy="12" r="3.15" />
  </Outline>
);

/* ── Transport ───────────────────────────────────────────────────────────── */

/** `play.fill` */
export const ApplePlay: Glyph = (props) => (
  <Solid {...props}>
    <path d="M8.4 5.9 19.1 12 8.4 18.1Z" />
  </Solid>
);

/** `pause.fill` */
export const ApplePause: Glyph = (props) => (
  <Solid {...props}>
    <rect x="7.7" y="5.1" width="3.3" height="13.8" rx="1.3" />
    <rect x="13" y="5.1" width="3.3" height="13.8" rx="1.3" />
  </Solid>
);

/** `backward.fill` — two triangles, which is what Apple uses. Not a bar. */
export const AppleBackward: Glyph = (props) => (
  <Solid {...props}>
    <path d="M11.5 12 18.9 7v10Z" />
    <path d="M3.9 12 11.3 7v10Z" />
  </Solid>
);

/** `forward.fill` */
export const AppleForward: Glyph = (props) => (
  <Solid {...props}>
    <path d="M12.5 12 5.1 7v10Z" />
    <path d="M20.1 12 12.7 7v10Z" />
  </Solid>
);

/* ── Actions ─────────────────────────────────────────────────────────────── */

/**
 * `square.and.arrow.up` — the system share glyph.
 *
 * Worth drawing because lucide's `Share2` is a node graph, which on an Apple
 * platform means nothing at all: sharing is a box with something leaving it.
 */
export const AppleShare: Glyph = (props) => (
  <Outline {...props}>
    <path d="M12 3.5v10.3" />
    <path d="M8.6 6.6 12 3.2l3.4 3.4" />
    <path d="M7.9 10.3H6.5a2.5 2.5 0 0 0-2.5 2.5v5.9a2.5 2.5 0 0 0 2.5 2.5h11a2.5 2.5 0 0 0 2.5-2.5v-5.9a2.5 2.5 0 0 0-2.5-2.5h-1.4" />
  </Outline>
);

/** `arrow.down.circle` — a download is an arrow in a circle, not a tray. */
export const AppleDownload: Glyph = (props) => (
  <Outline {...props}>
    <circle cx="12" cy="12" r="9.1" />
    <path d="M12 7.5v9" />
    <path d="M8.6 13.1 12 16.5l3.4-3.4" />
  </Outline>
);

/** `arrow.up.circle`, for the mirror of it. */
export const AppleUpload: Glyph = (props) => (
  <Outline {...props}>
    <circle cx="12" cy="12" r="9.1" />
    <path d="M12 16.5v-9" />
    <path d="M8.6 10.9 12 7.5l3.4 3.4" />
  </Outline>
);

/** `checkmark` — one stroke, and it leans. */
export const AppleCheck: Glyph = (props) => (
  <Outline {...props}>
    <path d="M4.8 12.9 9.4 17.5 19.4 6.5" />
  </Outline>
);

/** `chevron.down` — shallower than lucide's, which is nearly a right angle. */
export const AppleChevronDown: Glyph = (props) => (
  <Outline {...props}>
    <path d="M5.4 9.4 12 15.4l6.6-6" />
  </Outline>
);

/** `chevron.up` */
export const AppleChevronUp: Glyph = (props) => (
  <Outline {...props}>
    <path d="M5.4 14.6 12 8.6l6.6 6" />
  </Outline>
);

/** `arrow.counterclockwise` — reset. */
export const AppleReset: Glyph = (props) => (
  <Outline {...props}>
    <path d="M4.3 12a7.7 7.7 0 1 0 2.42-5.6" />
    <path d="M4.1 4.3v3.5h3.5" />
  </Outline>
);

/** `trash` */
export const AppleTrash: Glyph = (props) => (
  <Outline {...props}>
    <path d="M4.4 6.7h15.2" />
    <path d="M9.6 6.7V5.3a1.5 1.5 0 0 1 1.5-1.5h1.8a1.5 1.5 0 0 1 1.5 1.5v1.4" />
    <path d="M6.4 6.7l.75 12a2 2 0 0 0 2 1.9h5.7a2 2 0 0 0 2-1.9l.75-12" />
    <path d="M10.4 10.6v6M13.6 10.6v6" />
  </Outline>
);

/* ── Settings sections ─────────────────────────────────────────────────────
 *
 * These are drawn to be read at 16px in a sidebar, which is a different problem
 * from being read at 24. Anything with more than about three elements turns to
 * mush at that size, and a clever metaphor is worse than an obvious one — so
 * each of these is the plainest SF symbol that names its section, built from as
 * few strokes as will carry it.
 */

/** `circle.lefthalf.filled` — appearance. The light/dark disc, unmistakable. */
export const AppleAppearance: Glyph = ({ className, strokeWidth = 1.8 }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="8.6" />
    {/* The filled half. Drawn as its own arc so it stays a crisp half-disc
        rather than a stroked shape that thickens the diameter. */}
    <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2Z" fill="currentColor" stroke="none" />
  </svg>
);

/** `photo` — the background. Frame, sun, one hill. */
export const ApplePhoto: Glyph = (props) => (
  <Outline strokeWidth={1.8} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <circle cx="8.6" cy="10" r="1.6" />
    <path d="M3.4 17.4l4.6-4.4a2 2 0 0 1 2.8 0l6.4 6.2" />
  </Outline>
);

/**
 * `arrow.left.and.right` between end bars — sizing.
 *
 * A ruler was the first choice and the wrong one: at 16px its tick marks read
 * as noise, and a ruler says "measure" where this section means "how big". Two
 * end stops with a span between them says the latter and survives the size.
 */
export const AppleSizing: Glyph = (props) => (
  <Outline strokeWidth={1.8} {...props}>
    <path d="M3.6 6.5v11M20.4 6.5v11" />
    <path d="M7 12h10" />
    <path d="M9.6 9.4 7 12l2.6 2.6M14.4 9.4 17 12l-2.6 2.6" />
  </Outline>
);

/** `speaker.wave.2.fill` — sound. Filled, because a hollow cone this small
    reads as a triangle and nothing else. */
export const AppleSpeaker: Glyph = ({ className, strokeWidth = 1.8 }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path
      d="M11.2 4.6 6.5 8.8H3.8a1 1 0 0 0-1 1v4.4a1 1 0 0 0 1 1h2.7l4.7 4.2Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M15 9.6a3.6 3.6 0 0 1 0 4.8" />
    <path d="M18 7a7.2 7.2 0 0 1 0 10" />
  </svg>
);

/** `play.circle` — playback. */
export const ApplePlayCircle: Glyph = ({ className, strokeWidth = 1.8 }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="12" r="8.8" />
    <path d="M10.4 8.6 15.8 12l-5.4 3.4Z" fill="currentColor" strokeWidth="1.4" />
  </svg>
);

/** `bookmark.fill` — saved themes. A paintbrush said "painting", not "saved". */
export const AppleBookmark: Glyph = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M6.6 3.6h10.8a1 1 0 0 1 1 1v15.2l-6.4-4.4-6.4 4.4V4.6a1 1 0 0 1 1-1Z" />
  </svg>
);

/* ── Appearance ──────────────────────────────────────────────────────────── */

/** `sun.max` */
export const AppleSun: Glyph = (props) => (
  <Outline {...props}>
    <circle cx="12" cy="12" r="4.4" />
    <path d="M12 2.6v2.3M12 19.1v2.3M2.6 12h2.3M19.1 12h2.3M5.35 5.35l1.6 1.6M17.05 17.05l1.6 1.6M18.65 5.35l-1.6 1.6M6.95 17.05l-1.6 1.6" />
  </Outline>
);

/** `moon` — a crescent cut from a disc, not a hook. */
export const AppleMoon: Glyph = (props) => (
  <Outline {...props}>
    <path d="M20.3 14.7A8.8 8.8 0 0 1 9.3 3.7a8.8 8.8 0 1 0 11 11Z" />
  </Outline>
);

/** `desktopcomputer` — following the system. */
export const AppleDisplay: Glyph = (props) => (
  <Outline {...props}>
    <rect x="2.9" y="4.2" width="18.2" height="12.4" rx="2.4" />
    <path d="M9.4 20h5.2" />
    <path d="M12 16.8V20" />
  </Outline>
);

/* ── Now playing ─────────────────────────────────────────────────────────── */

/** `ellipsis` — the menu. Three dots, nothing else. */
export const AppleEllipsis: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <circle cx="5.2" cy="12" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="18.8" cy="12" r="1.7" />
  </svg>
);

/** `speaker.fill` — the quiet end of a volume slider. */
export const AppleSpeakerLow: Glyph = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
    <path d="M13 5.2 8.1 9.6H5.2a1 1 0 0 0-1 1v2.8a1 1 0 0 0 1 1h2.9l4.9 4.4Z" />
  </svg>
);

/** `speaker.wave.3.fill` — the loud end. */
export const AppleSpeakerHigh: Glyph = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    aria-hidden
  >
    <path
      d="M11 5.2 6.1 9.6H3.2a1 1 0 0 0-1 1v2.8a1 1 0 0 0 1 1h2.9l4.9 4.4Z"
      fill="currentColor"
      stroke="none"
    />
    <path d="M14.4 9.8a3.2 3.2 0 0 1 0 4.4" />
    <path d="M17.2 7.4a7 7 0 0 1 0 9.2" />
    <path d="M20 5a10.6 10.6 0 0 1 0 14" />
  </svg>
);

/** `quote.bubble` — lyrics. */
export const AppleQuote: Glyph = (props) => (
  <Outline {...props}>
    <path d="M20.6 11.9c0 3.5-3.85 6.4-8.6 6.4-.86 0-1.7-.1-2.48-.28-1.05.8-2.62 1.6-4.52 1.88.8-.96 1.4-2.3 1.58-3.46C4.72 15.24 3.4 13.68 3.4 11.9c0-3.5 3.85-6.4 8.6-6.4s8.6 2.9 8.6 6.4Z" />
    <path d="M9.6 10.6v2.2M14.4 10.6v2.2" />
  </Outline>
);

/** `list.bullet` — the queue. */
export const AppleList: Glyph = (props) => (
  <Outline {...props}>
    <path d="M8.4 6.8h11.4M8.4 12h11.4M8.4 17.2h11.4" />
    <path d="M4.4 6.8h.02M4.4 12h.02M4.4 17.2h.02" />
  </Outline>
);
