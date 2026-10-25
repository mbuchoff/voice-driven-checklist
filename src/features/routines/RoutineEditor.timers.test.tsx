import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import {
  DEFAULT_DEVICE_PREFERENCES,
  MemoryDevicePreferenceStore,
} from '@/src/features/settings/preferences';

import {
  existing,
  HIDDEN,
  layOutChips,
  layOutPanelChips,
  renderEditor,
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './RoutineEditor.testSupport';

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('timers', () => {
    const chipLabels = (index: number) =>
      within(screen.getByTestId(`step-chips-${index}`)).getAllByRole('radio').map((chip) => chip.props.accessibilityLabel);

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
      expect(within(screen.getByTestId('step-chips-1')).getByRole('radio', { name: 'No timer' })).toBeChecked();
      expect(screen.getByTestId('step-more-1')).toHaveProp('accessibilityLabel', 'More timer lengths');
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

      fireEvent.press(screen.getByTestId('step-chip-1-90'));
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 2 min timed');
      expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      const chips = within(screen.getByTestId('step-chips-1'));
      expect(chips.getByRole('radio', { name: '1 minute 30 seconds' })).toBeChecked();

      // Tapping the chosen time again keeps it.
      fireEvent.press(screen.getByTestId('step-chip-1-90'));
      expect(screen.getByTestId('hero-count')).toHaveTextContent('2 steps · 2 min timed');
      await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [90] });
    });

    it('takes a timer off with No timer', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);

      fireEvent.press(screen.getByTestId('step-chip-0-none'));

      expect(screen.getByTestId('hero-count')).toHaveTextContent(/^2 steps$/);
      expect(within(screen.getByTestId('step-chips-0')).getByRole('radio', { name: 'No timer' })).toBeChecked();
      expect(screen.getByTestId('step-text-0')).toBeOnTheScreen();
    });

    it('opens a timed step from its time, like its words', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });

      fireEvent.press(screen.getByTestId('step-clock-0'));
      layOutChips(0, [30, 60, 120, 300]);

      expect(screen.getByTestId('step-text-0')).toBeOnTheScreen();
      expect(chipLabels(0)).toContain('30 seconds');
    });

    it('keeps the chips in place while they fold away with their step', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);

      fireEvent(screen.getByTestId('step-text-0'), 'submitEditing');

      // Folding takes a moment; the chips fold with ⋯ rather than vanishing.
      expect(screen.queryByTestId('step-text-0')).toBeNull();
      expect(screen.getAllByTestId(/^step-chip-0-/, HIDDEN).map((chip) => chip.props.testID)).toEqual([
        'step-chip-0-none', 'step-chip-0-30', 'step-chip-0-60', 'step-chip-0-120', 'step-chip-0-300',
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

      expect(screen.getByTestId('step-chip-0-30')).toBeOnTheScreen();
      expect(screen.getByTestId('step-more-0')).toHaveProp('accessibilityLabel', 'More timer lengths');
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
      expect(screen.queryByTestId('step-chip-1-1545')).toBeNull();
    });

    it('steps the timer once for each TalkBack activation of − or +', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(1);
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-more-1'));
      const activate = (id: string) =>
        fireEvent(screen.getByTestId(id), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });

      activate('timer-plus');
      activate('timer-plus');
      activate('timer-minus');

      expect(screen.getByTestId('timer-readout')).toHaveTextContent('1 min 45s');
    });

    it('steps the timer in the panel, clears it with No timer, and remembers a changed time on Done', async () => {
      const preferences = new MemoryDevicePreferenceStore();
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database, preferences });
      tapToEdit(1);
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-more-1'));
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
      expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      expect(within(screen.getByTestId('step-chips-1')).getByRole('radio', { name: '2 minutes' })).toBeChecked();
      await waitFor(async () => {
        await expect(preferences.load()).resolves.toMatchObject({ recentTimerSeconds: [120] });
      });
    });

    it('does nothing when the panel’s selected quick pick is tapped again', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-more-0'));
      layOutPanelChips([30, 60, 120, 300]);
      const press = (id: string) => {
        fireEvent(screen.getByTestId(id), 'pressIn');
        fireEvent(screen.getByTestId(id), 'pressOut');
      };
      press('timer-plus');
      press('timer-minus');
      press('timer-minus');
      expect(screen.getByTestId('timer-readout')).toHaveTextContent('1 min');
      expect(screen.getByText('+5s')).toBeOnTheScreen();

      fireEvent.press(screen.getByTestId('panel-chip-60'));

      expect(screen.getByTestId('timer-readout')).toHaveTextContent('1 min');
      expect(screen.getByText('+5s')).toBeOnTheScreen();
    });

    it('lets minus take a timer to Off', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(0);
      layOutChips(0, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-more-0'));

      fireEvent(screen.getByTestId('timer-minus'), 'pressIn');
      fireEvent(screen.getByTestId('timer-minus'), 'pressOut');

      expect(screen.getByTestId('timer-readout')).toHaveTextContent('Off');
    });
  });
});
