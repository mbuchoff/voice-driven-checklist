# Keep listening while the phone is locked

## Context

When the user presses **Start** on a checklist, listening is set up via `expoRecognitionAdapter` in `continuous: false` mode and explicitly stopped the moment the app is backgrounded. The hard stop lives in `src/features/run/RunScreen.tsx` (~lines 89–96), which calls `recognition.stopListening()` on every `AppState` `'background'` transition. That's why locking the screen or switching apps kills the mic.

The user wants the opposite for active runs: once a checklist is running, the recognizer should keep listening for `next` / `repeat` / `previous` even while the device is locked and the screen is off. Per their answers: target both Android and iOS, allow the screen to actually lock (no keep-awake), and a persistent Android notification while listening is acceptable (and required by Play policy on Android 14+).

## Approach

Use Notifee's foreground-service primitive for the Android piece and iOS `UIBackgroundModes: ["audio"]` for iOS. Notifee already ships an Expo config plugin, supports `foregroundServiceType="microphone"`, and lets us define the notification + lifecycle from JS — much smaller surface than writing a custom Kotlin service. In parallel, switch the recognizer from one-shot-with-restart to a single `continuous: true` session that streams finalized utterances into the existing `parseCommand` pipeline.

Why not roll a custom foreground service: one notification + one wake-locked task does not justify owning native code and a config plugin.

Why not skip the foreground service entirely: Android 14 revokes mic access from background processes that don't hold `FOREGROUND_SERVICE_MICROPHONE` with the matching service type. Without it, listening will die seconds after the screen locks regardless of `WAKE_LOCK`.

## Critical files

- `app.json` — Android permissions, Notifee plugin, iOS `UIBackgroundModes`
- `package.json` — add `@notifee/react-native`
- `src/services/speech/expoRecognitionAdapter.ts` — `continuous: true`, iOS audio-session category for background, stream-of-results handling
- `src/services/speech/foregroundService.ts` (new) — thin wrapper over `notifee.registerForegroundService` / `displayNotification` / `stopForegroundService`
- `app/_layout.tsx` — register the foreground-service task once at boot
- `app/run/[id].tsx` — start the notification when a run begins; stop it on unmount, hardware back, route leave
- `src/features/run/RunScreen.tsx` — remove the unconditional `'background'` stop; on `'active'` resume if the recognizer ended unexpectedly
- (Possible) a 5-line custom config plugin to inject `android:foregroundServiceType="microphone"` on `app.notifee.core.ForegroundService` if Notifee's plugin doesn't already

## Implementation outline

1. **Notifee install + config**
   - `npx expo install @notifee/react-native`
   - In `app.json`, add `@notifee/react-native` to `plugins`.
   - Add to `android.permissions`: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`, `WAKE_LOCK`, `POST_NOTIFICATIONS`.
   - Verify the merged AndroidManifest declares `android:foregroundServiceType="microphone"` on the Notifee service. If not, add a small inline config plugin (`withAndroidManifest`) that sets that attribute.

2. **Continuous recognition**
   - In `expoRecognitionAdapter.ts`, change start options to `{ continuous: true, interimResults: false, maxAlternatives: 1, lang: 'en-US' }`.
   - Pass `iosCategory: { category: 'playAndRecord', categoryOptions: ['mixWithOthers', 'defaultToSpeaker', 'allowBluetooth'], mode: 'spokenAudio' }` so iOS keeps `AVAudioSession` alive behind the lock screen.
   - Existing `'result'` listener already runs `parseCommand`; remove the explicit auto-restart on non-command results since continuous mode no longer ends after each utterance.
   - Treat transient errors (`no-speech`, `no-match`, `network`) as recoverable: while `state.status === 'listening'`, restart the session.

3. **Foreground-service wrapper** — new `src/services/speech/foregroundService.ts`
   - `registerListeningService()` — calls `notifee.registerForegroundService(notification => new Promise(resolve => { stopResolver = resolve }))` exactly once.
   - `startListeningNotification(checklistTitle: string)` — creates the channel `voice-checklist-listening` (importance HIGH) if needed, then `notifee.displayNotification({ android: { channelId, asForegroundService: true, ongoing: true, pressAction: { id: 'open' }, actions: [{ title: 'Stop', pressAction: { id: 'stop' } }] }, title: 'Listening — ' + checklistTitle, body: 'Say next, repeat, or previous' })`.
   - `stopListeningNotification()` — `notifee.stopForegroundService()` and resolve the held promise.
   - Subscribe to `notifee.onForegroundEvent` to handle the `Stop` action by routing back to the run screen's stop logic (e.g., emit through an event bus or pass a callback wired in `app/run/[id].tsx`).

4. **Wire into the run flow**
   - In `app/_layout.tsx`, call `registerListeningService()` once at module top-level so the JS-side service task is available before navigation begins.
   - In `app/run/[id].tsx`, after the existing permission gate succeeds and the user presses Start (i.e., when status transitions to `'listening'`), call `startListeningNotification(checklist.title)`. Mirror the call to `stopListeningNotification()` in: route unmount, hardware back, completion of the checklist.
   - In `RunScreen.tsx`, delete the `AppState` handler that aborts on `'background'`. Keep an `'active'` handler that re-arms recognition if the adapter reports it ended while status is still `listening`.

5. **iOS background audio**
   - Add `"UIBackgroundModes": ["audio"]` to `ios.infoPlist` in `app.json`.
   - The `iosCategory` change in step 2 keeps the audio session live behind the lock screen.
   - When submitting to App Store, document the hands-free justification (already implied by current listing copy).

## Verification

Run from `/home/node/repos/voice-driven-checklist`:

- `npm run typecheck && npm run lint && npm test` — must pass.
- Add a unit test in `src/services/speech/__tests__/expoRecognitionAdapter.test.ts` (or matching existing pattern) asserting the start call uses `continuous: true` and the right `iosCategory`.

UI verification (from memory: Android via `adb`, iOS skipped; web via Playwright if applicable — not relevant here):

1. **Android foreground regression** — `expo run:android`, start a checklist, say `next` / `repeat` / `previous` with screen on. Steps advance.
2. **Android lock-screen** — start a checklist, press power to lock, wait 30 s, say `next`. Step advances. `adb logcat | grep -iE 'speech|notifee'` shows the service is alive and a result event fires.
3. **Notification stop action** — from the lock-screen notification, tap **Stop**. Service ends, run state returns to idle, mic released (`adb shell dumpsys media.audio_flinger | grep -i pid` shows no active client).
4. **Doze tolerance** — leave listening with screen off for 5 min; saying `next` still advances.
5. **Cold-start permissions** — uninstall, reinstall, run on Android 13+; `POST_NOTIFICATIONS` prompt appears before the service starts.
6. **iOS lock-screen (real device, skipped per memory but plan should still cover it)** — `expo run:ios -d`, start, lock, say `next` after 30 s. Step advances.

## Risks

- **iOS App Store review.** Continuous background mic is a sensitive entitlement. Hands-free checklist is a defensible use case but rejection is possible. Fallback: ship Android-first and platform-gate the change so iOS keeps current foreground-only behavior; this is one ternary in `expoRecognitionAdapter` and one `Platform.OS` check in the run screen.
- **Notifee manifest merge.** If Notifee's config plugin doesn't already set `foregroundServiceType="microphone"` for current versions, we need the small `withAndroidManifest` plugin described in step 1. Worst case is a one-time native rebuild.
- **Speech-service session timeouts.** Some Android speech engines silently end continuous sessions around 60–120 s. The adapter must auto-restart on `end` while status is `listening` — verify in step 2 of UI testing and tune if needed.
