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

- **Your library** — eight sections, each with its own filter: likes, playlists,
  albums, reposts, followings, stations, history and downloads.
- **Search** — tracks, playlists, albums and people, or all of them at once.
- **Player** — play/pause, seek, volume, and a queue: whatever list you played
  from becomes the queue, with autoplay, skip and a jump-to-track panel. Tracks
  SoundCloud serves only as HLS play like any other.
- **Sound** — a ten-band equaliser with presets, preamp, balance, crossfade and
  loudness levelling.
- **Offline** — download tracks and play them with no network at all; the app
  stays usable signed in and disconnected.
- **A full-screen player** — cover, lyrics (from LRCLIB), and lighting you
  choose: a glow lifted off the sleeve's own colours, or the cover blurred
  across the window.
- **Diary** — what you played, folded by day.
- **Appearance** — five skins, seventeen palettes, three layouts, ten languages,
  and a window frame the app draws itself. See [Looks](#looks).
- **A command palette** (Cmd/Ctrl-K) and hotkeys throughout.
- **Sign-in** — reuses your existing SoundCloud web session (see below).

Messages and notifications are there to read. Sending a message is not: the
endpoint for it is not one an unofficial client gets to call.

## Looks

Appearance is three independent axes, and every combination of them is valid:

- **Layout** — icon rail, top tabs or a wide sidebar.
- **Skin** — form only: corner radius, blur, shadows, type and motion.
- **Palette** — colour only, seventeen of them, dark and light variants each.

Five skins ship:

| Skin | |
|------|--|
| **One** | One typeface, soft corners, quiet depth. The default. |
| **Nit** | Two inks, square cards, round controls. |
| **Editorial** | Large type, hard lines, no shadows. |
| **Studio** | Tactile controls, careful depth, a waveform. |
| **Obsidian** | Black glass, hairlines, hard edges. |

**Obsidian** is the one that goes furthest. True black, panels barely two percent
lighter than the page, a corner radius of exactly zero on everything —
buttons, covers, avatars, the progress handle — and no colour anywhere, cover art
included: it is desaturated to a single tone so a bright album is texture rather
than a colour cast. The app draws its own 32px title bar instead of the system's,
and one blurred arc of white light behind the interface is the only thing lighting
the glass. Settings → Appearance → **Ready-made looks** sets it up in one press.

<!-- TODO: docs/screenshots/obsidian.png — the window on a dark desktop, glass on.
![Obsidian](docs/screenshots/obsidian.png)
-->

Design notes and the reasoning behind Obsidian:
[docs/design-obsidian.md](docs/design-obsidian.md). The custom window frame,
including how to get the system one back if your compositor dislikes it:
[docs/window-chrome.md](docs/window-chrome.md).

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

1. **In a window cloudify opens itself** — SoundCloud's real sign-in page, in a
   window whose cookies belong to the app. No browser profile is touched. A
   captcha may appear once; answering one is a thing a person can do. **This is
   the first offer on macOS**, where it runs on WKWebView — Safari's own engine.
2. **Via your browser** — it opens soundcloud.com in the browser you already use
   and reads the `oauth_token` cookie back out of it once you are signed in.
   That works for Firefox, Zen, LibreWolf and Waterfox, and for Safari only if
   cloudify has been given Full Disk Access — the app offers a button that opens
   the right settings pane. Chromium-family browsers encrypt their cookies with
   a key in the OS keychain, so they are out. **The first offer everywhere but
   macOS**, since it asks the least of you.
3. **By pasting a token** — copy `oauth_token` from your browser's DevTools. It
   always works and it is the fallback, not an equal option.

The app says up front when a route cannot work on your machine, rather than
opening a browser and timing out three minutes later.

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

Last.fm scrobbling · Discord Rich Presence · a mini-player and global media keys
(the ones that work while another window has focus) · themes as files you can
share · repairing the mangled titles reuploads come with · an iOS build.

## License

[MIT](LICENSE).
