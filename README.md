# Cloudify Player

_[Русская версия](README.ru.md)_

A desktop client for SoundCloud — small, fast and yours to theme.
Built with Tauri 2 (Rust core, React frontend): the binary is a few megabytes,
not a bundled browser.

[![CI](https://github.com/solarka892/Cloudify-Player/actions/workflows/ci.yml/badge.svg)](https://github.com/solarka892/Cloudify-Player/actions/workflows/ci.yml)

> **Unofficial client. Not affiliated with SoundCloud.**
> It talks to SoundCloud's internal web API — the same one soundcloud.com uses
> in your browser — because no public API keys have been issued since 2015.
> SoundCloud can change that API at any time and break this app. **Use at your
> own risk.**

## Screenshots

<!-- TODO: drop PNGs into docs/screenshots/ and uncomment.
![Library](docs/screenshots/library.png)
![Search](docs/screenshots/search.png)
![Settings](docs/screenshots/settings.png)
-->

_Coming soon._

## What works

- **Your likes** — the full liked-tracks list, paginated in the background and
  cached for the session.
- **Search** — find tracks across SoundCloud.
- **Player** — play/pause, seek, volume, and a queue: whatever list you played
  from becomes the queue, with autoplay, skip and a jump-to-track panel.
- **Appearance** — dark / light / follow-the-system theme, six accent colours.
- **Sign-in** — reuses your existing SoundCloud web session (see below).

Not there yet: playlists, followings, downloads, HLS-only tracks, users and
playlists in search results.

## Install

Grab a build from [Releases](https://github.com/solarka892/Cloudify-Player/releases):

| Platform | Files |
|----------|-------|
| Linux    | `.AppImage` (portable), `.deb`, `.rpm` |
| Windows  | `.exe` (installer), `.msi` |
| macOS    | `.dmg` (universal — Apple Silicon and Intel) |
| Android  | `.apk` (Android 7+, all ABIs) |

Distributed through GitHub releases only — never through the App Store or Play
Store.

### Android

The APK is signed but not from Play, so Android will ask you to allow installing
from wherever you downloaded it.

Sign-in happens in a webview inside the app rather than in your browser, since
there is no browser profile to read a cookie out of. Playback continues with the
screen off, with controls on the lock screen. Android 13+ asks for notification
permission before those controls can appear — playback works either way.

**Consider it beta.** It builds and installs, but it has had far less use than the
desktop builds. Details and known gaps: [`docs/android.md`](docs/android.md).

### macOS: the app isn't signed

Signing needs a paid Apple Developer account, so Gatekeeper refuses the build
on first launch ("cloudify is damaged"). It isn't. Either right-click the app
and choose **Open**, or clear the quarantine flag once:

```sh
xattr -cr /Applications/cloudify.app
```

### Linux runtime requirements

Audio goes through WebKitGTK → GStreamer, so the codec plugins must be present.
On Arch-likes:

```sh
sudo pacman -S --needed gst-plugins-base gst-plugins-good gst-libav
```

Sign-in stores the token in the OS keyring, which on Linux means a Secret
Service provider (`gnome-keyring`, KWallet's bridge, …) has to be running.

## Sign-in and your data

SoundCloud closed app registration in 2015, so there is no OAuth flow to
implement. Instead the app reuses the session you already have:

1. **Via your browser** — it opens soundcloud.com in your real browser (where
   the anti-bot captcha behaves) and reads the `oauth_token` cookie once you're
   logged in. Firefox-family browsers only for now.
2. **By pasting a token** — copy `oauth_token` from your browser's DevTools.

The token is stored in your OS keyring, never in a file, and never logged.
Nothing is sent anywhere except to SoundCloud itself: there is no backend, no
telemetry, no account.

## Build from source

```sh
pnpm install
pnpm tauri dev      # run
pnpm tauri build    # produce installers for the current platform
```

Full toolchain setup, platform quirks and the NVIDIA/Wayland workaround are in
[docs/dev-setup.md](docs/dev-setup.md). Notes on the reverse-engineered
SoundCloud API live in [docs/sc-api.md](docs/sc-api.md).

## Stack

Tauri 2 · Rust (`reqwest`, `tokio`, `keyring`) · React 18 + TypeScript · Vite ·
Tailwind CSS + shadcn/ui · Zustand

Everything that touches SoundCloud is confined to `src-tauri/src/sc_api/`, so
when the API shifts there is exactly one place to fix.

## Roadmap

Playlists and followings · track downloads · Last.fm scrobbling · Discord Rich
Presence · equaliser · mini-player and global media keys · custom themes ·
Android and iOS builds.

## License

[MIT](LICENSE).
