# Voice-Driven Checklist v1 Implementation Plan

## Goal
Build a single codebase that ships to web, iPhone, and Android while satisfying `requirements.md`.
The implementation must stay local-first in v1, keep checklist definitions on-device or in-browser, and avoid any remote backend.

## Technical Decisions

### Application Stack
- Use Expo SDK 55 with TypeScript as the application framework.
- Use Expo Router for a universal route structure across web, iOS, and Android.
- Use React Native plus React Native Web for shared UI components.
- Keep native iOS and Android projects enabled through Expo Continuous Native Generation so the app can use config-plugin-based speech packages in development and production builds.

### Local Persistence
- Use `expo-sqlite` as the only persisted data store in v1.
- Persist checklist definitions only.
- Do not persist active run state, transcript text, or completion state across app exits.
- Store ordered checklist items in SQLite with a contiguous zero-based `position` integer.
- Allow empty checklists to be saved as drafts, but block playback until at least one item exists, matching `requirements.md`.

### Audio And Speech
- Use `expo-audio` for the bundled completion sound.
- Use `expo-speech` for spoken playback on web, iOS, and Android.
- Use `expo-speech-recognition` for speech recognition on web, iOS, and Android.
- Wrap both libraries behind a shared `SpeechPlaybackAdapter` interface and a shared `SpeechRecognitionAdapter` interface so the run logic stays independent of package APIs.
- Command recognition is intentionally one utterance at a time, not continuous dictation.
  - After each item is spoken, begin one recognition cycle.
  - When a final recognition result arrives, handle it, then immediately restart listening for the same item if the run is still active and the result was not a command that changed state.
- Normalize recognized text with trim + lowercase exact-token matching.
- Treat only `next`, `repeat`, and `previous` as commands.
- Treat any other recognized phrase as non-command speech and display it without changing progress.
- Use `en-US` as the initial recognition and speech locale in v1.

## Project Structure

### Routes
- `app/index.tsx`
  - Checklist library screen.
- `app/checklists/new.tsx`
  - Create checklist screen.
- `app/checklists/[id]/edit.tsx`
  - Edit checklist screen.
- `app/run/[id].tsx`
  - Active checklist run screen.

### Shared Source Layout
- `src/db/`
  - SQLite connection, migrations, and repository helpers.
- `src/features/checklists/`
  - Checklist entity types, validation, CRUD hooks, and editor UI.
- `src/features/run/`
  - Run snapshot creation, run reducer/state machine, command parsing, and playback screen UI.
- `src/services/audio/`
  - Completion sound player.
- `src/services/speech/`
  - Shared adapter contracts and platform selection layer.
- `src/components/`
  - Reusable form, list, button, status, and transcript components.
- `src/test/`
  - Shared test helpers and adapter fakes used outside end-to-end tests.
- `assets/audio/`
  - Bundled completion sound asset.

## Data Model

### SQLite Schema
```sql
CREATE TABLE checklists (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE checklist_items (
  id TEXT PRIMARY KEY NOT NULL,
  checklist_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX checklist_items_unique_position
ON checklist_items (checklist_id, position);
```

### Domain Types
- `Checklist`
  - `id`
  - `title`
  - `items: ChecklistItem[]`
- `ChecklistItem`
  - `id`
  - `text`
  - `order`
- `ChecklistRunSnapshot`
  - `checklistId`
  - `checklistTitle`
  - `items`
- `ChecklistRunState`
  - `status: 'idle' | 'speaking' | 'listening' | 'manual' | 'completed'`
  - `snapshot`
  - `currentItemIndex`
  - `voiceControlAvailable`
  - `spokenPlaybackAvailable`
  - `latestRecognizedPhrase`
  - `manual` is an internal implementation-only refinement used when a run is active but neither speaking nor listening because voice features are unavailable.

### Mapping Rules
- `ChecklistItem.order` is derived from SQLite `position`.
- `position` is zero-based, contiguous, and rewritten after insert, delete, or reorder operations.
- A run snapshot is created from the saved checklist immediately before navigation to the run screen.
- Once created, the run snapshot is held in memory and never mutated by later checklist edits or deletion.

## Checklist Library Implementation

### Library Screen
- Load all checklists from SQLite sorted by `updated_at DESC`, then `title ASC` for stable ties.
- Show title and item count for each checklist.
- Primary actions:
  - Create checklist
  - Edit checklist
  - Delete checklist
  - Start checklist
- For empty checklists, keep Start visibly unavailable and render an inline validation message on the row stating that at least one item is required before playback can begin.

### Create/Edit Screen
- Use a shared checklist form component for create and edit.
- Validate on save:
  - title must trim to a non-empty string
  - each item text must trim to a non-empty string
