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

This is a GTK/WebKitGTK ↔ NVIDIA/Wayland incompatibility, not an app bug. Fix —
run GTK through XWayland and disable the DMABUF renderer:

```fish
env GDK_BACKEND=x11 WEBKIT_DISABLE_DMABUF_RENDERER=1 pnpm tauri dev
```

The `pnpm dev:app` script bakes both env vars in, so just use that. These vars
are **Linux/NVIDIA-only workarounds** — they are intentionally NOT set globally
(GDK_BACKEND=x11 system-wide would force every GTK app onto XWayland) and are
not needed for Windows/macOS builds, so plain `pnpm tauri dev` stays the
cross-platform entry point.

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
