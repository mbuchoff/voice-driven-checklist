---
name: prototype-to-android
description: Use when converting an approved HTML prototype and its spec issue (such as #39, the routine editor and step timers) into this Expo/React Native Android app. Wraps the /implement skill with a requirement ledger, values measured from the prototype's source, side-by-side fidelity checks on the physical phone, and a retro loop that improves this skill whenever a conversion defect is found.
---

# Prototype → Android

Convert an approved prototype into the native app so that the result matches the prototype and its spec issue, and so that the user doesn't find defects the process should have caught. The `/implement` skill governs testing and the completion gate. This skill adds what is specific to converting a prototype.

Inputs: the spec issue number (e.g. `39`). Read it with `GH_TOKEN="$GITHUB_PAT_MBUCHOFF" gh issue view <N> --comments`. Then get the prototype: the issue's ZIP attachment, or the local copy under `~/repos/voice-todos/issue-attachments/`.

## Precedence

1. The spec issue's **Decisions** and **Differences from the prototype**.
2. The issue's **Requirements**.
3. The prototype at its approved URL, for everything the issue leaves to it (sizes, spacing, colors, typography, timings, copy).
4. Existing app behavior, for everything neither of them touches.

URL options in the prototype other than the approved variant are rejected alternatives. Never port them.

## 1. Before writing code

- Read `GLOSSARY.md`, `AGENTS.md`, and the whole issue, including the decision table. Use the glossary's terms in code, tests and copy.
- Serve the prototype locally (`python3 -m http.server <port> --bind 127.0.0.1` from the unzipped folder) and open the approved URL in Playwright at the phone's width in dp (Pixel 7: 412 × 915, deviceScaleFactor 2.625 or 2). Keep it available for side-by-side checks for the whole job.
- **Build the requirement ledger** in `~/repos/voice-todos/issue-<N>-ledger.md` (outside the repo). Add one row per requirement bullet in the issue, and one row per prototype value or behavior the issue defers to the prototype. Columns:
  - id
  - requirement
  - source (issue section, or prototype `file:line`)
  - test (Jest file / Appium journey / manual check)
  - red seen
  - green
  - verified on phone
  - notes

  Nothing gets implemented without a row, and nothing is done until every row is verified or explicitly marked as an accepted difference.
- **Take values from the prototype's source, not from screenshots:** CSS rules, JS constants, computed styles via `getComputedStyle`/`getBoundingClientRect`. Treat CSS px as dp. When the prototype computes something at runtime (text-measured chip fitting, folding thresholds), port the algorithm, not one result of it.
- **Map browser mechanisms to native ones:** don't transliterate DOM tricks (SortableJS, `focusout`, `scrollIntoView`, CSS transitions, `color-mix`, `oklch()`). Use what the app already uses: react-native-gesture-handler, Reanimated and Worklets, `TextInput` focus APIs, the app's keyboard handling, and precomputed colors. Record each mapping in the ledger's notes.
- **Inventory every existing test ID, accessibility label and dialog text** that the Appium suite (`e2e/tests/*.mjs`) and Jest tests rely on, before changing screens. Update the consumers in the same commit as the change.

## 2. Implement with /implement

Invoke the `/implement` skill, and the `test-writing` skill for any test work, and follow them: proportionate TDD, a red test seen failing for the intended reason, then green, then thorough end-to-end verification on the real app.

Order of work:

1. **Branch** `gh-<N>-<slug>`. Commit as you go on that branch (authorized for #39 by its decision Q35). Never push or open a PR until the user asks.
2. **Manual red pass** before any code changes: build today's `main` as the normal package, install it on the phone with a sample library, and walk the issue's manual checks. Capture evidence that each check fails today.
3. **Behavior-neutral renames**, if the issue asks for them. Update existing tests and keep them green. Don't create artificial red tests.
4. **Data:** migrations, repository, backup format. Test with an in-memory SQLite and a frozen copy of the previous schema.
5. **Pure logic modules**, each test-first in Jest: formatters, candidate and fitting algorithms, steppers, reducers, save rules.
6. **Screens and components**, test-first where Jest can observe the behavior.
7. **Device-dependent behavior:** gestures, keyboard, locked phone, audio, haptics. Verify it on the phone.
8. **Appium journeys** the issue lists, plus any better ones you find. Run the full suite at the end.

## 3. Phone workflow in this container

- **No emulator.** Use the Pixel 7, paired directly to the container.
  - Use the ARM64 adb on server port 5038. See the `android-adb-pairing-and-ndk-on-arm64-container` entry in `/workspace/config/claude-template/domain-knowledge.md`; a wrapper may exist at `/tmp/agentic-smith-repos/voice-todos/adb`.
  - When pairing is lost, ask the user for a fresh pairing code and port, plus the main "IP address & Port".
- **Builds:** run Gradle with `LD_LIBRARY_PATH` pointing at an x86_64 `libz.so.1` (same entry).
  - **The e2e package** (`npm run e2e:android:build`, package `com.mbuchoff.voicechecklist.e2e`) is for Appium and quick device checks.
  - **The normal package** is for the manual red and green passes and the upgrade check. Remove it afterwards: the user's real app isn't on this phone.
- **Useful adb commands:**
  - `exec-out screencap -p` for screenshots
  - `logcat -v time ReactNativeJS:I '*:S'` for app logs
  - `shell input keyevent KEYCODE_SLEEP` to lock
  - `shell dumpsys battery unplug` then `shell dumpsys deviceidle force-idle` for deepest battery-saving mode; reverse with `unforce` and `battery reset`
  - `shell cmd uimode night yes|no|auto` for the theme
  - `shell settings put system font_scale 1.3` for large font; put back 1.0
  - `shell wm density <dpi>` for a ≈360 dp screen (`wm density reset` afterwards)
  - `shell uiautomator dump` for element bounds

  Undo every phone setting you change.
- **Guard every phone action; the phone is the owner's personal device.** Before each tap, swipe, key or screenshot, check the foreground app (`adb shell dumpsys activity activities`, the `topResumedActivity` line). Refuse to act unless it's the app under test or the system file picker. Never chain blind taps without checking the screen between them, since one stray Back or tap lands on the home screen. If a screenshot captures anything outside the app (home screen, other apps, photos, file names), delete it at once. Helpers in this skill's `scripts/` (set `PHONE_ADB` to the adb wrapper):
  - `phone.py`: guarded `tap-id`, `tap-text`, `tap-desc`, `find`, `shot`, `tap`, `text`, `key`, `swipe`, `fg`
  - `dumpdp.py [ymin] [ymax]`: element bounds in dp
  - `side.sh <prototype.png> <phone.png> <out.png>`: the two shots side by side at the same dp width
  - `p3.py <hex>`: an sRGB color as the phone's Display P3 screenshots record it
- **In the system file picker, search for the file by name** instead of browsing folders, which shows the owner's files. A file pushed with adb needs a media scan before the picker lists it: `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/<name>`.
- **Lock rotation to portrait** for phone checks (`settings put system accelerometer_rotation 0` and `user_rotation 0`). Record the previous values and restore them afterwards.
- **The phone has a fingerprint lock.** After a locking test, ask the user to unlock it, then continue.
- **Audible things** (cues, speech) need the user's ears. Ask them to listen at named moments, and also log each cue's result in the app so the log corroborates what they heard.

## 4. Fidelity check (catches most conversion defects)

Do this for every screen state the issue's screenshots show, plus every state the ledger names. For #39 that includes:
- the editor at rest
- an open step
- a step's chips
- the timer panel
- the color grid
- a swipe in progress and the UNDO row
- each sheet
- the new-routine empty state
- the folded top bar
- dark theme
- large font
- the narrow screen

1. **Capture both** at the same state, data and width: the prototype in Playwright, and the app on the phone with adb.
2. **Put them side by side** and list every visible difference: spacing, sizes, font weight and size, colors, corner radii, alignment, icons, copy, shadows.
3. **Measure, don't eyeball:** compare key dimensions from `uiautomator dump` bounds (px ÷ density = dp) against the prototype's `getBoundingClientRect`.
4. **Resolve each difference:** fix it, or record it in the ledger as an accepted difference with its reason (a spec decision, platform convention or accessibility). Accepted differences go in the PR description.

Check interaction fidelity on the phone too:
- **Hold and drag timing:** compare `adb shell input swipe x y x y <ms>` just under and just over the hold time.
- **Drift and swipe thresholds.**
- **Animation lengths:** check them by eye against the prototype.
- **Keyboard behavior.**
- **Android Back order.**
- **Haptics:** these need the user.

## 5. Finish

- Pass `/implement`'s completion gate: the full end-to-end verification on the final build.
- Every ledger row is verified or marked as an accepted difference.
- Report:
  - environment and builds
  - each journey and scenario, automated or manual, with its result
  - artifact paths: ledger, screenshots, logs
  - remaining gaps, each with its blocker

## 6. Retro loop: when the user reports a conversion defect

Improve this skill first, then fix the defect.

1. **Reproduce it** and find the root cause.
2. **Name the step** of this skill that should have caught it. For example:
   - a ledger row was missing
   - a value was eyeballed instead of extracted
   - the fidelity check skipped that state
   - a mechanism was transliterated
   - a device check was missing
   - the precedence was misread
3. **Edit this file** with a concrete, checkable instruction that would have prevented it. "Compare chip heights in dp from `uiautomator dump`" is the right kind; "be careful with chips" is not. Add a dated line to **Lessons learned**.
4. **Sweep for siblings:** apply the new rule across the rest of the conversion, looking for other defects of the same kind.
5. **Fix with TDD:** a red test reproducing the defect where automation can observe it; otherwise a manual check recorded in the ledger. Then green, then rerun the affected fidelity and device checks.
6. **Commit** the skill change separately from the fix, so the improvement to the process is reviewable on its own.

## Lessons learned

- 2026-10-21, #39 spike: the first "next" cue after locking the phone was silent. The likely cause is `CueSoundPlayer.play` giving up when `seekTo(0)` takes longer than 300 ms on a cold audio output. Rule: anything audible is verified by the user listening, and corroborated by a logged cue result.
- 2026-10-21, #39 spike: with the phone locked and no wake lock, JS timers stalled for up to 14.6 s. Rule: always verify time-based behavior with the phone locked and in forced deep idle, and measure lateness from logs.
- 2026-10-21, #39 red pass: chained blind adb taps ran past the app onto the home screen, opening Google search and the Weather app. Screenshots captured personal photos and saved locations; they were deleted. Rule: guard every phone action on the foreground app, check the screen between steps, and search the file picker instead of browsing it.
