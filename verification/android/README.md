# Android verification — Pixel 7

Manual walk-through of the v1 requirements on a physical Pixel 7 (Android 16,
1080×2400). The release APK was driven entirely over `adb` via
`scripts/android-verify.sh`.

| #  | Screenshot                                | Demonstrates                                                                                                | Requirement(s)               |
| -- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 01 | 01-editor-empty.png                       | New-checklist editor renders with empty title, one empty item, Add item / Save / Cancel                     | AC#1, AC#4                   |
| 02 | 02-editor-title.png                       | Title field accepts text ("Pre-flight"), placeholder cleared                                                | AC#1                         |
| 03 | 03-editor-item1.png                       | First item field accepts text ("Check fuel")                                                                | AC#1, AC#2                   |
| 04 | 04-editor-item2-added.png                 | Add item appends a second row; Move-up enabled on the new row, disabled on the first                       | AC#2                         |
| 05 | 05-library.png                            | Save returns to library; checklist appears with item count + Start / Edit / Delete                          | AC#1                         |
| 06 | 06-permission-prompt-first-run.png        | First Start triggers the system RECORD_AUDIO prompt                                                         | AC#14                        |
| 07 | 07-relaunched.png                         | Library reopens cleanly after process restart (after rebuild + reinstall)                                   | persistence                  |
| 08 | 08-run-listening.png                      | Run screen post-grant: Item 1 of 2, "Check fuel", listening status, green mic indicator                     | AC#7, AC#9                   |
| 09 | 09-listening-persists-15s.png             | After ~15s of silence and several `no-speech` recognizer errors, listening still active; "I heard: hello" shown for ambient noise (non-command speech) | AC#13, AC#15 — fix verified |
| 10 | 10-item2-noncommand.png                   | Manual Next advanced to Item 2 ("Check tires"); recognizer continued and surfaced "didn't" as non-command   | AC#10, AC#13, AC#17, AC#18   |
| 11 | 11-completion.png                         | Manual Next on the final item shows the completed view ("Checklist complete") with Restart / Return to library; completion sound played (verified via expo-audio focus logs) | AC#20, AC#21 |
| 12 | 12-restart.png                            | Restart from completed view returns to Item 1 with listening active                                          | AC#21                        |
| 13 | 13-back-to-library.png                    | Stop ends the run and returns to the library                                                                 | AC#19, AC#22                 |
| 14 | 14-permission-prompt-second-run.png       | After revoking RECORD_AUDIO, next Start re-prompts                                                          | AC#14                        |
| 15 | 15-voice-unavailable-fallback.png         | Don't allow → "Voice control unavailable" banner; manual Previous / Repeat / Next / Stop remain functional | AC#14, AC#15, AC#17          |

## Deeper mic-denied walkthrough

A separate pass with `RECORD_AUDIO` revoked, exercising every manual control on
the run screen so the no-voice fallback is proved end-to-end (not just the
banner from shot 15):

| #         | Screenshot                          | Demonstrates                                                                                                                | Requirement(s)            |
| --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| deny-01   | deny-01-library.png                 | Library after a prior session ended — "Pre-flight" still present, ready to Start                                            | persistence               |
| deny-02   | deny-02-prompt.png                  | Permission prompt re-appears on Start because RECORD_AUDIO was revoked                                                      | AC#14                     |
| deny-03   | deny-03-run-item1.png               | "Don't allow" → run begins on Item 1 with the orange unavailable banner; TTS still spoke "Check fuel" (verified via logcat) | AC#15, AC#16-inverse      |
| deny-04   | deny-04-after-repeat.png            | Manual Repeat re-spoke Item 1 (still on "Check fuel", no item advance)                                                      | AC#11 (manual equivalent) |
| deny-05   | deny-05-after-next-item2.png        | Manual Next advanced to Item 2 ("Check tires")                                                                              | AC#10 (manual equivalent) |
| deny-06   | deny-06-after-previous.png          | Manual Previous returned to Item 1                                                                                          | AC#12 (manual equivalent) |
| deny-07   | deny-07-previous-on-item1.png       | Manual Previous on Item 1 stays on Item 1 (no underflow). Also captures the **redundancy** the simplification fixes: both the gray "Use the buttons below to advance." helper line *and* the orange "Voice control unavailable — use the buttons" banner are showing | R-RUN-12                  |
| deny-08   | deny-08-completion.png              | Manual Next on the final item shows the completed view in no-voice mode; completion sound played (verified via expo-audio focus logs) | AC#20, AC#21              |
| deny-09   | deny-09-after-simplify.png          | After rebuild with the helper-line suppression: only the orange banner remains, gray helper line gone                       | (cleanup, no AC)          |

The deny-07 → deny-09 pair documents the redundancy fix: when `voiceControlAvailable === false`, the gray manual-status helper duplicates what the orange banner already says, so it's now suppressed (`RunScreen.tsx:193`). New test: `RunScreen.test.tsx` → "hides the manual status helper line when voice is unavailable".

## Requirements not visually covered

These were exercised via automated tests (`npm test`) rather than the manual walk-through:

- **AC#3** (delete confirmation), **AC#4** (validation messages), **AC#5** (no-items block), **AC#8** (snapshot survives mid-run edits/deletes), **AC#16** (spoken-playback unavailable banner) — see `src/features/checklists/*.test.tsx`, `src/features/run/snapshotDeletionRegression.test.tsx`, `src/features/run/RunScreen.test.tsx`.
- **AC#10–13** voice-driven branch — the Pixel can't be made to "speak" from `adb`, so spoken `next` / `repeat` / `previous` are covered by `RunScreen.test.tsx` against the fake recognition adapter; the live recognizer was confirmed wired (it surfaced ambient phrases as non-command transcripts in shots 09 and 10). The manual-button equivalents of those commands are visually exercised in the deny-04..deny-06 walkthrough above.

## Notes from this verification pass

- **`no-speech` is normal, not fatal.** The Pixel's offline recognizer fires
  `NO_SPEECH_DETECTED` after every silence window (~3–5s). The original
  implementation treated *any* recognizer error as terminal `VOICE_UNAVAILABLE`,
  so voice control died seconds after Start. Fixed by whitelisting transient
  codes (`no-speech`, `speech-timeout`, `aborted`, `network`, `busy`) and
  restarting the listening cycle for those — `RunScreen.tsx` lines 16–24,
  93–100. New regression test:
  `RunScreen.test.tsx` → "restarts the listening cycle when recognition emits 'no-speech'".
- **uuid v4 needs `react-native-get-random-values`.** Hermes doesn't ship
  `crypto.getRandomValues()`, so the pre-fix APK crashed the moment the editor
  tried to mint an item id. Polyfill imported at the top of `app/_layout.tsx`.
