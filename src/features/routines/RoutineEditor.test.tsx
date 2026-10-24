import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, BackHandler, Keyboard, Platform, TextInput } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import type { Database } from '@/src/db/database';
import {
  DEFAULT_DEVICE_PREFERENCES,
  MemoryDevicePreferenceStore,
} from '@/src/features/settings/preferences';
import { renderWithDatabase } from '@/src/test/renderWithDatabase';

import { RoutineEditor, focusEditorInput } from './RoutineEditor';
import { setupEditorDatabase as setupDb, tapToEdit } from './RoutineEditor.testSupport';
import { createRoutine, getRoutine } from './repository';
import type { Routine } from './types';

async function renderEditor(
  props: Partial<Parameters<typeof RoutineEditor>[0]> = {},
  options: { database?: Database; preferences?: MemoryDevicePreferenceStore } = {},
) {
  const database = options.database ?? (await setupDb());
  const callbacks = {
    onSaved: jest.fn(),
    onCancel: jest.fn(),
    onDeleted: jest.fn(),
    onRun: jest.fn(),
  };
  await renderWithDatabase(
    <RoutineEditor newColorKey="teal-1" {...callbacks} {...props} />,
    { database, preferences: options.preferences },
  );
  return { database, ...callbacks };
}

async function existing(database: Database, overrides: Partial<Parameters<typeof createRoutine>[1]> = {}) {
  return createRoutine(database, {
    title: 'Morning stretch',
    colorKey: 'green-2',
    steps: [
      { text: 'Neck rolls', timerSeconds: 30 },
      { text: 'Breathe', timerSeconds: null },
    ],
    ...overrides,
  });
}

// The views that measure chips are hidden from accessibility on purpose.
const HIDDEN = { includeHiddenElements: true };

/** Jest doesn't lay out views; give the chip strip and its chips sizes. */
function layOutChips(index: number, times: number[], chipWidth = 40, room = 330, noTimerWidth = chipWidth) {
  fireEvent(screen.getByTestId(`chips-room-${index}`, HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: room + 10, height: 52 } },
  });
  const widths: [string, number][] = [...times.map((time) => [String(time), chipWidth] as [string, number]), ['none', noTimerWidth]];
  for (const [chip, width] of widths) {
    fireEvent(screen.getByTestId(`chip-measure-${index}-${chip}`, HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width, height: 36 } },
    });
  }
}

