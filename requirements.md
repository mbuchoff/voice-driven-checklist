# Voice-Driven Checklist v1 Requirements

## Purpose
Define the product requirements for a voice-driven checklist that can later be implemented for a website, an iPhone app, or an Android app.
This document describes required behavior and scope for v1 only.
It does not define implementation architecture, framework choice, or remote services.

## Product Overview
The product is a local-first, single-user checklist app.
Users manage their own checklists on-device, then run a checklist in a voice-guided mode.
When a checklist is running, the app reads each item aloud and listens for a small set of spoken commands to control progress.

## Core Requirements

### Checklist Library
- The user can view a list of saved checklists.
- The user can create a checklist.
- The user can edit a checklist.
- The user can delete a checklist.
- Deleting a checklist requires explicit user confirmation.
- Editing a checklist includes adding, changing, deleting, and reordering checklist items.
- Checklist titles must be trimmed and non-empty.
- Checklist item text must be trimmed and non-empty.
- Each checklist has:
  - a unique identifier
  - a title
  - an ordered list of plain-text checklist items

### Checklist Playback
- The user can start a checklist from the checklist library.
- A checklist can be started only if it contains at least one item.
- If a checklist has no items, the app must prevent playback and show a clear validation message.
- An active checklist run uses a snapshot of the checklist captured when the run starts.
- Editing or deleting a checklist while it is running does not change the active run in progress.
- When a checklist starts, the app immediately reads the first item aloud.
- After the current item is read, the app enters a listening state and waits for a spoken command.
- Spoken commands are processed only while the app is in the listening state.
- Speech detected while the app is reading an item aloud does not trigger command handling in v1.
- In v1, checklist progress is determined by the current item position within the active run snapshot; items before the current item are treated as completed, and the current item and later items are not.
- The supported spoken commands in v1 are:
  - `next`
  - `repeat`
  - `previous`

### Command Behavior
- Saying `next` marks the current item complete, advances to the next item, and reads that next item aloud.
- Saying `repeat` reads the current item again and does not change progress.
- Saying `previous` moves to the previous item, makes it the current unfinished item, and reads it aloud again.
- When `previous` moves back, any later items in the current run are no longer treated as completed.
- If the user is already on the first item and says `previous`, the app remains on the first item and reads it again.

### Non-Command Speech
- If recognized speech is not one of the supported commands, it is treated as non-command speech.
- Non-command speech must not change checklist progress.
- The latest recognized phrase must be shown on screen so the user can tell the app is actively listening.
- The displayed phrase is updated for any recognized speech, including supported commands, while the app is in the listening state.
- The displayed phrase is cleared when a new item begins playback, when the run ends, or when voice control becomes unavailable.

### Voice Availability
- If microphone permission is denied, unavailable, or speech recognition cannot start, the app must clearly indicate that voice control is unavailable for the current run.
- When voice control is unavailable, the user must still be able to complete the checklist using manual controls.
- If voice control becomes unavailable during an active run, the app must keep the current checklist item active, show that voice control is unavailable, and allow the run to continue with manual controls.
- If spoken playback is unavailable, the app must clearly indicate that spoken playback is unavailable, keep the current item text visible on screen, and allow the run to continue with manual controls.

### Manual Controls
- The playback screen must also provide visible manual controls for:
  - `Previous`
  - `Repeat`
  - `Next`
  - `Stop` or `Exit`
- Manual controls are available throughout an active run, including while an item is being read aloud.
- Using `Previous`, `Repeat`, `Next`, or `Stop` or `Exit` while an item is being read aloud immediately interrupts the current spoken playback and performs the requested action.
- Manual controls must behave the same as their voice-driven equivalents where applicable.
- Manual controls exist as a fallback when speech recognition is unavailable, inaccurate, or inconvenient.
- `Stop` or `Exit` is a manual-only control in v1 and does not have a voice command equivalent.
- `Stop` or `Exit` ends the active run immediately, discards current run progress, and returns the user to the checklist library.

