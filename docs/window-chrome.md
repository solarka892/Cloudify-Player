# The app's own window frame

## Полосы окна больше нет. И кнопок тоже

Приложение рисовало свой тайтлбар — 30px с маркой, именем раздела и тремя
кнопками. Он удалён. Он нёс одно слово, которое экран под ним и так говорит,
марку, которая есть в рельсе, и три кнопки; а верхняя кромка окна теперь —
волна играющего трека, и полоса хрома стояла между приложением и его же
подписью.

Три кнопки какое-то время жили дальше — плавали в правом верхнем углу поверх
содержимого — и тоже удалены: над окном без рамки они читались как единственный
кусок чужого интерфейса на экране. Свернуть, развернуть и закрыть — работа
оконного менеджера, и он их и так даёт с клавиатуры и из меню окна: `Alt+F4` и
`Alt+Space` на Windows, свои бинды в композиторе на Linux.

Что осталось (`src/components/shell/WindowControls.tsx`):

- **восемь полос ресайза** по краям — без них окно без рамки тянется только
  хоткеем;
- **перетаскивание** переехало на `ViewHead`: окно таскается за пустое место
  рядом с заголовком экрана. Tauri начинает drag только если атрибут несёт сам
  target, поэтому клик по заголовку или в поле поиска остаётся кликом.

Токены `--chrome-height` и `--chrome-alpha` удалены — их читал только тайтлбар.

---

The window launches with `"decorations": false` and the app no longer draws
anything in their place. This is what that costs, what it needs, and what is
known to work where.

## Why undecorated

The system title bar is a rectangle with rounded corners, a gradient and a set of
round buttons, drawn by the desktop rather than by the app. That is fine under
three of the four skins and fatal under Obsidian, whose entire signature is that
nothing in the interface has a corner radius: every other pixel of it breaks
against a frame it does not control.

## Permissions

In `src-tauri/capabilities/default.json`. `core:default` does **not** include
either of these:

| Permission | Needed by |
| --- | --- |
| `core:window:allow-start-dragging` | `data-tauri-drag-region` on `ViewHead` |
| `core:window:allow-start-resize-dragging` | the eight resize strips |

Both exist in the Android schema as well as the desktop one, so the single
capability file compiles for both targets. The minimise / maximise / close /
is-maximized permissions are still listed there; nothing calls them now, and
they are harmless — but they are also the first thing to delete if the file is
ever tidied.

## Dragging

`data-tauri-drag-region` on `ViewHead`, which also gets double-click-to-maximise
for free. Doing it by hand does not work: `startDragging` hands the pointer to
the compositor and swallows the events a double-click detector would need to see,
so a hand-rolled version gets one or the other and never both.

## Resizing

Losing the decorations also loses the compositor's **invisible resize border**.
`WindowControls` puts it back: eight fixed strips, 4px along each side (what a
decorated border gives) and 8px at each corner, because a 4px corner is not a
target anyone hits. Corners are later in the DOM than the sides they overlap, so
they win the hit test — a window whose corners resize one axis only is the single
most-noticed thing missing from a hand-rolled frame.

Left button only: a right-click on the frame belongs to the window manager.

### Snapping

**Not affected.** Win+arrow, `Super`+drag, and dragging to a screen edge act on
the *window*, not on its frame, and `startResizeDragging` is the same request a
real border makes. There is no snap logic in the app and there should not be.

### Verified

| Platform | Status |
| --- | --- |
| Linux / Hyprland (Wayland) | Developed against. A tiling compositor sizes and closes windows itself, so the strips are mostly unused there; dragging was the thing to check. |
| Linux / floating WM | Expected to work; the strips are the whole mechanism. **Unverified.** |
| Windows | **Unverified.** Worth checking Win+arrow and edge-snap specifically, that the 4px strips are reachable at 150% display scaling, and that `Alt+F4` closes the window — it is now the only way to. |
| macOS | Not attempted. Do not hand-roll it there — the platform answer is `titleBarStyle: "Overlay"` plus a left inset for the system buttons, and macOS is P3. |
| Android | No frame at all. `hasWindowChrome` is `false`, `WindowControls` returns `null`, and the shells keep using `pt-safe`/`pb-safe` for the status and gesture bars. A test asserts this. |

## The escape hatch

Возврата к системной рамке нет. Настройка `nativeFrame` была — как
аварийный выход для композитора, который плохо обращается с окном без
рамки, — и удалена: приложение рисует свою рамку, и точка. Цена — на
такой машине нет внутриприложенческого лекарства; выигрыш — одно окно,
одна рамка и ни одного пути, где рисуются две или ноль.

## `src/lib/window.ts`

Everything above goes through this module rather than importing
`@tauri-apps/api/window` directly, for two reasons: none of it exists on Android,
and half of it does not exist in a browser tab (`vitest`, `vite preview`). Every
function resolves to a no-op instead of throwing, so the frame can call them
unconditionally.

Each imports the API lazily. A static import would pull the window plugin into the
Android bundle for code that can never run there; with the dynamic import it comes
out as its own chunk.
