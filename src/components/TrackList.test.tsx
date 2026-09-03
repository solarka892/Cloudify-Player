import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrackList } from "./TrackList";
import { usePlayerStore } from "@/stores/usePlayerStore";
import { useLibraryStore } from "@/stores/useLibraryStore";
import { useDownloadsStore } from "@/stores/useDownloadsStore";
import type { Track } from "@/lib/tauri";
import { t } from "@/i18n";

/**
 * The row and the controls inside it, which must not set each other off.
 *
 * The row is one big "play this" target and it contains the heart, the
 * download, repost, share and queue. Two things went wrong there, and only one
 * of them was the nesting: a control that shrank while it was held moved out
 * from under the pointer, so the release landed on the row and the browser
 * handed the click to the row — with the row as the target. The heart did not
 * fire and the track played instead. Measured in a browser rather than guessed;
 * `.press-glyph` in `globals.css` carries the numbers.
 *
 * Neither half is reproducible by clicking in jsdom, which has no layout and no
 * hit testing. So what is pinned here is the shape that made it possible — a
 * control that carries a transform, a row that trusts the click's target — plus
 * the guard that catches the retargeted click when it arrives anyway.
 */

const track: Track = {
  id: 1,
  duration: 191_000,
  title: "Glue",
  artwork_url: null,
  permalink_url: "https://soundcloud.com/bicep/glue",
  artist: "Bicep",
};

/** The row itself: a div with the role, not an element with the tag. */
function row(container: HTMLElement): HTMLElement {
  const node = container.querySelector<HTMLElement>('[role="button"]');
  if (!node) throw new Error("no row rendered");
  return node;
}

