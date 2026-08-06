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

#### ⚠️ Do not set `WEBKIT_DISABLE_DMABUF_RENDERER=1`

The old advice here (and the old `dev:app` script, and `platform.rs` itself)
paired the X11 fallback with that variable. **It is what made the app crawl on
Linux while Windows, macOS and Android were smooth.**

Since WebKitGTK 2.44 the DMA-BUF renderer is the only accelerated backing store
left — the older Wayland and X11 ones were removed — so disabling it does not
pick a different GPU path, it picks none. All compositing, every `filter` and
every `backdrop-filter` is then rasterised on the CPU on the web process's main
thread: measured here at ~95% of a core for as long as the window was visible,
in an idle app. WebKit reads only whether the variable is *set*, so `=0` does
not undo it — the variable has to be absent.

If some driver stack ever does need it back, run with `CLOUDIFY_DISABLE_DMABUF=1`;
that is the app's own opt-out and it sets WebKit's variable for you.

Symptoms worth recognising, since they look like an app bug: the whole window
janky at a low frame rate, one core pinned by `WebKitWebProcess`, and both
stopping the moment the window is covered up. Check with:

```fish
top -b -H -n 2 -d 2 -p (pgrep -f WebKitWebProcess | head -1)
```

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
