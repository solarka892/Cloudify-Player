import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The two cases where the app must *not* draw a title bar.
 *
 * Both are one-line conditions and both would be invisible if they broke: on
 * Android an extra 32px strip with a close button appears under the status bar,
 * and with `nativeFrame` on the user gets two title bars stacked. Neither is the
 * kind of thing anyone tests by hand twice.
 *
 * `platform.ts` reads the user agent at module scope, so the mock has to be in
 * place before the module graph is imported — hence `vi.doMock` and a dynamic
 * import inside each test rather than a top-level `import`.
 */

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/platform");
  vi.doUnmock("@/stores/useSettingsStore");
});

/** Stand in for the store, which otherwise pulls in the whole theme engine. */
function mockSettings(nativeFrame: boolean) {
  vi.doMock("@/stores/useSettingsStore", () => ({
    useSettingsStore: (select: (s: unknown) => unknown) => select({ nativeFrame }),
  }));
  vi.doMock("@/stores/useNavStore", () => ({
    useNavStore: (select: (s: unknown) => unknown) =>
      select({ view: "home", detail: null }),
  }));
}

describe("TitleBar", () => {
  it("renders nothing on the Android build", async () => {
    vi.doMock("@/lib/platform", () => ({
      isAndroid: true,
      isApplePlatform: false,
      COMPACT_BREAKPOINT: 768,
    }));
    mockSettings(false);
    const { TitleBar } = await import("./TitleBar");
    const { container } = render(<TitleBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the system frame is switched back on", async () => {
    vi.doMock("@/lib/platform", () => ({
      isAndroid: false,
      isApplePlatform: false,
      COMPACT_BREAKPOINT: 768,
    }));
    mockSettings(true);
    const { TitleBar } = await import("./TitleBar");
    const { container } = render(<TitleBar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws three window buttons on a desktop without decorations", async () => {
    vi.doMock("@/lib/platform", () => ({
      isAndroid: false,
      isApplePlatform: false,
      COMPACT_BREAKPOINT: 768,
    }));
    mockSettings(false);
    const { TitleBar } = await import("./TitleBar");
    const { container } = render(<TitleBar />);
    expect(container.querySelectorAll("[data-window-button]")).toHaveLength(3);
    // And the eight strips that resize a window with no frame to grab.
    expect(container.querySelectorAll("[aria-hidden]").length).toBeGreaterThan(8);
  });
});