- Persist the trimmed title and trimmed item text values, not the raw input strings.
- Editing supports:
  - add item
  - change item text
  - delete item
  - reorder items
- Save empty draft checklists only if the title is valid.
- Reordering rewrites all `position` values in one SQLite transaction.
- Delete requires a confirmation dialog before the SQLite delete mutation runs.

## Run Flow Implementation

### Run Initialization
The initialization flow below is used only when a checklist run is first launched from the library route.

1. Resolve the checklist by id from SQLite.
2. If it is missing, redirect back to the library with an error banner.
3. If it has zero items, block the run and show the empty-checklist validation message.
4. Build an in-memory run snapshot.
5. Initialize the run reducer with `currentItemIndex = 0`, empty transcript, and best-known speech availability.
6. Check spoken playback availability and voice-recognition availability.
7. Start playback of item 0 immediately if spoken playback is available.
8. If spoken playback is unavailable, keep the item text visible and transition directly to `listening` if voice recognition is available; otherwise enter `manual`.

### Reducer Rules
- `NEXT`
  - If `currentItemIndex < lastIndex`, increment index, clear transcript, and transition to:
    - `speaking` when spoken playback is available
    - `listening` when spoken playback is unavailable and voice control is available
    - `manual` when neither speech path is available
  - If `currentItemIndex == lastIndex`, transition to `completed`.
- `REPEAT`
  - Keep the same index and transition to:
    - `speaking` when spoken playback is available
    - `listening` when spoken playback is unavailable and voice control is available
    - `manual` when neither speech path is available
- `PREVIOUS`
  - Set index to `max(0, currentItemIndex - 1)`, clear transcript, and transition to:
    - `speaking` when spoken playback is available
    - `listening` when spoken playback is unavailable and voice control is available
    - `manual` when neither speech path is available
- `RECOGNIZED_PHRASE`
  - Update `latestRecognizedPhrase`.
- `VOICE_UNAVAILABLE`
  - Set `voiceControlAvailable = false`.
  - Clear `latestRecognizedPhrase`.
  - If the current state is `listening`, transition to `manual`.
- `PLAYBACK_UNAVAILABLE`
  - Set `spokenPlaybackAvailable = false`.
  - If the current state is `speaking`, transition to `listening` when voice control is available, otherwise `manual`.
- `COMPLETE`
  - Set `status = 'completed'`, clear transcript, stop listening.
- `DISCARD_RUN`
  - Clear transcript.
  - Tear down active speech resources.
  - Clear the in-memory snapshot.
- `STOP_AND_RETURN`
  - Dispatch `DISCARD_RUN`.
  - Navigate to the library.

### Side-Effect Rules
- Entering `speaking`
  - Clear displayed transcript whenever the run leaves `listening` and enters `speaking`.
  - Stop any active recognition session first.
  - Speak the current item text.
- When speech playback finishes successfully
  - If the run is still active, enter `listening` if voice recognition is available, otherwise `manual`.
- Entering `listening`
  - Start a one-shot recognition request.
- If permission is denied or recognition cannot start
  - Dispatch `VOICE_UNAVAILABLE`.
- If spoken playback becomes unavailable during a run
  - Dispatch `PLAYBACK_UNAVAILABLE`.
- When a final recognition result arrives
  - Ignore the callback unless the current run state is still `listening`.
  - Update displayed transcript.
  - Normalize text and classify command/non-command.
  - For `next`, `repeat`, `previous`: dispatch the corresponding reducer action.
  - For non-command speech: stay on the same item and start a new listening cycle.
- Any manual control press
  - Cancel active speech playback.
  - Cancel active recognition.
  - Dispatch the corresponding run action immediately.
- Manual Stop press
  - Dispatch `STOP_AND_RETURN`.
- Entering `completed`
  - Stop recognition.
  - Clear transcript.
  - Attempt to play the completion sound once.
  - Show completion UI even if sound playback fails.

### Lifecycle Teardown
- Register a route-leave hook on the run screen so router navigation away from the screen dispatches `DISCARD_RUN`.
- Register a hardware-back handler on Android that dispatches `DISCARD_RUN` before allowing navigation.
- Register an app lifecycle listener so moving to the background dispatches `DISCARD_RUN`.
- On web, register `pagehide` and `beforeunload` teardown handlers that dispatch `DISCARD_RUN`.
- On run-screen unmount, dispose of speech playback, recognition resources, and the in-memory run snapshot even if no explicit Stop action was used.