let playTrack: ReturnType<typeof vi.fn>;
let toggleLike: ReturnType<typeof vi.fn>;
let startDownload: ReturnType<typeof vi.fn>;
let removeDownload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  playTrack = vi.fn(() => Promise.resolve());
  toggleLike = vi.fn(() => Promise.resolve());
  usePlayerStore.setState({ playTrack });
  // Reset, not just stub: the heart's label is its state, and a like left over
  // from the test before it renames the button the next one is looking for.
  useLibraryStore.setState({ likedIds: new Set<number>(), toggleLike });
  startDownload = vi.fn(() => Promise.resolve());
  removeDownload = vi.fn(() => Promise.resolve());
  useDownloadsStore.setState({
    ids: new Set<number>(),
    active: {},
    start: startDownload,
    remove: removeDownload,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrackList", () => {
  it("gives the row a button's role without nesting one button in another", () => {
    const { container } = render(<TrackList tracks={[track]} />);

    expect(row(container).tagName).toBe("DIV");
    // The heart, the download, repost, share, queue: siblings of the row's
    // content, never descendants of a clickable ancestor.
    expect(container.querySelectorAll("button button, button a")).toHaveLength(
      0,
    );
  });

  it("gives its controls a press that cannot move the hit target", () => {
    const { container } = render(<TrackList tracks={[track]} />);

    // A control may animate, but only through the glyph inside it. Any scale on
    // the button itself takes the button out from under the pointer mid-press,
    // and the click then goes to the row.
    for (const control of container.querySelectorAll("button")) {
      expect(control.className).not.toMatch(/scale/);
    }
  });

  it("likes the track without touching the player", () => {
    render(<TrackList tracks={[track]} />);

    fireEvent.click(screen.getByLabelText(t.track.like));

    expect(toggleLike).toHaveBeenCalledWith(track);
    expect(playTrack).not.toHaveBeenCalled();
  });

  it("declines a click the browser handed it because a control moved", () => {
    const { container } = render(<TrackList tracks={[track]} />);
    const heart = screen.getByLabelText(t.track.like);

    // The press began on the heart and the click arrived at the row, which is
    // exactly what a shrinking control did on macOS. The row must sit still:
    // by the time this arrives there is no control left in the event to spot,
    // so only the press can tell the row that this click is not for it.
    fireEvent.pointerDown(heart);
    fireEvent.click(row(container));

    expect(playTrack).not.toHaveBeenCalled();
  });

  it("plays the track when the press and the click both landed on the row", () => {
    const { container } = render(<TrackList tracks={[track]} />);

    // The guard above must not swallow the ordinary case.
    fireEvent.pointerDown(row(container));
    fireEvent.click(row(container));

    expect(playTrack).toHaveBeenCalledTimes(1);
    expect(playTrack).toHaveBeenCalledWith(track, [track]);
  });

  it("downloads a track that has no copy yet", () => {
    render(<TrackList tracks={[track]} />);

    fireEvent.click(screen.getByLabelText(t.player.download));

    expect(startDownload).toHaveBeenCalledWith(track);
    expect(playTrack).not.toHaveBeenCalled();
  });

  it("deletes the copy when the track already has one", () => {
    useDownloadsStore.setState({ ids: new Set([track.id]) });
    render(<TrackList tracks={[track]} />);

    // Same glyph, same place — the row is where you notice you no longer want
    // the copy, and it was the one screen with no way to say so.
    fireEvent.click(screen.getByLabelText(t.downloads.remove));

    expect(removeDownload).toHaveBeenCalledWith(track.id);
    expect(startDownload).not.toHaveBeenCalled();
    expect(playTrack).not.toHaveBeenCalled();
  });

  it("shows the progress instead of the button while a download runs", () => {
    const setPaused = vi.fn(() => Promise.resolve());
    useDownloadsStore.setState({
      active: {
        [track.id]: {
          trackId: track.id,
          title: track.title,
          received: 1,
          total: 2,
          error: null,
          paused: false,
        },
      },
      setPaused,
    });
    render(<TrackList tracks={[track]} />);

    // The download button is gone while there is a download to show, so there
    // is nothing in the row that could start a second one.
    expect(screen.queryByLabelText(t.player.download)).not.toBeInTheDocument();

    const ring = screen.getByLabelText(t.downloads.pause);
    expect(ring.title).toContain("50%");

    fireEvent.click(ring);
    expect(setPaused).toHaveBeenCalledWith(track.id, true);
    expect(playTrack).not.toHaveBeenCalled();
  });

  it("offers to resume a download that is holding", () => {
    useDownloadsStore.setState({
      active: {
        [track.id]: {
          trackId: track.id,
          title: track.title,
          received: 1,
          total: 4,
          error: null,
          paused: true,
        },
      },
    });
    render(<TrackList tracks={[track]} />);

    expect(screen.getByLabelText(t.downloads.resume)).toBeInTheDocument();
  });

  it("keeps an unliked row on screen while it fades, then drops it", () => {
    vi.useFakeTimers();
    const second: Track = { ...track, id: 2, title: "Opal" };
    const { container, rerender } = render(
      <TrackList tracks={[track, second]} />,
    );

    // What unliking a track does to the likes list: the row is simply not in
    // the data any more. Without the wait it vanished between two frames and
    // the rows under it jumped up by their own height.
    rerender(<TrackList tracks={[second]} />);

    expect(container.querySelectorAll(".row-leave")).toHaveLength(1);
    expect(screen.getByText("Glue")).toBeInTheDocument();

    act(() => void vi.advanceTimersByTime(240));

    expect(container.querySelectorAll(".row-leave")).toHaveLength(0);
    expect(screen.queryByText("Glue")).not.toBeInTheDocument();
  });

  it("does not animate a list that was replaced wholesale", () => {
    vi.useFakeTimers();
    const many = (from: number) =>
      Array.from({ length: 8 }, (_, i) => ({
        ...track,
        id: from + i,
        title: `Track ${from + i}`,
      }));
    const { container, rerender } = render(<TrackList tracks={many(1)} />);

    // A tab opening, a search answering, a filter narrowing: nobody asked the
    // list a question about one row, and fading eight in at once is a screen
    // flickering rather than a row arriving.
    rerender(<TrackList tracks={many(100)} />);

    expect(container.querySelectorAll(".row-leave")).toHaveLength(0);
    expect(container.querySelectorAll(".row-enter")).toHaveLength(0);
  });

  it("plays on Enter and on Space, and Space does not scroll the list", () => {
    const { container } = render(<TrackList tracks={[track]} />);

    fireEvent.keyDown(row(container), { key: "Enter" });
    expect(playTrack).toHaveBeenCalledTimes(1);

    // `false` from `dispatchEvent` means the default was prevented — here, the
    // page-down that Space performs on a scroll container.
    expect(fireEvent.keyDown(row(container), { key: " " })).toBe(false);
    expect(playTrack).toHaveBeenCalledTimes(2);
  });

  it("keeps the row reachable by keyboard", () => {
    const { container } = render(<TrackList tracks={[track]} />);

    expect(row(container)).toHaveAttribute("tabindex", "0");
  });
});
