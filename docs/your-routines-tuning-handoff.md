# Your Routines implementation handoff — 2026-09-08

## Contract and scope

[GH-36](https://github.com/mbuchoff/voice-driven-checklist/issues/36) contains
the approved prototype attachments, implementation plan, and Q1–Q38 decisions.
Deliver the native Android redesign as one issue and one PR. The later tuning
decisions below supersede the original prototype's typography/gesture timings.
Prototype exports, the Tune controls, and local test artifacts do not ship.

- Two fixed-height card columns, top-aligned titles, sticky New/Settings header,
  card-to-edit navigation, and a separate Play control. Empty Play is disabled.
- Largest card typography: compact title 18/22 line height, count 14,
  steps 14/17; wider cards 22/26, 15, 15/19. Tip stays Current (13/11).
- All steps flow behind opaque Play and clip 15 dp above the card bottom.
- Successful taps navigate on release without waiting for animation. Contact
  feedback starts after 96 ms. Confirmed quick taps also start push-in alongside
  navigation, even if released before 96 ms, for cards, Play, New, and Settings.
  Cancelled presses must not navigate.
- Hold feedback/dimming starts at 192 ms; drag activation and one haptic at
  440 ms. Allow 20 dp radial thumb drift; deliberate scrolling wins before
  activation. The teaching hint never triggers a haptic.
- Native drag uses a dashed insertion target and velocity-dependent sway.
  Release position, scale, and tilt settle together over 220 ms; the dragged
  card stays in front. Drops persist; cancellation restores the prior order.
- A hold already inside an edge-scroll zone starts with a temporary boundary
  at the initial touch. Outward movement scrolls; inward movement ratchets the
  boundary toward normal. Reset on every gesture; mirror at both edges.
- The device-wide hint appears with two or more routines, persists until
  dismissed, accepts either swipe direction, and opens a 2.7-second full-screen
  lesson on tap. Back closes the lesson without dismissing the hint.
- Persist explicit library order with transactional schema v3: preserve the
  old visible order during migration, create first, append imports in backup
  order, and do not reorder on edit/run. Backup stays checklist-only version 1.
- Shared device library/account ownership and production Settings are unchanged.
  Delete lives in the editor, uses the saved title in confirmation, preserves
  drafts on failure, and returns to a single library route after success.
- Provide non-destructive startup failure/Retry and TalkBack reorder actions.
  iOS and new reduced-motion behavior are outside this ticket.

## Review follow-up

A complete independent medium-effort OpenAI/Claude structural and bug review
round finished, followed by focused verification of accepted fixes. An earlier
Claude timeout and interrupted xhigh passes were not counted as complete.
Review evidence is retained locally under
`e2e/artifacts/gh36-deep-review-2026-09-07/` (ignored, not part of the PR).

Accepted fixes include retrying failed database initialization with proper
handle cleanup; deletion route history; cancelled hint swipes; stale lesson
measurement callbacks; bounded suppression timers; shared hold-outline
rendering; no idle frame subscription; stable gesture construction at drag
begin; custom TalkBack action IDs; exact-package E2E signing/manifest guards;
independent legacy-schema fixtures; and real SQLite partial-write rollback
tests. The latest quick-tap feedback fix came after that review and has focused
regression coverage plus user device acceptance, not another deep-review round.

## Executed verification

- 56 Jest suites / 499 tests passed; typecheck and ESLint passed.
- 12 E2E harness unit checks passed, including rejecting the wrong APK before
  Appium starts. These are harness tests, not a physical-device E2E run.
- Standalone arm64 release APK built, embedded JavaScript/signature/isolated
  identity verified, installed without clearing data, and launched on Pixel 7.
  Package: `com.mbuchoff.voicechecklist.e2e`. The database checksum was identical
  before and after installation. The normal package was not changed.
- The user tested the latest tap feedback and accepted it on September 8.
  That acceptance does not establish final scrolling or full-suite acceptance.

Latest APK and local logs:
`e2e/artifacts/gh36-press-feedback-2026-09-08/voice-checklist-e2e.apk`.
SHA-256: `a323e298e162167cdc06a4494578d4ac6566e833af01651384bff53ed3deb396`.
The install is standalone; Metro is not required.

The earlier full Pixel 7 Appium run passed two deep journeys in about 310
seconds: `e2e/artifacts/gh36-tuning-phone-2026-09-07-run11/`. It covered real
v2-to-v3 migration, picker import of 17 routines, fixed-card layout, early and
post-feedback scroll arbitration, 16 dp drift, adaptive bottom-edge hold and
autoscroll, native cancellation, lesson/Back/dismissal, offscreen reorder and
relaunch persistence, background cancellation, keyboard editing, running and
stopping, create/delete, themes/sounds/local account, export, and temporary
font/viewport changes with restoration. The exported version-1 JSON was also
read independently to verify title order and the edited final step.

**That full native run predates the performance flag, review fixes, and latest
press-feedback fix. It is historical coverage, not a final-build pass.** The
current suite additionally asserts the exported JSON contents automatically;
that updated assertion has not yet run on the phone.

## Scrolling evidence and remaining gates

Short scripted swipes originally looked smooth: 328 frames, 8 janky frames
(2.44%). The user subsequently reported stutter while dragging and coasting.
A user-driven trace without Appium recorded 844 additional frames, 290 janky
frames (34.36%), and expensive UI-thread recording (95th percentile 18.62 ms).
Tracing adds overhead; these workloads are not interchangeable benchmarks.

The branch enables Reanimated's
`USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` static feature flag to avoid replaying
animated props on native scroll-state commits. The comparison APK had an
identical JS bundle and changed native Reanimated library. No dependency
version, additional feature flag, or gesture timing changed for that experiment.
Subjective improvement was reported initially, but stutter was reported again.
There is no comparable post-flag natural-scroll trace; do not call this fixed.

Before ready-for-merge/release acceptance:

- Rerun the complete physical suite on the final APK, with fresh permission for
  its temporary isolated-app data/display mutations and a current safety backup.
  Substantial fixes require renewed review and full E2E per the user's request.
- Recheck natural scroll/drag/settle feel, top-edge mirroring, immediate re-grab,
  exact visuals, haptics, and keyboard-transition comfort on the phone.
- Complete assisted TalkBack menu/focus/announcement, voice/sound, and real
  Gmail OAuth checks. Component tests do not establish native accessibility or
  external-service success.
- Obtain fresh permission and a safety backup before upgrading the normal app.
  No normal-package upgrade/downgrade has been exercised for this branch.
- Establish a tested rollback before release: schema v2 binaries reject a v3
  database, so reinstalling the previous app alone is not a valid rollback.

See [the scenario matrix](../e2e/scenario-matrix.md) for coverage and
[the E2E README](../e2e/README.md) for build/run instructions. E2E signing and
debuggability depend on the exact isolated package from `VOICE_CHECKLIST_E2E=1`;
do not pass the obsolete `-PVOICE_CHECKLIST_E2E` Gradle property.
