import { beforeEach, describe, expect, it } from "vitest";
import { canGoBack, useNavStore } from "./useNavStore";
import type { Playlist, Track, User } from "@/lib/tauri";

/**
 * Navigation history.
 *
 * Worth testing because it is the one part of the app four different inputs
 * share — the Android back gesture, a mouse button, Alt+← and an edge swipe —
 * and the one that decides whether the *system* back leaves the app. Getting
 * "there is nowhere to go" wrong means either a gesture that does nothing or an
 * app that quits mid-browse, and neither shows up until it is on a phone.
 */

const track = { id: 1, title: "T", artist: "A", permalink_url: null } as Track;
const user = { id: 2, username: "U", permalink_url: null } as User;
const playlist = { id: 3, title: "P", owner: "A", permalink_url: null } as Playlist;

beforeEach(() => {
  useNavStore.setState({
    view: "home",
    detail: null,
    past: [],
    future: [],
    nowPlaying: false,
  });
});

describe("back", () => {
  it("reports that there is nowhere to go from the first screen", () => {
    // The bit Android reads. False here is what lets the gesture leave the app.
    expect(canGoBack(useNavStore.getState())).toBe(false);
    expect(useNavStore.getState().back()).toBe(false);
  });

  it("retraces a drill-down one step at a time", () => {
    const nav = useNavStore.getState();
    nav.setView("search");
    nav.openUser(user);
    nav.openTrack(track);

    expect(useNavStore.getState().detail?.kind).toBe("track");
    expect(canGoBack(useNavStore.getState())).toBe(true);

    useNavStore.getState().back();
    expect(useNavStore.getState().detail?.kind).toBe("user");

    useNavStore.getState().back();
    expect(useNavStore.getState().detail).toBeNull();
    expect(useNavStore.getState().view).toBe("search");

    useNavStore.getState().back();
    expect(useNavStore.getState().view).toBe("home");
    expect(useNavStore.getState().back()).toBe(false);
  });

  it("closes the full-screen player before it goes anywhere", () => {
    const nav = useNavStore.getState();
    nav.openPlaylist(playlist);
    useNavStore.setState({ nowPlaying: true });

    expect(useNavStore.getState().back()).toBe(true);
    expect(useNavStore.getState().nowPlaying).toBe(false);
    // And the playlist is still open: the sheet was over it, not instead of it.
    expect(useNavStore.getState().detail?.kind).toBe("playlist");
  });

  it("does not record going where you already are", () => {
    const nav = useNavStore.getState();
    nav.setView("library");
    nav.setView("library");
    nav.setView("library");
    expect(useNavStore.getState().past).toHaveLength(1);
  });
});

describe("forward", () => {
  it("returns to what back stepped out of", () => {
    useNavStore.getState().setView("search");
    useNavStore.getState().back();
    expect(useNavStore.getState().view).toBe("home");

    expect(useNavStore.getState().forward()).toBe(true);
    expect(useNavStore.getState().view).toBe("search");
    expect(useNavStore.getState().forward()).toBe(false);
  });

  it("is abandoned by taking a different route", () => {
    useNavStore.getState().setView("search");
    useNavStore.getState().back();
    useNavStore.getState().setView("library");

    expect(useNavStore.getState().future).toHaveLength(0);
    expect(useNavStore.getState().forward()).toBe(false);
  });
});