function layOutPanelChips(times: number[]) {
  fireEvent(screen.getByTestId('panel-chips-room', HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 370, height: 62 } },
  });
  for (const time of times) {
    fireEvent(screen.getByTestId(`panel-chip-measure-${time}`, HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 60, height: 44 } },
    });
  }
}

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests native focus when a step opens', () => {
    const focus = jest.fn();
    focusEditorInput({ focus });
    expect(focus).toHaveBeenCalledTimes(1);
  });

  describe('a new routine', () => {
    it('opens empty and can be created once it has a name and a step with words', async () => {
      await renderEditor();

      expect(screen.getByText('New routine')).toBeOnTheScreen();
      expect(screen.getByText('Tap + to add your first step')).toBeOnTheScreen();
      expect(screen.queryByTestId('editor-delete')).toBeNull();
      const create = () => screen.getByRole('button', { name: 'Create routine' });
      expect(create()).toBeDisabled();

      fireEvent.changeText(screen.getByTestId('title-input'), 'Night');
      expect(create()).toBeDisabled();

      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'Lights off');
      expect(create()).toBeEnabled();
    });

    it('creates the routine with its color, trimmed words and timers, dropping blank steps', async () => {
      const { database, onSaved } = await renderEditor({ newColorKey: 'slate' });
      fireEvent.changeText(screen.getByTestId('title-input'), '  Night  ');
      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), ' Lights off ');
      fireEvent(screen.getByTestId('item-text-0'), 'submitEditing');
      fireEvent.changeText(screen.getByTestId('item-text-1'), '   ');

      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Create routine' }));
      });

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      const saved: Routine = onSaved.mock.calls[0][0];
      expect(await getRoutine(database, saved.id)).toMatchObject({
        title: 'Night',
        colorKey: 'slate',
        steps: [{ text: 'Lights off', timerSeconds: null }],
      });
    });

    it('counts a new step only once it has words', async () => {
      await renderEditor();
      fireEvent.press(screen.getByTestId('add-step'));
      expect(screen.getByTestId('hero-count')).toHaveTextContent('No steps yet');
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'P');
      expect(screen.getByTestId('hero-count')).toHaveTextContent('1 step');
    });
  });

  describe('typing steps', () => {
    it('keeps a new step with words on Enter and opens another; Enter on a blank new step removes it', async () => {
      await renderEditor();
      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'Stretch');

      fireEvent(screen.getByTestId('item-text-0'), 'submitEditing');
      expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
      expect(screen.getByTestId('item-label-0')).toHaveTextContent('Stretch');

      fireEvent(screen.getByTestId('item-text-1'), 'submitEditing');
      expect(screen.queryByTestId('item-row-1')).toBeNull();
      expect(screen.queryByTestId('item-text-0')).toBeNull();
    });

    // On Android, when the focused field disappears, focus jumps to the next
    // focusable view (often the name) and the keyboard stays up. So the
    // keyboard has to be let go of while the open step's field is still there.
    describe('lets go of the keyboard before the open step’s field goes away', () => {
      /** For each Keyboard.dismiss(), the step field that was still on screen. */
      function fieldsAtDismiss() {
        const fields: (string | null)[] = [];
        jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
          fields.push(screen.queryAllByTestId(/^item-text-/)[0]?.props.testID ?? null);
        });
        return fields;
      }

      it('on Enter in an existing step', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);
        const fields = fieldsAtDismiss();

        fireEvent(screen.getByTestId('item-text-1'), 'submitEditing');

        expect(fields).toEqual(['item-text-1']);
        expect(screen.queryByTestId('item-text-1')).toBeNull();
      });

      it('on Enter in a blank new step', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        fireEvent.press(screen.getByTestId('add-step'));
        const fields = fieldsAtDismiss();

        fireEvent(screen.getByTestId('item-text-2'), 'submitEditing');

        expect(fields).toEqual(['item-text-2']);
        expect(screen.queryByTestId('item-row-2')).toBeNull();
      });
    });

    // Moving to another step keeps the keyboard up. On Android, the moment the
    // focused field goes away, another field (the name) takes focus and shows
    // it, so a hidden holder takes the keyboard while the old field is there.
    describe('hands the keyboard to another step without the name taking it on the way', () => {
      /** For each focus request: the field asked, and the step fields then on screen. */
      function focusRequests() {
        const requests: { field: string; stepFields: string[] }[] = [];
        jest.spyOn(TextInput.prototype, 'focus').mockImplementation(function (this: TextInput) {
          requests.push({
            field: (this.props as { testID?: string }).testID ?? '',
            stepFields: screen.queryAllByTestId(/^item-text-/).map((field) => field.props.testID),
          });
        });
        return requests;
      }

      it('on Enter in a new step with words', async () => {
        await renderEditor();
        fireEvent.press(screen.getByTestId('add-step'));
        fireEvent.changeText(screen.getByTestId('item-text-0'), 'Stretch');
        const requests = focusRequests();
        const dismiss = jest.spyOn(Keyboard, 'dismiss');

        fireEvent(screen.getByTestId('item-text-0'), 'submitEditing');

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['item-text-0'] });
        expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
        expect(dismiss).not.toHaveBeenCalled();
      });

      it('when another step is tapped', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(0);
        const requests = focusRequests();
        const dismiss = jest.spyOn(Keyboard, 'dismiss');

        tapToEdit(1);

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['item-text-0'] });
        expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
        expect(dismiss).not.toHaveBeenCalled();
      });

      it('when another step’s time is tapped', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);
        const requests = focusRequests();

        fireEvent.press(screen.getByTestId('item-clock-0'));

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['item-text-1'] });
        expect(screen.getByTestId('item-text-0')).toBeOnTheScreen();
      });

      it('when another step is tapped while a blank new step goes away', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        fireEvent.press(screen.getByTestId('add-step'));
        const requests = focusRequests();

        tapToEdit(0);

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['item-text-2'] });
        expect(screen.getByTestId('item-text-0')).toBeOnTheScreen();
        expect(screen.queryByTestId('item-row-2')).toBeNull();
      });

      it('still closes the open step when you tap the name yourself', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);

        fireEvent(screen.getByTestId('title-input'), 'focus');

        expect(screen.queryByTestId('item-text-1')).toBeNull();
      });
    });

    // A native tap doesn't blur the field being typed in, so a sheet would
    // open under the keyboard.
    describe('lets go of the keyboard while typing the name, before', () => {
      async function typingTheName() {
        const database = await setupDb();
        const routine = await existing(database);
        const callbacks = await renderEditor({ initialRoutine: routine }, { database });
        fireEvent(screen.getByTestId('title-input'), 'focus');
        fireEvent.changeText(screen.getByTestId('title-input'), 'Morning stretch, longer');
        return { dismiss: jest.spyOn(Keyboard, 'dismiss'), ...callbacks };
      }

      it('the back arrow asks to save', async () => {
        const { dismiss } = await typingTheName();
        fireEvent.press(screen.getByTestId('editor-back'));
        expect(screen.getByText('Save your changes?')).toBeOnTheScreen();
        expect(dismiss).toHaveBeenCalled();
      });

      it('the trash asks to delete', async () => {
        const { dismiss } = await typingTheName();
        fireEvent.press(screen.getByTestId('editor-delete'));
        expect(screen.getByTestId('delete-sheet')).toBeOnTheScreen();
        expect(dismiss).toHaveBeenCalled();
      });

      it('Save leaves the editor', async () => {
        const { dismiss, onSaved } = await typingTheName();
        await act(async () => {
          fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
        });
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(dismiss).toHaveBeenCalled();
      });
    });

    it('lets go of the keyboard before ▶ leaves for the run', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      const { onRun } = await renderEditor({ initialRoutine: routine }, { database });
      tapToEdit(0);
      const dismiss = jest.spyOn(Keyboard, 'dismiss');

      fireEvent.press(screen.getByTestId('bar-play'));

      expect(onRun).toHaveBeenCalled();
      expect(dismiss).toHaveBeenCalled();
    });

    it('gives an emptied existing step back its words when it is closed', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      tapToEdit(1);
      fireEvent.changeText(screen.getByTestId('item-text-1'), '');
      fireEvent(screen.getByTestId('item-text-1'), 'submitEditing');

      expect(screen.getByTestId('item-label-1')).toHaveTextContent('Breathe');
      expect(screen.queryByTestId('save')).toBeNull();
    });
  });

  describe('saving and leaving', () => {
    it('shows the Save bar only when there are unsaved changes', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });

      expect(screen.queryByTestId('save')).toBeNull();
      fireEvent.changeText(screen.getByTestId('title-input'), 'Evening stretch');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    it('leaves straight away when nothing changed', async () => {
      const database = await setupDb();
      const { onCancel } = await renderEditor({ initialRoutine: await existing(database) }, { database });

      fireEvent.press(screen.getByTestId('editor-back'));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('leave-sheet')).toBeNull();
    });

    it('asks before leaving with unsaved changes, and Discard leaves them unsaved', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      const { onCancel } = await renderEditor({ initialRoutine: routine }, { database });
      fireEvent.changeText(screen.getByTestId('title-input'), 'Changed');

      fireEvent.press(screen.getByTestId('editor-back'));
      expect(screen.getByText('Save your changes?')).toBeOnTheScreen();
      fireEvent.press(screen.getByTestId('leave-discard'));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect((await getRoutine(database, routine.id))?.title).toBe('Morning stretch');
    });

    it('saves from the leave sheet', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      const { onSaved } = await renderEditor({ initialRoutine: routine }, { database });
      fireEvent.changeText(screen.getByTestId('title-input'), 'Changed');
      fireEvent.press(screen.getByTestId('editor-back'));

      await act(async () => {
        fireEvent.press(screen.getByTestId('leave-save'));
      });

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
      expect((await getRoutine(database, routine.id))?.title).toBe('Changed');
    });

    it('never saves a routine without a name', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      fireEvent.changeText(screen.getByTestId('title-input'), '   ');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    });

    it('works Android Back like the back arrow, closing the timer panel first', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const back = jest.spyOn(BackHandler, 'addEventListener');
      const database = await setupDb();
      const { onCancel } = await renderEditor({ initialRoutine: await existing(database) }, { database });
      const pressBack = () => act(() => {
        back.mock.calls.findLast(([event]) => event === 'hardwareBackPress')![1]();
      });

      tapToEdit(1);
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('item-more-1'));
      expect(screen.getByTestId('timer-panel')).toBeOnTheScreen();
      fireEvent(screen.getByTestId('timer-plus'), 'pressIn');
      fireEvent(screen.getByTestId('timer-plus'), 'pressOut');

      pressBack();
      expect(screen.queryByTestId('timer-panel')).toBeNull();
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 1 min 30s timed');

      pressBack();
      expect(screen.getByText('Save your changes?')).toBeOnTheScreen();
      pressBack();
      expect(screen.queryByTestId('leave-sheet')).toBeNull();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('timers', () => {
    const chipLabels = (index: number) =>
      within(screen.getByTestId(`item-chips-${index}`)).getAllByRole('radio').map((chip) => chip.props.accessibilityLabel);

    it('shows an open step’s times under its words: No timer, then the times, then ⋯', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [90],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });

      tapToEdit(1);
      layOutChips(1, [90, 30, 60, 120]);

      expect(chipLabels(1)).toEqual([
        'No timer', '30 seconds', '1 minute', '1 minute 30 seconds', '2 minutes',
      ]);
      expect(within(screen.getByTestId('item-chips-1')).getByRole('radio', { name: 'No timer' })).toBeChecked();
      expect(screen.getByTestId('item-more-1')).toHaveProp('accessibilityLabel', 'More timer lengths');
    });

    it('shows the times on a new step too', async () => {
      await renderEditor();
      fireEvent.press(screen.getByTestId('add-step'));
      layOutChips(0, [30, 60, 120, 300]);

      expect(chipLabels(0)).toEqual(['No timer', '30 seconds', '1 minute', '2 minutes', '5 minutes']);
    });

    it('sets a timer from a chip, keeps the step open with its times, and remembers the time', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [90],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });
      tapToEdit(1);
      layOutChips(1, [90, 30, 60, 120]);

      fireEvent.press(screen.getByTestId('item-chip-1-90'));
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 2 min timed');
      expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
      const chips = within(screen.getByTestId('item-chips-1'));
      expect(chips.getByRole('radio', { name: '1 minute 30 seconds' })).toBeChecked();

      // Tapping the chosen time again keeps it.
      fireEvent.press(screen.getByTestId('item-chip-1-90'));
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 2 min timed');
      await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [90] });
    });

    it('takes a timer off with No timer', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);

      fireEvent.press(screen.getByTestId('item-chip-0-none'));

      expect(screen.getByTestId('hero-count')).toHaveTextContent(/^2 steps$/);
      expect(within(screen.getByTestId('item-chips-0')).getByRole('radio', { name: 'No timer' })).toBeChecked();
      expect(screen.getByTestId('item-text-0')).toBeOnTheScreen();
    });

    it('opens a timed step from its time, like its words', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });

      fireEvent.press(screen.getByTestId('item-clock-0'));
      layOutChips(0, [30, 60, 120, 300]);

      expect(screen.getByTestId('item-text-0')).toBeOnTheScreen();
      expect(chipLabels(0)).toContain('30 seconds');
    });

    it('keeps the chips in place while they fold away with their step', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);

      fireEvent(screen.getByTestId('item-text-0'), 'submitEditing');

      // Folding takes a moment; the chips fold with ⋯ rather than vanishing.
      expect(screen.queryByTestId('item-text-0')).toBeNull();
      expect(screen.getAllByTestId(/^item-chip-0-/, HIDDEN).map((chip) => chip.props.testID)).toEqual([
        'item-chip-0-none', 'item-chip-0-30', 'item-chip-0-60', 'item-chip-0-120', 'item-chip-0-300',
      ]);
    });

    it('keeps the step’s own time among its chips', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [600, 700, 800, 900],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });

      tapToEdit(0);
      layOutChips(0, [30, 600, 700, 800]);

      expect(screen.getByTestId('item-chip-0-30')).toBeOnTheScreen();
      expect(screen.getByTestId('item-more-0')).toHaveProp('accessibilityLabel', 'More timer lengths');
    });

    it('drops the oldest times so the chips stay on one line', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [1215, 1335, 1455, 1545],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });

      tapToEdit(1);
      // No timer (70 + 4), four 62 dp chips with three 4 dp gaps, and ⋯ (44 + 4)
      // need 382 dp.
      layOutChips(1, [1215, 1335, 1455, 1545], 62, 381, 70);

      expect(chipLabels(1)).toHaveLength(4);
      expect(chipLabels(1)[0]).toBe('No timer');
      expect(screen.queryByTestId('item-chip-1-1545')).toBeNull();
    });

    it('steps the timer in the panel, clears it with No timer, and remembers a changed time on Done', async () => {
      const preferences = new MemoryDevicePreferenceStore();
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });
      tapToEdit(1);
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('item-more-1'));
      layOutPanelChips([30, 60, 120, 300]);
      const press = (id: string) => {
        fireEvent(screen.getByTestId(id), 'pressIn');
        fireEvent(screen.getByTestId(id), 'pressOut');
      };

      expect(screen.getByTestId('timer-readout')).toHaveTextContent('Off');
      press('timer-plus');
      press('timer-plus');
      press('timer-minus');
      expect(screen.getByTestId('timer-readout')).toHaveTextContent('1 min 45s');
      expect(screen.getByText('+5s')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('timer-none'));
      expect(screen.getByTestId('timer-readout')).toHaveTextContent('Off');
      fireEvent.press(screen.getByTestId('panel-chip-120'));
      expect(screen.getByTestId('timer-readout')).toHaveTextContent('2 min');

      fireEvent.press(screen.getByTestId('timer-done'));
      expect(screen.queryByTestId('timer-panel')).toBeNull();
      // Back to typing, with the step's times showing its new one. They're the
      // same four times, so the phone doesn't lay their chips out again.
      expect(screen.getByTestId('item-text-1')).toBeOnTheScreen();
      expect(within(screen.getByTestId('item-chips-1')).getByRole('radio', { name: '2 minutes' })).toBeChecked();
      await waitFor(async () => {
        await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [120] });
      });
    });

    it('lets minus take a timer to Off', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('item-more-0'));

      fireEvent(screen.getByTestId('timer-minus'), 'pressIn');
      fireEvent(screen.getByTestId('timer-minus'), 'pressOut');

      expect(screen.getByTestId('timer-readout')).toHaveTextContent('Off');
    });
  });

  describe('deleting', () => {
    it('leaves an UNDO in a deleted step’s place, and saves the deletion only with Save', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      act(() => {
        fireEvent(screen.getByTestId('item-label-0'), 'accessibilityAction', {
          nativeEvent: { actionName: 'delete' },
        });
      });
      expect(screen.getByText('Step deleted')).toBeOnTheScreen();
      expect(screen.getByTestId('item-label-0')).toHaveTextContent('Breathe');
      expect((await getRoutine(database, routine.id))?.steps).toHaveLength(2);

      fireEvent.press(screen.getByRole('button', { name: 'Undo deleting this step' }));
      expect(screen.getByTestId('item-label-0')).toHaveTextContent('Neck rolls');
      expect(screen.getByTestId('item-clock-0')).toHaveTextContent('30s');
    });

    it('deletes a step swiped left past 40% of its width', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });
      const row = screen.getByTestId('item-row-0');
      fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 56 } } });

      // Android reports no movement in a swipe's first update after it starts.
      fireGestureHandler(getByGestureTestId(`item-swipe-gesture-${row.props.nativeID}-0`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: -60 },
        { state: State.ACTIVE, translationX: -200 },
        { state: State.END, translationX: -200 },
      ]);

      expect(await screen.findByText('Step deleted')).toBeOnTheScreen();
      expect(screen.getByTestId('item-label-0')).toHaveTextContent('Breathe');
    });

    it('deletes the routine from its sheet and hands back what undoes it', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      const { onDeleted } = await renderEditor({ initialRoutine: routine }, { database });

      fireEvent.press(screen.getByTestId('editor-delete'));
      expect(screen.getByText('Delete this routine?')).toBeOnTheScreen();
      expect(screen.getByText('“Morning stretch” and its steps will be gone.')).toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByTestId('delete-confirm'));
      });

      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
      expect(onDeleted.mock.calls[0][0].routine).toEqual(routine);
      expect(await getRoutine(database, routine.id)).toBeNull();
    });

    it('keeps the editor and says so when deleting the routine fails', async () => {
      const alert = jest.spyOn(Alert, 'alert');
      const database = await setupDb();
      const routine = await existing(database);
      const failing: Database = {
        ...database,
        withTransactionAsync: (task) =>
          database.withTransactionAsync((transaction) =>
            task({
              ...transaction,
              async runAsync(sql, ...params) {
                if (sql.includes('DELETE FROM routines')) throw new Error('simulated delete failure');
                return transaction.runAsync(sql, ...params);
              },
            })),
      };
      const { onDeleted } = await renderEditor({ initialRoutine: routine }, { database: failing });
      fireEvent.changeText(screen.getByTestId('title-input'), 'Unsaved');

      fireEvent.press(screen.getByTestId('editor-delete'));
      await act(async () => {
        fireEvent.press(screen.getByTestId('delete-confirm'));
      });

      await waitFor(() => expect(alert).toHaveBeenCalledWith('Delete failed', expect.any(String)));
      expect(onDeleted).not.toHaveBeenCalled();
      expect(screen.getByTestId('title-input').props.value).toBe('Unsaved');
    });
  });

  describe('play, color and TalkBack', () => {
    it('offers ▶ in the top bar for a saved routine, and starts a run from it', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      const { onRun } = await renderEditor({ initialRoutine: routine }, { database });

      expect(screen.getAllByRole('button', { name: 'Start a run' })).toHaveLength(1);
      fireEvent.press(screen.getByTestId('bar-play'));

      expect(onRun).toHaveBeenCalledWith(routine);
    });

    it('hides ▶ while there are unsaved changes, and when the routine can’t run', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });
      fireEvent.changeText(screen.getByTestId('title-input'), 'Ready');
      expect(screen.queryByRole('button', { name: 'Start a run' })).toBeNull();
      fireEvent.changeText(screen.getByTestId('title-input'), 'Morning stretch');
      expect(screen.getByRole('button', { name: 'Start a run' })).toBeOnTheScreen();
      screen.unmount();

      const empty = await existing(database, { steps: [] });
      await renderEditor({ initialRoutine: empty }, { database });
      expect(screen.queryByRole('button', { name: 'Start a run' })).toBeNull();
      screen.unmount();

      await renderEditor();
      fireEvent.changeText(screen.getByTestId('title-input'), 'Night');
      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('item-text-0'), 'Lights off');
      expect(screen.queryByRole('button', { name: 'Start a run' })).toBeNull();
    });

    it('saves the color picked on the card', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      fireEvent.press(screen.getByTestId('hero-color-dot'));
      fireEvent.press(screen.getByTestId('swatch-slate'));
      expect(screen.getByTestId('title-input')).toBeOnTheScreen();
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: 'Save changes' }));
      });

      await waitFor(async () => expect((await getRoutine(database, routine.id))?.colorKey).toBe('slate'));
    });

    it('lets TalkBack move a step earlier', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      act(() => {
        fireEvent(screen.getByTestId('item-label-1'), 'accessibilityAction', {
          nativeEvent: { actionName: 'moveEarlier' },
        });
      });

      expect(screen.getByTestId('item-label-0')).toHaveTextContent('Breathe');
      expect(screen.getByTestId('item-label-0').props.accessibilityActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Move earlier' }),
          expect.objectContaining({ label: 'Move later' }),
          expect.objectContaining({ label: 'Delete step' }),
        ]),
      );
    });
  });
});
