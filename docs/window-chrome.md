# The app's own window frame

The window launches with `"decorations": false` and the app draws its own title
bar. This is what that costs, what it needs, and what is known to work where.

## Why

The system title bar is a rectangle with rounded corners, a gradient and a set of
round buttons, drawn by the desktop rather than by the app. That is fine under
three of the four skins and fatal under Obsidian, whose entire signature is that
nothing in the interface has a corner radius: every other pixel of it breaks
against a frame it does not control.

## Why it is not gated on the skin

**A title bar belongs to the window, not to the look.** The window is undecorated
from launch, for every skin and every user — so if `TitleBar` rendered only under
Obsidian, three of four skins would have no way to close the app.

It is built entirely from tokens and reads correctly in all four. `--chrome-height`
is the same 32px everywhere; only `--chrome-alpha` differs, so the bar is a little
more present in Aurora than in Obsidian.

It also wraps **every** branch of `App` — the pre-auth login screen and the blank
frame shown while the session is being checked included. A bar that appeared only
once signed in would leave an uncloseable window on the way there, which is the
kind of thing that gets found by the first person to open the app without a
network.

## Permissions

In `src-tauri/capabilities/default.json`. `core:default` does **not** include any
of these:

| Permission | Needed by |
| --- | --- |
| `core:window:allow-minimize` | the minimise button |
| `core:window:allow-toggle-maximize` | the maximise button, and double-clicking the bar |
| `core:window:allow-is-maximized` | choosing between the maximise and restore glyphs |
| `core:window:allow-close` | the close button |
| `core:window:allow-start-dragging` | `data-tauri-drag-region` |
| `core:window:allow-start-resize-dragging` | the eight resize strips |
| `core:window:allow-set-decorations` | the "native window frame" setting |

All seven exist in the Android schema as well as the desktop one, so the single
capability file compiles for both targets.

## Dragging and double-click

Both come from `data-tauri-drag-region` on the bar. Doing it by hand does not
work: `startDragging` hands the pointer to the compositor and swallows the events
a double-click detector would need to see, so a hand-rolled version gets one or
the other and never both. Tauri's own handler does the drag on pointer-down and
toggles maximise on double-click.

The three buttons are outside the region, so a click on one is a click.

The maximise glyph is driven by `onResized` rather than by the button, because
Win+Up, dragging to the top of the screen and a double-click on the bar all
maximise the window without passing through our code.

## Resizing

Losing the decorations also loses the compositor's **invisible resize border**.
`WindowEdges` puts it back: eight absolutely-positioned strips, 4px along each
side (what a decorated border gives) and 8px at each corner, because a 4px corner
is not a target anyone hits. Corners are later in the DOM than the sides they
overlap, so they win the hit test — a window whose corners resize one axis only is
the single most-noticed thing missing from a hand-rolled frame.

Left button only: a right-click on the frame belongs to the window manager.

### Snapping

**Not affected.** Win+arrow, `Super`+drag, and dragging to a screen edge act on
the *window*, not on its frame, and `startResizeDragging` is the same request a
real border makes. There is no snap logic in the app and there should not be.

### Verified

| Platform | Status |
| --- | --- |
| Linux / Hyprland (Wayland) | Developed against. A tiling compositor sizes windows itself, so the strips are mostly unused there; dragging, the three buttons and the setting were the things to check. |
| Linux / floating WM | Expected to work; the strips are the whole mechanism. **Unverified.** |
| Windows | **Unverified.** Worth checking Win+arrow and edge-snap specifically, and that the 4px strips are reachable at 150% display scaling. |
| macOS | Not attempted. Do not hand-roll it there — the platform answer is `titleBarStyle: "Overlay"` plus a left inset for the system buttons, and macOS is P3. |
| Android | No frame at all. `hasWindowChrome` is `false`, `TitleBar` returns `null`, and the shells keep using `pt-safe`/`pb-safe` for the status and gesture bars. A test asserts this. |

## The escape hatch

`nativeFrame` in Settings → Window puts the system frame back, live, via
`setDecorations`. It exists because everything above can fail on a compositor
nobody tested: an unusual WM, a remote session, a scaling factor that makes the
strips unhittable. Somebody who cannot resize or move their window must not have
to restart to fix it, and must not have to find a config file.

Two deliberate details:

- **Default off**, so the window launches undecorated and there is no visible
  re-frame at startup for the common case. Only the minority who ask for the
  system frame pay for a flip, and they pay it once per launch.
- **Not part of `ThemeState`.** It lives at the top level of the settings store,
  which means it is not carried by an exported theme file. Importing someone
  else's theme must never be able to take your window's controls away.

## `src/lib/window.ts`

Everything above goes through this module rather than importing
`@tauri-apps/api/window` directly, for two reasons: none of it exists on Android,
and half of it does not exist in a browser tab (`vitest`, `vite preview`). Every
function resolves to a no-op instead of throwing, so the title bar can call them
unconditionally.

Each imports the API lazily. A static import would pull the window plugin into the
Android bundle for code that can never run there; with the dynamic import it comes
out as its own ~14kB chunk.
