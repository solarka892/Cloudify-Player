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
 * An Apple platform, where `-apple-system` really is San Francisco.
 *
 * Only Apple mode asks, and only about fonts: every WebKit port answers to
 * `-apple-system`, but off Apple hardware it resolves to whatever the desktop's
 * system font is — Noto Sans on a typical Linux box — so a stack that names it
 * early gets that instead of the face it asked for. iOS reports as "Mac" here
 * under Tauri's webview; either way the answer we want is the same.
 */
export const isApplePlatform = /mac|iphone|ipad|ipod/i.test(
  navigator.userAgent,
);

/**
 * Whether to lay out for a phone.
 *
 * Deliberately not the same question as [[isAndroid]]: a narrow desktop window
 * deserves the same treatment, and a tablet does not. Tailwind's `md` breakpoint
 * (768px) is the same line the CSS uses, so the two never disagree.
 */
export const COMPACT_BREAKPOINT = 768;
