# Android end-to-end suite

This Appium 2 / UiAutomator2 suite drives a real native Android build and real
SQLite data. The build uses the isolated package
`com.mbuchoff.voicechecklist.e2e`; the suite may clear that package without
touching an installed `com.mbuchoff.voicechecklist` app or its library.

## Prerequisites

- Node.js 20 and Java 17
- `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) pointing to an SDK with `adb`
- Android SDK Command-line Tools (latest), providing `apkanalyzer`
- One authorized physical Android device visible in `adb devices`
- The root app dependencies installed

The UiAutomator2 doctor reports a missing emulator as required even when a
physical phone is available. For this physical-device suite, an authorized
device is sufficient; `bundletool`, FFmpeg, and GStreamer are optional.

## Build and run

```bash
npm ci --prefix e2e
npm run e2e:unit
npm run e2e:android:build
npm run e2e:android
```

Scenarios are independent top-level tests sharing one serial Appium session.
Each group resets only the isolated package, selects the local account, and
imports the fixture through the real picker (migration instead installs its v2
fixture). Thus routine order, hint state, theme, and sound do not depend on an
earlier group. The keyboard edit and its exported-content assertion stay in the
same group. Each group captures its final state and attempts pointer cancellation,
app force-stop, temporary presentation restoration, and document cleanup even
after an assertion fails; unrelated groups remain eligible to run.

Run a group independently using a Node test-name regular expression:

```bash
E2E_TEST_NAME_PATTERN='^editor-settings-backup:' npm run e2e:android
```

Group prefixes are `migration`, `layout-scroll`, `lesson`, `reorder`, `run`,
`create-delete`, `editor-settings-backup`, and `responsive`. Leave the pattern
unset to run all groups. Shared setup still requires a working device/Appium
session; a connection loss or unsuccessful safety cleanup may prevent subsequent
groups from establishing their preconditions. Repeated real-picker setup makes
the complete suite longer, but late scenarios no longer require a successful
gesture/performance prelude.

Set `ANDROID_SERIAL` when more than one device is available. A remote ADB
server can be selected with `ADB_SERVER_SOCKET`; those variables are inherited
by both the harness and Appium.

The build command regenerates the ignored Android project and creates a
standalone arm64 release APK with its JavaScript bundle embedded. It signs only
the isolated E2E package with Android's debug key, so production release
signing remains unchanged. Before starting Appium, the runner reads the actual
APK manifest and rejects an unreadable or non-E2E package. The runner then
starts a private Appium server, installs
the isolated package, seeds test data through that package's sandbox, and
restores any temporary font-scale or viewport changes in cleanup.

Evidence is written to the ignored `e2e/artifacts/<timestamp>/` directory:
screenshots, accessibility trees, a real v2 migration fixture, Appium logs,
raw `gfxinfo`, and a parsed frame summary. See
[scenario-matrix.md](./scenario-matrix.md) for the automated and assisted
coverage boundary.

The E2E dependencies are development-only and intentionally isolated in their
own lockfile. Appium 2.19 is pinned because GH-36 requires Appium 2; the latest
UiAutomator2 generation requires Appium 3 and is therefore not used here.
