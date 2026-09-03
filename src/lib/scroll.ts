/**
 * The main scroll container, reachable from anywhere.
 *
 * Views render inside a scroller they don't own (`AppShell`'s `<main>`), and a
 * single-page app keeps that offset across a navigation unless something puts
 * it back — which is how a short tab ends up scrolled past its own content and
 * looks blank. Whoever changes what is on screen calls `scrollViewToTop`.
 */

let scroller: HTMLElement | null = null;

/** Called by the shell with its scrolling element, and with null on unmount. */
export function setViewScroller(el: HTMLElement | null): void {
  scroller = el;
}

export function scrollViewToTop(): void {
  // Instantly, not smoothly: this follows a click that already replaced the
  // content, so animating it would only show the user a blur of the old page.
  scroller?.scrollTo({ top: 0, behavior: "instant" });
}

export function scrollViewToBottom(): void {
  // Instant for the same reason as above, and for one more: a smooth run down a
  // list of 1328 rows rebuilds the rendered window on every frame of the way
  // there. The app has no `scroll-behavior: smooth` anywhere, on purpose.
  scroller?.scrollTo({ top: scroller.scrollHeight, behavior: "instant" });
}

/** The element itself, for a component that has to watch it scroll. */
export function getViewScroller(): HTMLElement | null {
  return scroller;
}
