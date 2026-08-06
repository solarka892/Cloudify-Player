# Dev setup

## Prerequisites (Arch / CachyOS)

```fish
# JS toolchain + Rust + Tauri Linux deps
sudo pacman -S --needed pnpm rustup webkit2gtk-4.1 base-devel curl wget file openssl librsvg gtk3
rustup default stable
```

(`base-devel`, `openssl`, `librsvg`, `gtk3` are usually already installed.)

Install project deps:

```fish
pnpm install
```

> pnpm 11+ blocks dependency build scripts by default. `esbuild` (needed by
> Vite) is allow-listed in `pnpm-workspace.yaml` (`allowBuilds`), so `pnpm
> install` runs its postinstall without an interactive `pnpm approve-builds`.

## Running the app

```fish
pnpm dev:app        # recommended on this machine (see below)
# or, plain:
pnpm tauri dev
```

### ⚠️ NVIDIA + Wayland: WebKitGTK crash

On this laptop (NVIDIA RTX 4060, Hyprland/Wayland) a plain `pnpm tauri dev`
crashes at window creation with:

```
Gdk-Message: Error 71 (Protocol error) dispatching to Wayland display.
```

This is a GTK/WebKitGTK ↔ NVIDIA/Wayland incompatibility, not an app bug. The
fix is to run GTK through XWayland, and **the binary applies it itself** — see
`src-tauri/src/platform.rs`, which sets `GDK_BACKEND=x11` when it finds NVIDIA
on a Wayland session and leaves an explicit choice alone. Nothing to type:
`pnpm dev:app` and `pnpm tauri dev` are now the same command.

#### There is no GPU here, and the app knows it

`platform.rs` also sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on NVIDIA, and that
one is not optional. Since WebKitGTK 2.44 the DMA-BUF renderer is the only
accelerated backing store left — the older Wayland and X11 ones were removed —
so the variable does not pick a different GPU path, it picks none at all.
Leaving the renderer enabled on this machine gets

```
Failed to create GBM buffer of size 1100x720: Invalid argument
```

and an **empty window**. NVIDIA's GBM will not hand WebKit the buffer it wants,
there is no second GPU in this laptop to ask instead, and neither
`WEBKIT_DMABUF_RENDERER_USE_GBM=0` nor the native Wayland backend changes it.
Software rendering is the only configuration that draws.

WebKit reads only whether that variable is *set*, so `=0` does not undo it. The
one thing worth keeping straight: it is applied **only on NVIDIA**. An AMD or
Intel machine on Wayland keeps its GPU — the old code disabled the renderer for
everybody.

Because a CPU-painted window makes any never-ending animation expensive, the app
tells the frontend which path it is on: `platform::is_software_rendering()` puts
`data-render="software"` on `<html>`, and `globals.css` stops Obsidian's light
from drifting under that attribute. See `design-obsidian.md`.

Symptoms worth recognising, since they look like a driver problem rather than an
app bug: the whole window janky at a low frame rate, one core pinned by
`WebKitWebProcess`, and both stopping the moment the window is covered up (a
hidden window is not painted, so the cost vanishes with it). Check with:

```fish
top -b -H -n 2 -d 2 -p (pgrep -f WebKitWebProcess | head -1)
```

If that shows a pinned core again, the thing to look for is a CSS animation or a
`requestAnimationFrame` loop that never ends — on this renderer each frame is a
full repaint, and one of them is enough to saturate a core.

First `tauri dev` compiles the whole Rust/Tauri tree (~1 min). Subsequent runs
are incremental (seconds).

### Audio playback (GStreamer) — required

WebKitGTK plays HTML5 audio through GStreamer. **These plugins are required** —
without them the audio pipeline fails to build (`autoaudiosink not found`),
which crashes the WebKit process and blanks the window (not just silence):

```fish
sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
```

`autoaudiosink` is in `gst-plugins-good`; the mp3 decoder is in `gst-libav`.

### Login / keyring requirement

OAuth tokens are stored via the `keyring` crate → on Linux this uses the
**Secret Service** (D-Bus). A provider must be running, e.g. `gnome-keyring`
(`gnome-keyring-daemon`) or KWallet's secretservice bridge. If sign-in fails
with a keyring/Secret Service error, no provider is running:

```fish
sudo pacman -S --needed gnome-keyring
# ensure it starts in the session (PAM or your compositor autostart)
```

## Recon script

The SoundCloud api-v2 probe is standalone, stdlib-only Python:

```fish
python3 recon/sc_recon.py         # or --json / --query "..."
```
