/**
 * The wordmark: a cloud whose underside is a waveform.
 *
 * Reads as SoundCloud's silhouette at a glance without copying it — the bars
 * are the app's own signature, and they take the brand gradient so the logo
 * follows the active theme like everything else.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      /* Cropped to the artwork's real bounds — a viewBox with slack around the
         path pads the glyph invisibly and makes it look badly aligned next to
         icons that have none. */
      viewBox="5.5 7.5 35.5 20"
      className={className}
      role="img"
      aria-label="cloudify"
    >
      <defs>
        <linearGradient id="cloudify-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--brand-2)" />
        </linearGradient>
        {/* The bars are clipped to the cloud so they never poke out of it. */}
        <clipPath id="cloudify-clip">
          <path d="M14 27a8 8 0 0 1-.6-15.98A11 11 0 0 1 34.6 12.2 7.4 7.4 0 0 1 40 27H14Z" />
        </clipPath>
      </defs>

      <path
        d="M14 27a8 8 0 0 1-.6-15.98A11 11 0 0 1 34.6 12.2 7.4 7.4 0 0 1 40 27H14Z"
        fill="url(#cloudify-mark)"
      />

      {/* Waveform bars, rising and falling across the cloud's belly. */}
      <g clipPath="url(#cloudify-clip)" fill="var(--card)" opacity="0.92">
        <rect x="15" y="20" width="2" height="7" rx="1" />
        <rect x="19" y="16" width="2" height="11" rx="1" />
        <rect x="23" y="12" width="2" height="15" rx="1" />
        <rect x="27" y="17" width="2" height="10" rx="1" />
        <rect x="31" y="14" width="2" height="13" rx="1" />
        <rect x="35" y="19" width="2" height="8" rx="1" />
      </g>
    </svg>
  );
}

/** Mark plus wordmark, for the wide navigation layouts. */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark className="h-5 w-9 shrink-0" />
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
