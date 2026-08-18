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

/**
 * A working `localStorage`, because the one in scope is not jsdom's.
 *
 * Node ships its own `localStorage` global now, and it is present but unusable
 * unless the process was started with `--localstorage-file` — which is where the
 * "localStorage is not available" warning in the test output comes from. Being
 * present is enough to win: `zustand/persist` resolves the bare global and gets
 * Node's broken one rather than the working one on `window`, and any store with
 * `persist` on it then throws `Cannot read properties of undefined` on its first
 * write. Every persisted store in this app is affected, not only the one whose
 * test found it.
 *
 * An in-memory map rather than a passthrough to `window.localStorage`: tests
 * should not be able to leak state into each other through the disk.
 */
if (!globalThis.localStorage?.setItem) {
  const cells = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return cells.size;
    },
    key: (i) => [...cells.keys()][i] ?? null,
    getItem: (k) => cells.get(k) ?? null,
    setItem: (k, v) => void cells.set(k, String(v)),
    removeItem: (k) => void cells.delete(k),
    clear: () => cells.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
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
