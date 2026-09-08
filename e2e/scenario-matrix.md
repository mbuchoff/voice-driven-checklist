# GH-36 validation matrix

The automated suite proves deterministic behavior. Perceptual and external
service checks remain explicit assisted acceptance items rather than being
reported as automated results.

Current status (2026-09-08): this table describes the suite's coverage contract,
not a claim that every row passed on the final build. The last complete Pixel 7
run predates the performance flag, review follow-ups, and quick-tap fix. A fresh
full run and assisted gates remain outstanding; see the
[implementation handoff](../docs/your-routines-tuning-handoff.md).

| Area | Automated physical-device evidence | Assisted acceptance |
| --- | --- | --- |
| Upgrade | Seed a real schema-v2 SQLite file; launch migration; verify the prior `updated_at DESC, title ASC, id ASC` order | Confirm the user's normal installed library is unchanged after the accepted upgrade |
| First run and import | Select the local account, import a real version-1 backup through Android's picker, and verify all 17 routines in backup-array order | None |
| Card layout | Verify two columns, equal fixed heights, distinct columns, complete long step text in the accessibility tree, long title fixture, and sticky New/Settings controls | Compare exact palette, typography, clipping, and safe-area placement to the approved prototype |
| Teaching hint | Open the full-screen lesson, capture its full viewport, close it with Back, swipe-dismiss it, and verify dismissal after relaunch | Compare timing and alignment to the approved 2.7-second animation |
| Gesture arbitration | Start a vertical scroll before and after hold feedback begins; both must scroll without opening the editor. A 16 dp drift must still activate drag. Verify an initial edge hold stays stationary, outward travel scrolls, and retreat moves the boundary inward. | Feel the 192 ms visual feedback, one activation haptic at 440 ms, 20 dp radial tolerance, and lack of accidental drags during scrolling. Mirror the edge check at the top and re-grab a card immediately after release. |
| Reordering | Move first-to-last and last-to-first across offscreen rows with edge autoscroll, verify each order, relaunch persistence, and collect separate ordinary-scroll and reorder frame statistics | Reject visible stutter, twitch, missed insertion gaps, hidden dragged cards, excessive sway, or settling lasting beyond the approved short 220 ms release. |
| Interruption | Background the app with an active pointer drag and verify the last persisted order is restored | Repeat with Android Back and an incoming interruption |
| Accessibility reorder | Component/integration tests verify Move earlier/later actions and announcements | With TalkBack enabled, verify focus, spoken action names, resulting-position announcement, and confirmation-based run stopping |
| Editor and keyboard | Edit the last step of an 11-step routine through the real UI and verify the focused field remains in the resized viewport; save without moving the routine | Inspect the real keyboard transition and long-entry editing comfort |
| Create/delete | Create a routine first, then delete it from the editor confirmation and verify the prior order is restored | Retry behavior for an induced storage failure is covered by real SQLite/UI integration tests, not a production fault switch |
| Play and stop | Start a real run, advance, verify Back Cancel and Stop, then run all steps to the completion screen and return | Verify sounds, cue/speech spacing, microphone voice commands, completion cue, and subjective run animation |
| Settings | Exercise Dark, Light, and System; select all four sound preferences; verify the selected local account | Verify sound character/volume and real Gmail OAuth/account switching |
| Backup/export | Import through Android's picker; export through Android's create-document UI; read the JSON and verify version 1, exact checklist-only keys, title order, and the edited last step | Open the exported file independently if device-specific document-provider behavior differs |
| Responsive states | Capture System, Dark, Light, 17-card, long-content, and temporary 1.3 font-scale / 720×1600 viewport states; restore device settings | Inspect supported phone sizes and functional landscape/tablet behavior |
| Startup failure | Real SQLite integration and UI tests verify non-destructive failure plus Retry | None; no hidden production fault switch is added for E2E |

The normal package must not be installed or upgraded for assisted acceptance
until its current library has a safety backup and the user gives fresh
permission, as agreed in GH-36.
