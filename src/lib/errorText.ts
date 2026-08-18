import { t } from "@/i18n";
import type { Failure } from "@/lib/failure";

/**
 * A failure, said in words the user can act on.
 *
 * Task 17. What the app used to show was `403 Forbidden` and
 * `request failed with status 401` — correct, English, and useless to anybody
 * who wanted to hear a song. Three things every failure owes the reader:
 *
 *   1. **what happened**, in a sentence with no codes in it;
 *   2. **why**, when there is a why worth saying;
 *   3. **what to do**, as one action rather than a list of possibilities.
 *
 * The diagnostic is not thrown away — it moves behind "details", because it is
 * the only thing worth having when a bug is reported and the sentence above it
 * is the only thing worth having the rest of the time.
 */

/** The one thing worth offering to do about a failure. */
export type Remedy = "retry" | "signIn" | "openSoundCloud" | "none";

export interface Explained {
  /** What happened. One sentence. */
  what: string;
  /** Why, or `null` when saying more would be padding. */
  why: string | null;
  remedy: Remedy;
  /** The English diagnostic. Never shown unless the reader asks. */
  details: string;
  /**
   * True when the user should not be told at all.
   *
   * Two kinds qualify: a sign-in window the user closed themselves, and the OS
   * media notification failing to update. Neither is news, and an app that
   * reports its own housekeeping teaches people to dismiss its messages
   * unread — which costs it the one time it has something important to say.
   */
  silent: boolean;
}

/** The message keys under `t.errors`, i.e. everything but the action labels. */
type MessageKey = Exclude<
  keyof typeof t.errors,
  "detailsToggle" | "retry" | "signIn" | "openSoundCloud"
>;

/**
 * Which sentence a kind gets, and what to offer.
 *
 * Deliberately coarser than the list of kinds. `bad-reply`, `client-id`,
 * `rejected` and `refused` are four different diagnoses and one situation:
 * SoundCloud would not answer properly and trying again is the move. Four
 * separate sentences would be four ways of saying the same thing, in ten
 * languages, and the reader would learn nothing from the distinction.
 */
function classify(kind: string): {
  key: MessageKey;
  remedy: Remedy;
  silent?: boolean;
} {
  switch (kind) {
    case "offline":
      return { key: "offline", remedy: "retry" };
    case "rate-limited":
      return { key: "rateLimited", remedy: "retry" };
    case "session-expired":
      return { key: "sessionExpired", remedy: "signIn" };
    case "not-logged-in":
      return { key: "notLoggedIn", remedy: "signIn" };
    case "bot-filtered":
      return { key: "botFiltered", remedy: "openSoundCloud" };
    case "no-stream":
      return { key: "noStream", remedy: "none" };
    case "not-downloadable":
      return { key: "notDownloadable", remedy: "none" };
    case "disk":
      return { key: "disk", remedy: "none" };
    case "not-soundcloud-url":
    case "unexpected-host":
      return { key: "badLink", remedy: "none" };
    case "refused":
    case "rejected":
    case "bad-reply":
    case "client-id":
      return { key: "refused", remedy: "retry" };
    case "empty-input":
      return { key: "emptyInput", remedy: "none" };
    case "login-timeout":
      return { key: "loginTimeout", remedy: "retry" };
    case "unsupported":
      return { key: "unsupported", remedy: "none" };
    case "tagging":
      return { key: "tagging", remedy: "none" };
    case "local-library":
      return { key: "localLibrary", remedy: "none" };
    case "keyring":
      return { key: "keyring", remedy: "none" };
    case "cancelled":
    case "media-session":
      return { key: "unknown", remedy: "none", silent: true };
    // `broken` and anything a newer Rust build invents. A kind this side does
    // not know about is still a real failure, and the diagnostic still travels
    // with it — so it is reported as an unexplained one rather than swallowed.
    case "broken":
    default:
      return { key: "unknown", remedy: "none" };
  }
}

/** Explain a failure. Read during render: `t` is a live binding. */
export function explain(failure: Failure): Explained {
  const { key, remedy, silent } = classify(failure.kind);
  const message = t.errors[key];
  return {
    what: message.what,
    // Empty rather than absent in the dictionaries, so a translator can see the
    // slot and decide it needs nothing.
    why: message.why || null,
    remedy,
    details: failure.message,
    silent: silent ?? false,
  };
}

/** The label for a remedy's button, or `null` when there is nothing to offer. */
export function remedyLabel(remedy: Remedy): string | null {
  switch (remedy) {
    case "retry":
      return t.errors.retry;
    case "signIn":
      return t.errors.signIn;
    case "openSoundCloud":
      return t.errors.openSoundCloud;
    case "none":
      return null;
  }
}