### Restart Behavior
- Restart from the completed screen does not rerun library-based initialization or reload from SQLite.
- Restart from the completed screen resets the existing run screen to item 0 using the same in-memory run snapshot that was used for the just-finished run.
- Returning to the library ends the snapshot lifetime.
- If the saved checklist was edited or deleted during the run, those changes affect future runs started from the library, not the in-memory restart action.
- This snapshot-reuse behavior is an explicit v1 implementation choice to keep restart deterministic after mid-run source edits or deletion.

## Speech Adapter Contracts

### Text-To-Speech Adapter
```ts
type SpeechPlaybackAdapter = {
  isAvailable(): Promise<boolean>;
  speak(text: string, opts: { locale: string }): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
};
```

### Recognition Adapter
```ts
type RecognitionResult = {
  transcript: string;
  isFinal: boolean;
};

type SpeechRecognitionAdapter = {
  isAvailable(): Promise<boolean>;
  requestPermissionsIfNeeded(): Promise<'granted' | 'denied' | 'unavailable'>;
  startListening(opts: {
    locale: string;
    onResult: (result: RecognitionResult) => void;
    onError: (error: string) => void;
  }): Promise<void>;
  stopListening(): Promise<void>;
  dispose(): Promise<void>;
};
```

### Platform Notes
- Web
  - Guard `expo-speech-recognition` and `expo-speech` usage behind feature detection.
  - If speech recognition is missing, mark voice control unavailable but keep manual controls active.
  - If spoken playback is missing, mark spoken playback unavailable but keep the item text visible.
- iOS
  - Request speech recognition permission only when the user starts a run that will use voice control.
  - Configure `NSSpeechRecognitionUsageDescription` and `NSMicrophoneUsageDescription` through the `expo-speech-recognition` config plugin.
  - Use `expo-speech` for spoken playback.
- Android
  - Request `RECORD_AUDIO` permission at run start through the recognition package flow.
  - Use one-shot listening instead of continuous recognition.
  - Ensure recognition resources are stopped and released on screen exit.

## UI Plan

### Checklist Library
- Header with app title and create action.
- Scrollable checklist list.
- Each row shows:
  - checklist title
  - item count
  - Start
  - Edit
  - Delete

### Checklist Form
- Title field.
- Ordered item editor list.
- Add item button.
- Drag/reorder handle for each item.
- Delete item action for each row.
- Save and cancel actions.
- Inline validation messages for title and item text.

### Run Screen
- Checklist title.
- Progress label in the form `Item X of Y`.
- Current item text, always visible.
- Voice status banner:
  - listening
  - voice unavailable
  - spoken playback unavailable
- Latest recognized phrase panel.
- Manual controls:
  - Previous
  - Repeat
  - Next
  - Stop
- Completed state:
  - completion title
  - Restart
  - Return to Library

## Implementation Sequence

### Phase 1: Scaffold And Tooling
1. Create the Expo SDK 55 TypeScript project with Expo Router enabled.
2. Add `expo-sqlite`, `expo-audio`, `expo-speech`, and `expo-speech-recognition`.
3. Confirm the chosen `expo-speech-recognition` version supports the selected Expo SDK on web, iOS, and Android before feature implementation begins.
4. Set up linting, TypeScript config, and the base route structure.
5. Add test tooling before feature work:
   - Jest for unit and integration tests
   - React Native Testing Library for screen/component tests
   - Playwright for web end-to-end tests

### Phase 2: Data Layer
1. Write failing tests for checklist validation, position rewriting, and repository CRUD behavior.
2. Implement SQLite migrations and repository functions.
3. Implement checklist domain types and validation helpers.
4. Verify repository tests pass.

### Phase 3: Checklist Library And Editor
1. Write failing screen tests for create, edit, reorder, delete confirmation, and empty-checklist start blocking.
2. Implement the library screen.
3. Implement the shared create/edit form.
4. Wire repository mutations into the screens.
5. Verify screen tests pass.

### Phase 4: Run State Machine
1. Write failing reducer tests for:
   - next
   - repeat
   - previous
   - previous at index 0
   - final-item completion
   - recognized phrase update
   - discard run
   - transcript clearing
   - voice unavailable clearing transcript
   - playback unavailable transition
   - late recognition callbacks ignored outside `listening`
   - completed state ignoring further voice commands
   - restart from completed
2. Implement the pure run reducer and command parser.
3. Verify reducer tests pass.

### Phase 5: Shared Run Screen
1. Write failing component tests for:
  - progress label
  - transcript updates
  - manual controls interrupting speech flow
  - completed state rendering
  - completed-screen Restart resets to item 0 without reloading from SQLite
  - completed-screen Return to Library discards the run and navigates away
  - voice unavailable and playback unavailable banners
  - route leave and app-background teardown
  - recognition not starting while `speaking`
  - stray recognition callbacks during `speaking` do not change run state
