import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What is allowed to end a session, checked where it is cheapest to break.
 *
 * This is the rule task 23 was about, and it is the kind of rule that rots
 * silently: every branch below looks reasonable on its own, and the app only
 * looks broken when the wrong one runs. Signing a user out costs them a browser
 * round trip to get back in, so "we could not reach SoundCloud" must never be
 * read as "SoundCloud rejected you".
 */

const scIsLoggedIn = vi.fn<() => Promise<boolean>>();
const scGetMe = vi.fn();
const scLogout = vi.fn(async () => {});

vi.mock("@/lib/tauri", () => ({
  scIsLoggedIn: () => scIsLoggedIn(),
  scGetMe: () => scGetMe(),
  scLogout: () => scLogout(),
}));

const { useAuthStore, hasSession } = await import("./useAuthStore");

const ME = {
  id: 7,
  username: "solar",
  avatar_url: null,
  permalink_url: null,
  followers_count: null,
};

/** A failure shaped the way `bridge::Failure` arrives over the bridge. */
function failure(kind: string) {
  return { kind, message: `${kind} happened` };
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ session: { state: "unknown" }, lastMe: null });
  scIsLoggedIn.mockResolvedValue(true);
});

describe("refresh", () => {
  it("remembers the user it saw", async () => {
    scGetMe.mockResolvedValue(ME);
    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().session).toEqual({ state: "loggedIn", me: ME });
    expect(useAuthStore.getState().lastMe).toEqual(ME);
  });

  it("keeps the session when the network is gone", async () => {
    scGetMe.mockResolvedValueOnce(ME);
    await useAuthStore.getState().refresh();

    scGetMe.mockRejectedValue(failure("offline"));
    await useAuthStore.getState().refresh();

    const { session, lastMe } = useAuthStore.getState();
    expect(session).toEqual({ state: "offline", me: ME });
    // The whole point: still usable, still signed in, nothing thrown away.
    expect(hasSession(session)).toBe(true);
    expect(lastMe).toEqual(ME);
  });

  it("ends the session only when the token was rejected", async () => {
    scGetMe.mockResolvedValueOnce(ME);
    await useAuthStore.getState().refresh();

    scGetMe.mockRejectedValue(failure("session-expired"));
    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().session).toEqual({ state: "expired" });
    expect(useAuthStore.getState().lastMe).toBeNull();
  });

  /**
   * The three that used to sign people out, because `classify` called every
   * refusal a stale key and `sc_get_me` deleted the token on it.
   */
  it.each(["bot-filtered", "refused", "rate-limited"])(
    "does not sign out on %s",
    async (kind) => {
      scGetMe.mockResolvedValueOnce(ME);
      await useAuthStore.getState().refresh();

      scGetMe.mockRejectedValue(failure(kind));
      await useAuthStore.getState().refresh();

      const { session, lastMe } = useAuthStore.getState();
      expect(session.state).toBe("error");
      // Not signed out, and the user is still remembered for the next attempt.
      expect(session.state).not.toBe("expired");
      expect(lastMe).toEqual(ME);
    },
  );

  it("reports no token as signed out, not as a failure", async () => {
    scIsLoggedIn.mockResolvedValue(false);
    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().session).toEqual({ state: "loggedOut" });
  });

  /**
   * A rejection that is not the typed shape — an older command, or a bridge
   * failure before a command ran. It must not be mistaken for either verdict.
   */
  it("treats an unrecognised rejection as an error, not a sign-out", async () => {
    scGetMe.mockRejectedValue("something went wrong");
    await useAuthStore.getState().refresh();

    expect(useAuthStore.getState().session.state).toBe("error");
  });
});

describe("signOut", () => {
  it("is the other way a session ends", async () => {
    scGetMe.mockResolvedValue(ME);
    await useAuthStore.getState().refresh();
    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState().session).toEqual({ state: "loggedOut" });
    expect(useAuthStore.getState().lastMe).toBeNull();
    expect(scLogout).toHaveBeenCalledOnce();
  });

  it("still signs out in the UI when the keyring refuses", async () => {
    scLogout.mockRejectedValueOnce(new Error("keyring is locked"));
    await useAuthStore.getState().signOut();

    // The user asked to leave. A failed delete is not a reason to keep them
    // looking at their own account.
    expect(useAuthStore.getState().session).toEqual({ state: "loggedOut" });
  });
});

describe("hasSession", () => {
  it("counts offline with a remembered user, and not without one", () => {
    expect(hasSession({ state: "offline", me: ME })).toBe(true);
    expect(hasSession({ state: "offline", me: null })).toBe(false);
    expect(hasSession({ state: "expired" })).toBe(false);
    expect(hasSession({ state: "loggedOut" })).toBe(false);
  });
});
