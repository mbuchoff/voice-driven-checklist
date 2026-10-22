import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { Alert, BackHandler, Platform } from 'react-native';
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
function layOutChips(index: number, times: number[], chipWidth = 40, room = 330) {
  fireEvent(screen.getByTestId(`chips-room-${index}`, HIDDEN), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: room + 10, height: 52 } },
  });
  for (const time of times) {
    fireEvent(screen.getByTestId(`chip-measure-${index}-${time}`, HIDDEN), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: chipWidth, height: 36 } },
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

    it('gives an emptied existing step back its words when it is closed', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      tapToEdit(1);
      fireEvent.changeText(screen.getByTestId('item-text-1'), '');
      fireEvent.press(screen.getByTestId('item-done-1'));

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

      fireEvent.press(screen.getByTestId('item-clock-1'));
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('item-more-1'));
      expect(screen.getByTestId('timer-panel')).toBeOnTheScreen();
      fireEvent(screen.getByTestId('timer-plus'), 'pressIn');
      fireEvent(screen.getByTestId('timer-plus'), 'pressOut');

      pressBack();
      expect(screen.queryByTestId('timer-panel')).toBeNull();
      expect(screen.getByTestId('item-clock-1')).toHaveTextContent('1m');

      pressBack();
      expect(screen.getByText('Save your changes?')).toBeOnTheScreen();
      pressBack();
      expect(screen.queryByTestId('leave-sheet')).toBeNull();
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('timers', () => {
    it('sets a timer from a chip, keeps it when its chip is tapped again, and remembers the time', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [90],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });

      fireEvent.press(screen.getByTestId('item-clock-1'));
      layOutChips(1, [90, 30, 60, 120]);
      const chips = within(screen.getByTestId('item-chips-1'));
      expect(chips.getAllByRole('radio').map((chip) => chip.props.accessibilityLabel)).toEqual([
        '30 seconds', '1 minute', '1 minute 30 seconds', '2 minutes',
      ]);

      fireEvent.press(screen.getByTestId('item-chip-1-90'));
      expect(screen.getByTestId('item-clock-1')).toHaveTextContent('1m 30s');
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 2 min timed');

      fireEvent.press(screen.getByTestId('item-clock-1'));
      layOutChips(1, [90, 30, 60, 120]);
      fireEvent.press(screen.getByTestId('item-chip-1-90'));
      expect(screen.getByTestId('item-clock-1')).toHaveTextContent('1m 30s');
      await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [90] });
    });

    it('keeps the step’s own time among its chips', async () => {
      const preferences = new MemoryDevicePreferenceStore({
        ...DEFAULT_DEVICE_PREFERENCES,
        recentTimerSeconds: [600, 700, 800, 900],
      });
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });

      fireEvent.press(screen.getByTestId('item-clock-0'));
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

      fireEvent.press(screen.getByTestId('item-clock-1'));
      // Four 62 dp chips, three 4 dp gaps and ⋯ (36 + 4) need 300 dp.
      layOutChips(1, [1215, 1335, 1455, 1545], 62, 299);

      expect(within(screen.getByTestId('item-chips-1')).getAllByRole('radio')).toHaveLength(3);
      expect(screen.queryByTestId('item-chip-1-1545')).toBeNull();
    });

    it('steps the timer in the panel, clears it with No timer, and remembers a changed time on Done', async () => {
      const preferences = new MemoryDevicePreferenceStore();
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });
      fireEvent.press(screen.getByTestId('item-clock-1'));
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
      expect(screen.getByTestId('item-clock-1')).toHaveTextContent('2m');
      await waitFor(async () => {
        await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [120] });
      });
    });

    it('lets minus take a timer to Off', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      fireEvent.press(screen.getByTestId('item-clock-0'));
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
