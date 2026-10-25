import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { BackHandler, Keyboard, Platform, TextInput } from 'react-native';

import {
  existing,
  layOutChips,
  renderEditor,
  setupEditorDatabase as setupDb,
  tapToEdit,
} from './RoutineEditor.testSupport';
import { getRoutine } from './repository';
import type { Routine } from './types';

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
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
      fireEvent.changeText(screen.getByTestId('step-text-0'), 'Lights off');
      expect(create()).toBeEnabled();
    });

    it('creates the routine with its color, trimmed words and timers, dropping blank steps', async () => {
      const { database, onSaved } = await renderEditor({ newColorKey: 'slate' });
      fireEvent.changeText(screen.getByTestId('title-input'), '  Night  ');
      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('step-text-0'), ' Lights off ');
      fireEvent(screen.getByTestId('step-text-0'), 'submitEditing');
      fireEvent.changeText(screen.getByTestId('step-text-1'), '   ');

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
      fireEvent.changeText(screen.getByTestId('step-text-0'), 'P');
      expect(screen.getByTestId('hero-count')).toHaveTextContent('1 step');
    });
  });

  describe('typing steps', () => {
    it('keeps a new step with words on Enter and opens another; Enter on a blank new step removes it', async () => {
      await renderEditor();
      fireEvent.press(screen.getByTestId('add-step'));
      fireEvent.changeText(screen.getByTestId('step-text-0'), 'Stretch');

      fireEvent(screen.getByTestId('step-text-0'), 'submitEditing');
      expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Stretch');

      fireEvent(screen.getByTestId('step-text-1'), 'submitEditing');
      expect(screen.queryByTestId('step-row-1')).toBeNull();
      expect(screen.queryByTestId('step-text-0')).toBeNull();
    });

    // On Android, when the focused field disappears, focus jumps to the next
    // focusable view (often the name) and the keyboard stays up. So the
    // keyboard has to be let go of while the open step's field is still there.
    describe('lets go of the keyboard before the open step’s field goes away', () => {
      /** For each Keyboard.dismiss(), the step field that was still on screen. */
      function fieldsAtDismiss() {
        const fields: (string | null)[] = [];
        jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {
          fields.push(screen.queryAllByTestId(/^step-text-/)[0]?.props.testID ?? null);
        });
        return fields;
      }

      it('on Enter in an existing step', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);
        const fields = fieldsAtDismiss();

        fireEvent(screen.getByTestId('step-text-1'), 'submitEditing');

        expect(fields).toEqual(['step-text-1']);
        expect(screen.queryByTestId('step-text-1')).toBeNull();
      });

      it('on Enter in a blank new step', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        fireEvent.press(screen.getByTestId('add-step'));
        const fields = fieldsAtDismiss();

        fireEvent(screen.getByTestId('step-text-2'), 'submitEditing');

        expect(fields).toEqual(['step-text-2']);
        expect(screen.queryByTestId('step-row-2')).toBeNull();
      });
    });

    /** For each focus request: the field asked, and the step fields then on screen. */
    function focusRequests() {
      const requests: { field: string; stepFields: string[] }[] = [];
      jest.spyOn(TextInput.prototype, 'focus').mockImplementation(function (this: TextInput) {
        requests.push({
          field: (this.props as { testID?: string }).testID ?? '',
          stepFields: screen.queryAllByTestId(/^step-text-/).map((field) => field.props.testID),
        });
      });
      return requests;
    }

    // Android ignores a request to show the keyboard for a field it hasn't
    // laid out yet, so a hidden holder that's already there takes focus during
    // the tap, and the step's field takes it over once it exists.
    describe('raises the keyboard during the tap that opens a step', () => {
      it('on a step’s words', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        const requests = focusRequests();

        tapToEdit(1);

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: [] });
        expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      });

      it('on a step’s time', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        const requests = focusRequests();

        fireEvent.press(screen.getByTestId('step-clock-0'));

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: [] });
      });

      it('on +', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        const requests = focusRequests();

        fireEvent.press(screen.getByTestId('add-step'));

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: [] });
        expect(screen.getByTestId('step-text-2')).toBeOnTheScreen();
      });
    });

    it('gives the keyboard to the opened step’s field once it’s there', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      const requests = focusRequests();

      tapToEdit(1);
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      expect(requests.map(({ field }) => field)).toEqual(['keyboard-holder', 'step-text-1']);
    });

    it('keeps a step open while the timer panel is up, and goes back to typing in it after', async () => {
      const database = await setupDb();
      await renderEditor({ initialRoutine: await existing(database) }, { database });
      tapToEdit(1);
      layOutChips(1, [30, 60, 120, 300]);
      fireEvent.press(screen.getByTestId('step-more-1'));
      // Its field lets go of the keyboard for the panel.
      fireEvent(screen.getByTestId('step-text-1'), 'blur');
      await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
      expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      const requests = focusRequests();

      fireEvent.press(screen.getByTestId('timer-done'));
      await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
      expect(requests.map(({ field }) => field)).toContain('step-text-1');
    });

    // Moving to another step keeps the keyboard up. On Android, the moment the
    // focused field goes away, another field (the name) takes focus and shows
    // it, so the holder takes the keyboard while the old field is there.
    describe('hands the keyboard to another step without the name taking it on the way', () => {

      it('on Enter in a new step with words', async () => {
        await renderEditor();
        fireEvent.press(screen.getByTestId('add-step'));
        fireEvent.changeText(screen.getByTestId('step-text-0'), 'Stretch');
        const requests = focusRequests();
        const dismiss = jest.spyOn(Keyboard, 'dismiss');

        fireEvent(screen.getByTestId('step-text-0'), 'submitEditing');

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['step-text-0'] });
        expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
        expect(dismiss).not.toHaveBeenCalled();
      });

      it('when another step is tapped', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(0);
        const requests = focusRequests();
        const dismiss = jest.spyOn(Keyboard, 'dismiss');

        tapToEdit(1);

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['step-text-0'] });
        expect(screen.getByTestId('step-text-1')).toBeOnTheScreen();
        expect(dismiss).not.toHaveBeenCalled();
      });

      it('when another step’s time is tapped', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);
        const requests = focusRequests();

        fireEvent.press(screen.getByTestId('step-clock-0'));

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['step-text-1'] });
        expect(screen.getByTestId('step-text-0')).toBeOnTheScreen();
      });

      it('when another step is tapped while a blank new step goes away', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        fireEvent.press(screen.getByTestId('add-step'));
        const requests = focusRequests();

        tapToEdit(0);

        expect(requests).toContainEqual({ field: 'keyboard-holder', stepFields: ['step-text-2'] });
        expect(screen.getByTestId('step-text-0')).toBeOnTheScreen();
        expect(screen.queryByTestId('step-row-2')).toBeNull();
      });

      it('still closes the open step when you tap the name yourself', async () => {
        const database = await setupDb();
        await renderEditor({ initialRoutine: await existing(database) }, { database });
        tapToEdit(1);

        fireEvent(screen.getByTestId('title-input'), 'focus');

        expect(screen.queryByTestId('step-text-1')).toBeNull();
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
      fireEvent.changeText(screen.getByTestId('step-text-1'), '');
      fireEvent(screen.getByTestId('step-text-1'), 'submitEditing');

      expect(screen.getByTestId('step-label-1')).toHaveTextContent('Breathe');
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
      fireEvent.press(screen.getByTestId('step-more-1'));
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
      fireEvent.changeText(screen.getByTestId('step-text-0'), 'Lights off');
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
        fireEvent(screen.getByTestId('step-label-1'), 'accessibilityAction', {
          nativeEvent: { actionName: 'moveEarlier' },
        });
      });

      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Breathe');
      expect(screen.getByTestId('step-label-0').props.accessibilityActions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Move earlier' }),
          expect.objectContaining({ label: 'Move later' }),
          expect.objectContaining({ label: 'Delete step' }),
        ]),
      );
    });
  });
});
