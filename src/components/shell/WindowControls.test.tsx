import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The window's resize strips, and the one case where they must not exist.
 *
 * They would be invisible if they broke, and both halves are one condition. On
 * Android they would be eight dead hit targets over a window that has no frame
 * to resize; on a desktop, the window launches undecorated and there is no
 * setting to put the system frame back — so if these ever stopped rendering, the
 * window could not be resized by pointer at all.
 *
 * `platform.ts` reads the user agent at module scope, so the mock has to be in
 * place before the module graph is imported — hence `vi.doMock` and a dynamic
 * import inside each test rather than a top-level `import`.
 */

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/lib/platform");
});

function mockPlatform(isAndroid: boolean) {
  vi.doMock("@/lib/platform", () => ({
    isAndroid,
    isApplePlatform: false,
    COMPACT_BREAKPOINT: 768,
  }));
}

describe("WindowControls", () => {
  it("renders nothing on the Android build", async () => {
    mockPlatform(true);
    const { WindowControls } = await import("./WindowControls");
    const { container } = render(<WindowControls />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws eight resize strips and nothing else on a desktop", async () => {
    mockPlatform(false);
    const { WindowControls } = await import("./WindowControls");
    const { container } = render(<WindowControls />);
    // A window missing one of these strips can be resized from every edge but
    // that one.
    expect(container.querySelectorAll("div[aria-hidden]")).toHaveLength(8);
    // Minimise, maximise and close are the window manager's job now.
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
