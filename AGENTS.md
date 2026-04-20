# AGENTS.md

Operational notes for agents working on this repo inside the devcontainer. Codebase conventions live in the code itself; this file is only for environment quirks and workflows that aren't obvious.

## Verifying UI changes

- **Android:** use `adb` against a physical device. iOS is not supported in this environment.
- **Web:** use Playwright MCP against the Expo web dev server.

Per user preference: skip iOS.

## adb: talk to a device through the host Mac

The devcontainer **cannot run an Android emulator** — `x86_64` AVDs need KVM / `/dev/kvm`, which isn't available. Trying `emulator -avd ...` fails with:

```
ERROR | x86_64 emulation currently requires hardware acceleration!
CPU acceleration status: KVM requires a CPU that supports vmx or svm
```

Skip straight to a physical device paired with the host Mac.

### One-liner

```bash
export ADB_SERVER_SOCKET=tcp:host.docker.internal:5037
adb devices -l
```

The host Mac's `adb server` is reachable on `host.docker.internal:5037` — **do not** run `adb start-server` inside the container. Point this container's `adb` client at the host's server and it'll see whatever devices the Mac sees (including wireless pairings like `adb connect 192.168.1.x:...`).

Add this to your shell for the session and every `adb` command Just Works:

```bash
export ADB_SERVER_SOCKET=tcp:host.docker.internal:5037
adb shell "cmd uimode night yes"   # force dark
adb shell "cmd uimode night no"    # force light
adb shell "cmd uimode night auto"  # restore
adb exec-out screencap -p > /tmp/shot.png
```

### Why not just `adb connect` from the container?

Direct `adb connect 192.168.1.x:...` from the container fails even when the device's port is reachable — the device's ADB pairing is bound to the host's keys, not ours. Relaying through the host adb server sidesteps that.

## Building the Android app

**Prefer running `npx expo run:android` from the host Mac.** Reasons:

1. The Mac has the cached Gradle / CMake / NDK state; the container does not.
2. The container's Gradle daemon regularly crashes mid-build during `createBundleReleaseJsAndAssets` — Metro bundling + parallel CMake pushes it past available RAM.
3. `android/local.properties` may still contain `sdk.dir=/Users/...` from a Mac-side build; for a container-side build, rewrite it to `sdk.dir=/home/node/android-sdk`.
4. `android/app/.cxx/` and `android/app/build/` hold absolute-path caches from whichever machine ran Gradle last — if the container tries to reuse Mac-side caches you'll see errors like:
   ```
   Configuring project ':react-native-safe-area-context' without an existing directory is not allowed.
   The configured projectDirectory '/Users/michaelb/.../node_modules/...' does not exist
   ```
   Fix: `rm -rf android/build android/app/build android/app/.cxx android/.gradle` before building.

If you must build in the container, at least use `./gradlew --no-daemon --no-parallel assembleRelease` to reduce memory pressure, and expect it to be slow.

## Expo web dev server

```bash
npx expo start --web --port 8082
```

The first request after start triggers Metro to bundle — Playwright's `browser_navigate` can race that and crash the page. Retrying the navigation once usually wins.

A harmless startup error you can ignore:

```
An unknown error occurred while installing React Native DevTools.
libgtk-3.so.0: cannot open shared object file
```

DevTools doesn't run in headless Linux; the bundler itself starts fine.

## Playwright MCP: emulating prefers-color-scheme

The Playwright MCP doesn't expose `emulate_prefers_color_scheme` directly. Use `browser_run_code` to call the underlying page API:

```js
async (page) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload({ waitUntil: 'domcontentloaded' });
}
```

Then `browser_wait_for` a known piece of text before screenshotting — React Native Web hydrates after DOMContentLoaded, so the snapshot will be empty if you screenshot too early.
