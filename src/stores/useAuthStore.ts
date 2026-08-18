import { create } from "zustand";
import { persist } from "zustand/middleware";
import { asFailure, isOffline, type Failure } from "@/lib/failure";
import { scGetMe, scIsLoggedIn, scLogout, type Me } from "@/lib/tauri";

/**
 * Whether the app has a session, and what to do about it if not.
 *
 * ## Why this is a store and not `useState` in `App`
 *
 * It was the latter, and the bug that moved it is worth keeping written down.
 * `refreshMe` treated every failure of `/me` the same way, and `App` rendered
 * the sign-in screen for anything that was not `loggedIn`. So losing the network
 * for a moment showed the user a sign-in screen — with a perfectly good token
 * still in the keyring — and signing in again here means a browser round trip.
 * Being thrown out of an account by a wifi hiccup is the kind of thing that
 * makes an app feel broken even when nothing is.
 *
 * The rule the states below exist to enforce:
 *
 *   - **"we could not ask"** — no network, a timeout, a request that never
 *     landed. Says *nothing* about the session. The token stays, the user stays,
 *     and the app shows what it already has.
 *   - **"we asked and were told the token is no good"** — a 401 that survived a
 *     `client_id` refresh. Only this ends a session, and Rust has already
 *     deleted the token by the time it is reported (`commands::sc_get_me`).
 *
 * Everything else — a rate limit, a region block, the bot filter — is a failure
 * to report, not a reason to sign anybody out.
 */
export type Session =
  | { state: "unknown" }
  | { state: "loggedOut" }
  | { state: "loggingIn" }
  | { state: "loggedIn"; me: Me }
  /** Had a session; SoundCloud rejected the token. Needs a fresh sign-in. */
  | { state: "expired" }
  /**
   * Signed in, but out of reach. `me` is the last user seen, which is why it is
   * persisted: a cold start with no network would otherwise have nothing to show
   * and would look exactly like being signed out.
   */
  | { state: "offline"; me: Me | null }
  | { state: "error"; failure: Failure };

interface AuthState {
  session: Session;
  /**
   * The last user successfully fetched. Persisted, and the only thing here that
   * is — a session is a fact about right now, and restoring a stale `loggedIn`
   * from disk would mean the app claiming a token it has not checked.
   */
  lastMe: Me | null;
  /** Ask Rust where we stand. Safe to call as often as you like. */
  refresh: () => Promise<void>;
  /** The user asked to leave. The other way a session ends. */
  signOut: () => Promise<void>;
  /** A sign-in flow has started. */
  beginLogin: () => void;
  /** A sign-in flow finished with a user. */
  signedIn: (me: Me) => void;
  /** A sign-in flow failed. */
  loginFailed: (e: unknown) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: { state: "unknown" },
      lastMe: null,

      refresh: async () => {
        try {
          if (!(await scIsLoggedIn())) {
            set({ session: { state: "loggedOut" }, lastMe: null });
            return;
          }
          const me = await scGetMe();
          set({ session: { state: "loggedIn", me }, lastMe: me });
        } catch (e) {
          const failure = asFailure(e);
          // Rust has already cleared the token; there is nothing to keep.
          if (failure.kind === "session-expired") {
            set({ session: { state: "expired" }, lastMe: null });
            return;
          }
          if (isOffline(failure)) {
            set({ session: { state: "offline", me: get().lastMe } });
            return;
          }
          set({ session: { state: "error", failure } });
        }
      },

      signOut: async () => {
        // Optimistic on purpose: the user asked to be signed out, and a keyring
        // that failed to delete is not a reason to leave them looking at their
        // own account. Rust is the source of truth on the next `refresh`.
        set({ session: { state: "loggedOut" }, lastMe: null });
        try {
          await scLogout();
        } catch {
          // Nothing useful to say — the session is already gone from the UI.
        }
      },

      beginLogin: () => set({ session: { state: "loggingIn" } }),
      signedIn: (me) => set({ session: { state: "loggedIn", me }, lastMe: me }),
      loginFailed: (e) => set({ session: { state: "error", failure: asFailure(e) } }),
    }),
    {
      name: "cloudify.session",
      version: 1,
      // The session itself is deliberately not persisted. See `lastMe`.
      partialize: (s) => ({ lastMe: s.lastMe }),
    },
  ),
);

/**
 * Whether the app should show its content rather than a sign-in screen.
 *
 * Offline with a remembered user counts: there is a token, there is a library
 * cached on disk, and the one thing the app cannot do is talk to SoundCloud.
 * Hiding everything behind a sign-in screen for that would be the original bug
 * wearing a different hat.
 */
export function hasSession(session: Session): boolean {
  return session.state === "loggedIn" || (session.state === "offline" && session.me !== null);
}

/** The user to show, if any is known — live or remembered. */
export function sessionUser(session: Session): Me | null {
  if (session.state === "loggedIn") return session.me;
  if (session.state === "offline") return session.me;
  return null;
}
