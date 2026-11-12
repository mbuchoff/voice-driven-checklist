import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Reanimated from 'react-native-reanimated';

import type { Database } from '@/src/db/database';

import {
  existing,
  renderEditor,
  setupEditorDatabase as setupDb,
} from './RoutineEditor.testSupport';
import { getRoutine } from './repository';

describe('RoutineEditor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  describe('deleting', () => {
    it('leaves an UNDO in a deleted step’s place, and saves the deletion only with Save', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });

      act(() => {
        fireEvent(screen.getByTestId('step-label-0'), 'accessibilityAction', {
          nativeEvent: { actionName: 'delete' },
        });
      });
      expect(screen.getByText('Step deleted')).toBeOnTheScreen();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Breathe');
      expect((await getRoutine(database, routine.id))?.steps).toHaveLength(2);

      fireEvent.press(screen.getByRole('button', { name: 'Undo deleting this step' }));
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Neck rolls');
      expect(screen.getByTestId('step-clock-0')).toHaveTextContent('30s');
    });

    describe('the UNDO in a deleted step’s place', () => {
      const deleteFirst = () => act(() => {
        fireEvent(screen.getByTestId('step-label-0'), 'accessibilityAction', {
          nativeEvent: { actionName: 'delete' },
        });
      });
      let renderAgain: () => void;
      const undoHeight = () => {
        renderAgain();
        return StyleSheet.flatten(screen.getByTestId('deleted-step-0').props.style).height;
      };

      it('closes up after 5 seconds and the step stays deleted', async () => {
        const database = await setupDb();
        ({ renderAgain } = await renderEditor({ initialRoutine: await existing(database) }, { database }));
        jest.useFakeTimers();
        try {
          deleteFirst();
          act(() => jest.advanceTimersByTime(4900));
          expect(screen.getByText('Step deleted')).toBeOnTheScreen();
          expect(undoHeight()).toBeGreaterThan(0);

          act(() => jest.advanceTimersByTime(400));

          expect(screen.queryByText('Step deleted')).toBeNull();
          expect(screen.getByTestId('step-label-0')).toHaveTextContent('Breathe');
        } finally {
          jest.useRealTimers();
        }
      });

      it('gives a step deleted again, after UNDO while it closed up, its full 5 seconds', async () => {
        const database = await setupDb();
        ({ renderAgain } = await renderEditor({ initialRoutine: await existing(database) }, { database }));
        // Each close-up ends when the test says.
        const closeUps: ((finished: boolean) => void)[] = [];
        jest.spyOn(Reanimated, 'withTiming').mockImplementation(((value, _config, callback) => {
          if (callback) closeUps.push(callback);
          return value;
        }) as typeof Reanimated.withTiming);
        jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
        try {
          deleteFirst();
          act(() => jest.advanceTimersByTime(5000));
          expect(undoHeight()).toBe(0);
          fireEvent.press(screen.getByRole('button', { name: 'Undo deleting this step' }));
          expect(screen.getByTestId('step-label-0')).toHaveTextContent('Neck rolls');

          deleteFirst();
          // The first close-up, cut short by UNDO, ends now: it leaves the new UNDO be.
          await act(async () => closeUps.forEach((end) => end(true)));
          act(() => jest.advanceTimersByTime(4900));

          expect(screen.getByText('Step deleted')).toBeOnTheScreen();
          expect(undoHeight()).toBeGreaterThan(0);
          act(() => jest.advanceTimersByTime(100));
          await act(async () => closeUps.at(-1)?.(true));
          expect(screen.queryByText('Step deleted')).toBeNull();
        } finally {
          jest.useRealTimers();
          jest.restoreAllMocks();
        }
      });
    });

    it('deletes a step swiped left past 40% of its width', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });
      const row = screen.getByTestId('step-row-0');
      fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 56 } } });

      // Android reports no movement in a swipe's first update after it starts.
      fireGestureHandler(getByGestureTestId(`step-swipe-gesture-${row.props.nativeID}-0`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: 0 },
        { state: State.ACTIVE, translationX: -60 },
        { state: State.ACTIVE, translationX: -200 },
        { state: State.END, translationX: -200 },
      ]);

      expect(await screen.findByText('Step deleted')).toBeOnTheScreen();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Breathe');
    });

    it('keeps a step whose swipe is cancelled, even past 40% of its width', async () => {
      const database = await setupDb();
      const routine = await existing(database);
      await renderEditor({ initialRoutine: routine }, { database });
      const row = screen.getByTestId('step-row-0');
      fireEvent(row, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 380, height: 56 } } });

      fireGestureHandler(getByGestureTestId(`step-swipe-gesture-${row.props.nativeID}-0`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -60 },
        { state: State.ACTIVE, translationX: -200 },
        { state: State.CANCELLED, translationX: -200 },
      ]);
      await act(() => new Promise((resolve) => setTimeout(resolve, 400)));

      expect(screen.queryByText('Step deleted')).toBeNull();
      expect(screen.getByTestId('step-label-0')).toHaveTextContent('Neck rolls');
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
});
