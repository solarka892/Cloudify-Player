import "@testing-library/jest-dom/vitest";

/**
 * jsdom has no `matchMedia`, and the theme engine asks for one at import time —
 * "follow the system" is a real setting, so `useSettingsStore` subscribes to the
 * colour-scheme query as soon as the module is evaluated. Any test that reaches
 * a store which reaches settings (which is most of them, transitively through
 * the player) would otherwise fail on the import rather than on anything it
 * meant to check.
 *
 * Answers "not dark" and never changes, which is the right default for a test:
 * nothing here should depend on the machine's appearance.
 */
/**
 * The Tauri bridge, stubbed to the smallest thing that can be imported.
 *
 * `@tauri-apps/api` reads `window.__TAURI_INTERNALS__` the moment anything calls
 * `invoke` or `listen`, and several stores subscribe to a Rust event as they are
 * constructed — so importing a module that transitively reaches one throws
 * before a single assertion runs. `invoke` resolves rather than rejects on
 * purpose: a rejection here becomes an unhandled promise in a store that had no
 * reason to expect one.
 *
 * Nothing under test asserts on what the backend returns; a test that needs a
 * real answer should mock the specific function it calls.
 */
const internals = "__TAURI_INTERNALS__" as const;
if (!(internals in window)) {
  (window as unknown as Record<string, unknown>)[internals] = {
    invoke: () => Promise.resolve(undefined),
    transformCallback: () => 0,
  };
}

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
