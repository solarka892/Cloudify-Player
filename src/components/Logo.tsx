/**
 * The wordmark: a cloud whose underside is a waveform.
 *
 * Reads as SoundCloud's silhouette at a glance without copying it — the bars
 * are the app's own signature, and they take the brand gradient so the logo
 * follows the active theme like everything else.
 *
 * The cloud is the union of three circles and the base between them, drawn as
 * separate shapes rather than one hand-tuned path. That is deliberate: the
 * silhouette's bounds are then exactly
 *
 *   x from 11-6=5 to 34+7=41,  y from 14-10=4 to 20+6=26
 *
 * which is the viewBox below, so the glyph fills its box with no invisible
 * padding and — the previous path's actual bug — nothing hanging outside it
 * either. Overlaps are seamless because every shape takes the same gradient in
 * user space, so the shared areas paint the identical colour.
 */

/** Left lobe, centre lobe, right lobe, and the flat base joining them. */
const CLOUD = (
  <>
    <circle cx="11" cy="20" r="6" />
    <circle cx="23" cy="14" r="10" />
    <circle cx="34" cy="19" r="7" />
    <rect x="11" y="20" width="23" height="6" />
  </>
);

/** Waveform bars: x, and the y they rise to. They run to the cloud's base. */
const BARS: [x: number, top: number][] = [
  [11, 19],
  [15.2, 15],
  [19.4, 11],
  [23.6, 17],
  [27.8, 13],
  [32, 20],
];

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="5 4 36 22"
      className={className}
      role="img"
      aria-label="cloudify"
    >
      <defs>
        {/* User space, not the default object bounding box: the gradient has to
            span the whole mark rather than restart on each of its shapes. */}
        <linearGradient
          id="cloudify-mark"
          gradientUnits="userSpaceOnUse"
          x1="5"
          y1="4"
          x2="41"
          y2="26"
        >
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--brand-2)" />
        </linearGradient>
        {/* The bars are clipped to the cloud so they never poke out of it. */}
        <clipPath id="cloudify-clip">{CLOUD}</clipPath>
      </defs>

      <g fill="url(#cloudify-mark)">{CLOUD}</g>

      <g clipPath="url(#cloudify-clip)" fill="var(--card)" opacity="0.92">
        {BARS.map(([x, top]) => (
          // Rounded on top, and run one unit past the base so the clip cuts
          // them off square where the cloud ends.
          <rect key={x} x={x} y={top} width="2" height={27 - top} rx="1" />
        ))}
      </g>
    </svg>
  );
}

/** Mark plus wordmark, for the wide navigation layouts. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      {/* Boxes are the mark's own 36:22, so it fills them exactly. Compact is
          18px tall to match the 18px rail icons it sits above, and 30px wide —
          which is all the room the 56px rail has once its padding is taken. */}
      <LogoMark
        className={compact ? "h-[18px] w-[30px] shrink-0" : "h-5 w-[33px] shrink-0"}
      />
      {!compact && (
        <span
          className="brand-text text-lg font-bold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          cloudify
        </span>
      )}
    </span>
  );
}
