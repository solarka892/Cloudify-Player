/**
 * Which build we are running in.
 *
 * Read from the user agent rather than asked of Rust: inside our own webview it
 * is unambiguous, it is available synchronously (so module-level constants and
 * first renders can use it), and it costs no round trip.
 */

/** The Android build. Governs the sign-in path and the native media session. */
export const isAndroid = /android/i.test(navigator.userAgent);

/**
 * Whether to lay out for a phone.
 *
 * Deliberately not the same question as [[isAndroid]]: a narrow desktop window
 * deserves the same treatment, and a tablet does not. Tailwind's `md` breakpoint
 * (768px) is the same line the CSS uses, so the two never disagree.
 */
export const COMPACT_BREAKPOINT = 768;