### Completion
- When the user advances past the final item, the checklist run is complete.
- Saying `next` on the final item marks that item complete, ends the run, plays the completion sound, and transitions to the completed state without reading another checklist item.
- On completion, the app must play a victory or completion sound.
- The app must show a completed state after the checklist finishes.
- If the completion sound cannot be played, the completed state must still be shown.
- From the completed state, the user must be able to either:
  - return to the checklist library
  - restart the checklist from the beginning
- From the completed state, the checklist run does not accept additional voice navigation commands.
- On completion, the app stops listening for voice input and stops updating the displayed recognized phrase.

### Session Behavior
- V1 uses single-session progress only.
- If the user stops or exits a checklist before completion, progress is discarded.
- Any way of leaving an in-progress checklist run, including manual stop, platform back/navigation, or closing the app, discards current run progress.
- Starting the checklist again begins from the first item.

### Persistence
- Checklist definitions are stored locally on the device or in the browser for v1.
- V1 does not require accounts, sync, collaboration, or remote storage.
- Remote storage may be considered in a future revision, but it is out of scope for this document.

## Data Model Requirements

### Checklist
A checklist must include:
- `id`
- `title`
- `items`

### Checklist Item
A checklist item must include:
- `id`
- `text`
- `order`

### Checklist Run State
A checklist run state must include enough information to represent:
- which checklist is active
- the checklist snapshot being used for the active run
- the current item index
- whether the app is idle, speaking, listening, or completed
- whether voice control is available for the current run
- the latest recognized phrase shown to the user
- `idle` represents the non-running state before a checklist begins or after a run has been exited.

## Acceptance Criteria
1. A user can create, edit, and delete locally stored checklists.
2. Editing a checklist includes adding, changing, deleting, and reordering checklist items.
3. Deleting a checklist requires explicit user confirmation.
4. Checklist titles and checklist item text must be trimmed and non-empty, with clear validation feedback when invalid.
5. A checklist with no items cannot be started and shows a clear validation message.
6. A checklist can be started from the checklist library.
7. Starting a checklist causes the first item to be read aloud immediately.
8. An active run continues to use the checklist snapshot captured at run start even if the saved checklist is edited or deleted during the run.
9. Spoken commands are acted on only after the app enters the listening state; speech heard while the app is reading an item does not trigger command handling.
10. Saying `next` advances exactly one item and reads the new current item aloud, except on the final item where it completes the run without reading another item.
11. Saying `repeat` replays the current item without changing progress.
12. Saying `previous` moves back one item, makes that item the current unfinished item, and reads it aloud, or re-reads the first item if already at the beginning.
13. Any recognized speech during the listening state, including supported commands and unrelated words, updates the displayed latest recognized phrase, and that phrase is cleared when the run state leaves active listening.
14. If microphone access or speech recognition is unavailable, the app clearly indicates that voice control is unavailable and the checklist remains usable through manual controls.
15. If voice control becomes unavailable during a run, the current checklist item remains active and the run can continue through manual controls.
16. If spoken playback is unavailable, the current item text remains visible and the run can continue through manual controls.
17. The playback screen includes manual controls for Previous, Repeat, Next, and Stop or Exit.
18. Manual controls are available throughout an active run and interrupt current spoken playback when used during audio playback.
19. Stop or Exit ends the active run immediately, discards current progress, and returns the user to the checklist library.
20. Completing the last item plays a completion sound and shows a completed state; if the sound cannot be played, the completed state still appears.
21. From the completed state, the user can restart the checklist from item 1 or return to the checklist library, and the app no longer listens for voice input.
22. Leaving a checklist mid-run by any supported exit path discards progress so the next run starts from the beginning.
23. These requirements remain valid regardless of whether the product is later implemented for web, iPhone, or Android.

## Out of Scope for v1
- User accounts
- Cloud sync
- Shared checklists
- Multi-user features
- Checklist templates
- Notes or metadata on checklist items
- Sections or nested checklist structures
- Natural-language command interpretation beyond `next`, `repeat`, and `previous`
- Persistent in-progress resume after closing the app
- Implementation-specific architecture decisions
