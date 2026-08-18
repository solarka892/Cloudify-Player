/**
 * A failure that came out of Rust.
 *
 * Commands used to reject with a sentence, which left the app deciding what to
 * do by reading English prose. `src-tauri/src/bridge.rs` explains why that had
 * to stop; this is the receiving end. Two fields:
 *
 *   - `kind` — a stable slug. Branch and translate on this, never on `message`.
 *   - `message` — the diagnostic, in English. For the details pane and the logs.
 *     Worth keeping and worth showing; just not *instead of* an explanation.
 */
export interface Failure {
  kind: string;
  message: string;
}

/** The slug used when something rejected with a shape we do not recognise. */
export const UNKNOWN = "unknown";

/**
 * Read whatever a rejected `invoke` threw as a `Failure`.
 *
 * Tolerant on purpose. Not every command has been migrated to the typed error
 * yet, `invoke` itself can reject with a plain string when the bridge fails
 * before a command runs, and a bug in the frontend arrives here as an `Error`.
 * All three have to end up as something the UI can show without a crash — an
 * error screen that itself throws is the worst version of this.
 */
export function asFailure(e: unknown): Failure {
  if (typeof e === "object" && e !== null) {
    const maybe = e as { kind?: unknown; message?: unknown };
    if (typeof maybe.kind === "string" && typeof maybe.message === "string") {
      return { kind: maybe.kind, message: maybe.message };
    }
    // An `Error`, or anything else with a message but no kind.
    if (typeof maybe.message === "string") {
      return { kind: UNKNOWN, message: maybe.message };
    }
  }
  if (typeof e === "string") return { kind: UNKNOWN, message: e };
  return { kind: UNKNOWN, message: String(e) };
}

/**
 * Whether this failure means "we could not ask", as opposed to "we asked and
 * were refused".
 *
 * The distinction the whole offline story rests on: a request that never landed
 * says nothing at all about whether the session is still good, so nothing may be
 * concluded from it — least of all that the user should be signed out.
 */
export function isOffline(f: Failure): boolean {
  return f.kind === "offline";
}
