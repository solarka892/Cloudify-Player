# Android

Notes on the Android target: how to build it, and what had to be done
differently because the platform gives us less than the desktop does.

## Toolchain

Everything lives under `~/Android` so nothing needs root and the whole lot can be
removed with `rm -rf ~/Android`.

```bash
# JDK 17+ (Arch: `pacman -S jdk17-openjdk`), then:
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/27.1.12297006"
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk

# Command-line tools, unpacked to $ANDROID_HOME/cmdline-tools/latest/
sdkmanager --sdk_root="$ANDROID_HOME" \
  platform-tools "platforms;android-35" "build-tools;35.0.0" "ndk;27.1.12297006"

rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

`src-tauri/gen/android/` was generated once with `pnpm tauri android init` and is
**committed** from then on, because it carries the Kotlin described below. Do not
re-run `init` casually: it rewrites files in there.

## Building

```bash
pnpm tauri android build --apk                      # all four ABIs, release
pnpm tauri android build --target aarch64 --apk     # arm64 only, much faster
pnpm tauri android build --debug --target aarch64 --apk
pnpm tauri android dev                              # needs a device or emulator
```

Output lands in
`src-tauri/gen/android/app/build/outputs/apk/universal/<buildType>/`.

Gradle has to drive the Rust build (it shells back out to the Tauri CLI over a
websocket the CLI serves), so `./gradlew assemble…` on its own fails at
`:app:rustBuildArm64Debug`. Always go through `pnpm tauri android build`.

### Signing

Release APKs are signed from `src-tauri/gen/android/keystore.properties`, which
points at a keystore beside it. Both are gitignored. Without them the release
build still succeeds and produces an *unsigned* APK — useful for checking that R8
has not broken anything, but Android will refuse to install it.

```bash
cd src-tauri/gen/android
keytool -genkeypair -v -keystore cloudify-signing.jks -alias cloudify \
  -keyalg RSA -keysize 4096 -validity 10950
cat > keystore.properties <<EOF
storeFile=cloudify-signing.jks
storePassword=…
keyAlias=cloudify
keyPassword=…
EOF
```

Keep that keystore. Android identifies an app by its signature, so signing a
later release with a different key means every user has to uninstall first.

### If Gradle cannot download its dependencies

On some networks Gradle's HTTP client gets TLS connections reset partway through
a transfer — `Remote host terminated the handshake` — while `curl` fetches the
same URLs without trouble. `gradle.properties` already pins TLS 1.2, raises the
socket timeout and asks for more retries, which is usually enough.

If it still fails, seed the cache by hand. Gradle finds an artifact by hashing
what is on disk, so a correctly-placed file needs no accompanying metadata:

```bash
# for https://host/…/<group as path>/<module>/<version>/<file>
sha=$(curl -fsSL "$url" | tee /tmp/a | sha1sum | cut -d' ' -f1)
install -D /tmp/a ~/.gradle/caches/modules-2/files-2.1/<group>/<module>/<version>/$sha/<file>
```

## What Android needed that the desktop did not

Three things have no portable Rust answer, so they are Kotlin in
`gen/android/app/src/main/java/com/cloudifyplayer/app/`, reached from
`src-tauri/src/android/mod.rs` over Tauri's mobile-plugin bridge. The pairing is
**by string**: a renamed `@Command` is a runtime failure, not a compile error.

| Concern | Kotlin | Why |
| --- | --- | --- |
| Token storage | `SecureStore.kt` | The `keyring` crate has no Android backend. AES-GCM under a non-extractable Android Keystore key; ciphertext in SharedPreferences. |
| Sign-in | `LoginActivity.kt` | Tauri cannot open a second window on mobile, and the api-v2 bearer only exists as the web app's `oauth_token` cookie — so a native `WebView` shows the page and `CookieManager` reads the cookie (it sees HttpOnly, unlike JS). |
| Background playback | `PlaybackService.kt` | Android starves and then freezes a backgrounded WebView, so audio dies on screen-off. A foreground service with a `MediaSession` keeps the process alive and owns the lock-screen controls. |

The service plays nothing itself — the WebView does. It exists to hold the
process in the foreground and to forward transport commands back to the frontend
(`plugin:cloudify|mediaAction` → `src/lib/nativeMedia.ts`).

**R8 cannot see any of this being used**, since Rust finds the plugin class by
name and Tauri dispatches its commands reflectively. `app/proguard-rules.pro`
keeps them. Getting those rules wrong breaks only the *release* build — a debug
APK works fine, which is exactly how it would reach a user.

### Sign-in, in practice

The captcha that blocks the desktop's embedded webview is a WebKitGTK
fingerprinting problem. Android's WebView is Chromium, so it usually passes; the
only adjustment is dropping `; wv` from the user agent, which otherwise
advertises "I am a WebView". `navigator.*` is left alone — tampering with it is
what anti-fraud actually detects.

There is no browser-cookie flow on Android (`sc_login_browser` returns an
explanatory error there): no other browser's profile is readable.

## Frontend differences

- `src/lib/platform.ts` — `isAndroid`, from the user agent.
- `useCompact()` (Tailwind's `md`, 768px) drives a bottom tab bar and a compact
  player bar. Deliberately a viewport question, not a platform one: a narrow
  desktop window wants the same layout, a landscape tablet does not.
- The full-screen `NowPlaying` view is the only place seeking, shuffle, repeat,
  queue and lyrics appear on a phone; the compact bar is a launcher for it.
- `viewport-fit=cover` plus the `pt-safe`/`pb-safe` utilities keep content out
  from under the status bar and the gesture bar, since `MainActivity` draws edge
  to edge.

## Known gaps

- **Not verified on hardware.** Everything here compiles and the APK installs,
  but the Kotlin paths — Keystore, cookie capture, the foreground service — have
  not been exercised on a real device.
- `POST_NOTIFICATIONS` is declared but never requested at runtime, so on Android
  13+ the transport notification will not appear until the user grants it in
  system settings. Playback itself is unaffected.
- Downloads land in the app's private storage, so other apps cannot see them.
- No iOS. `gen/apple` has never been generated.