2. Implement the run screen against fake speech adapters first.
3. Verify component tests pass.

### Phase 6: Speech Package Integration
1. Web
   - Write failing adapter tests around feature detection and recognition lifecycle.
   - Add tests for missing speech recognition support and missing spoken playback support.
   - Expose a deterministic test speech adapter mode for Playwright so end-to-end tests can inject spoken phrases and playback-complete events without relying on real browser microphone input.
   - Implement the adapter wrapper over `expo-speech` and `expo-speech-recognition`.
2. iOS
   - Write failing integration tests for permission denied, recognition-start failure, and mid-run voice loss.
   - Configure the package permissions and implement the shared adapter wrapper.
3. Android
   - Write failing integration tests for permission denied, recognition-start failure, and mid-run voice loss.
   - Configure the package permissions and implement the shared adapter wrapper.
4. Verify the shared run screen works against each concrete adapter.

### Phase 7: Completion Sound And Final Polish
1. Add the bundled completion sound asset.
2. Implement completion sound playback with `expo-audio`.
3. Verify completion still succeeds when the sound fails.
4. Add final regression coverage for completion sound failure, snapshot deletion during a run, and empty-draft Start blocking from the library row.

## Test Plan

### Unit Tests
- Checklist title validation.
- Checklist item validation.
- Trimmed title and item text persistence.
- Position rewriting after add/delete/reorder.
- Command parsing and exact-token matching.
- Run reducer transitions.
- `previous` at index 0.
- Transcript clearing on item change, completion, exit, and voice loss.
- Snapshot immutability after the source checklist changes.

### Integration Tests
- SQLite migration and CRUD behavior.
- Delete cascade from checklist to checklist items.
- Library screen loading from SQLite.
- Form save flows and validation errors.
- Trimmed values are saved and rendered without surrounding whitespace.
- Empty-draft checklist row blocks Start with the validation message.
- Run screen behavior with fake adapters.
- Route-leave and background teardown behavior.
- Android hardware-back teardown behavior.
- Web `pagehide` / `beforeunload` teardown behavior.
- Voice unavailable and playback unavailable transitions during an active run.
- Completed state ignores additional voice input.
- Completed-screen Restart and Return to Library actions.

### Web End-To-End Tests
- Create, edit, reorder, delete checklist.
- Prevent starting an empty checklist.
- Run a checklist fully with manual controls.
- Run a checklist fully using voice commands through the deterministic test speech adapter.
- During a voice run, use `repeat` and `previous` by voice and verify the current item and progress label update correctly.
- During a voice run, send non-command speech and verify the transcript updates while progress stays on the same item.
- Complete a checklist by voice after prior `repeat` / `previous` actions and verify the completed state appears.
- Use Stop and verify the app returns to the library immediately and the next run starts again from item 1.
- Show transcript text for command and non-command recognition events using the deterministic test speech adapter.
- Simulate permission denied and recognition-start failure paths with the web adapter unavailable.
- Simulate missing spoken playback support and verify the run continues with visible item text and manual controls.
- Restart after completion.
- Use Return to Library from the completed screen and verify the next run from the library starts from item 1.
- Exit mid-run and confirm the next run starts from item 1.
- Delete the source checklist during a run and verify the in-memory run can still finish and restart.

### Native Verification
- iOS simulator/device:
  - permission prompt at first voice-enabled run
  - permission denied fallback
  - recognition-start failure fallback
  - voice unavailable fallback
  - voice becoming unavailable mid-run
  - spoken playback unavailable fallback
  - manual controls interrupt speech
- Android emulator/device:
  - permission prompt at first voice-enabled run
  - permission denied fallback
  - recognition-start failure fallback
  - one-shot recognition loop
  - voice unavailable fallback
  - voice becoming unavailable mid-run
  - spoken playback unavailable fallback
  - manual controls interrupt speech

## Definition Of Done
- Web, iOS, and Android builds all use the same route structure and shared domain logic.
- Checklist CRUD is stored locally in SQLite only.
- The run loop satisfies every acceptance criterion in `requirements.md`.
- Voice and spoken playback failures both degrade to a usable manual-control path.
- All planned automated tests pass.
- Manual platform verification is completed for native speech behavior.

## Assumptions
- V1 supports English voice commands only.
- Empty checklists may be saved but may not be started.
- Restart from the completed state reuses the in-memory snapshot from the just-finished run.
- No backend, sync, login, or shared checklist functionality will be added in this implementation.
